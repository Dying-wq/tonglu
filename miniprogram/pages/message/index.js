const {
  getConversationOverview,
  getUnreadCount,
  formatMessageTime,
  deleteConversation,
  markConversationUnread
} = require('../../utils/cloud-api');
const { setMessageBadge } = require('../../utils/badge');

// 左滑露出的两个按钮总宽度（每个 84px），与 index.wxss 里的 .swipe-action 宽度对应
const ACTION_WIDTH = 168;

// 消息页轮询间隔。聊天页是 3 秒（消息密度高），列表页 5 秒足够，
// 再快只会增加云函数调用量而用户感知不到差别。
const POLL_INTERVAL = 5000;

Page({
  data: {
    // 不再用 mock-data 的演示会话兜底：那些「热心大叔」「旅者小李」是写死的假记录，
    // 点进去没有真实消息，还会让人以为拉黑后会话仍然存在。
    conversations: [],
    loading: true,
    tabs: ['全部', '私聊', '订单', '报名', '系统', '举报'],
    activeTab: 0,
    unreadCount: 0,
    // 当前左滑打开的那一条，-1 表示都关着
    swipeIndex: -1,
    // 同时记录会话 id：轮询刷新后列表顺序可能因为新消息变化，
    // 只记索引会把展开状态套到另一条会话上。
    swipeId: ''
  },

  onShow() {
    this.loadConversations();
    this.startPolling();
  },

  onHide() {
    this.stopPolling();
  },

  onUnload() {
    this.stopPolling();
  },

  // 轮询而不是靠 onShow：用户停留在消息页等对方回复时，
  // 新消息进来必须自己冒出来，否则要手动切页面才看得到。
  startPolling() {
    this.stopPolling();
    this.poller = setInterval(() => this.loadConversations({ silent: true }), POLL_INTERVAL);
  },

  stopPolling() {
    if (this.poller) {
      clearInterval(this.poller);
      this.poller = null;
    }
  },

  async loadConversations(options = {}) {
    // 用户手指还按在列表上时不刷新，否则滑到一半整个列表被替换、按钮弹回去
    if (this.touchingIndex !== undefined) return;

    const overview = await getConversationOverview();
    let unreadCount = overview.unreadTotal;

    // -1 表示云端还是旧版（没返回 unreadTotal），退回单独查询
    if (unreadCount < 0) {
      unreadCount = await getUnreadCount();
    }

    const conversations = (overview.conversations || []).map((item, index) => ({
      ...item,
      // 云函数返回的 lastMessageAt 是 Date，经 JSON 序列化后变成
      // "2026-11-06T04:48:22.483Z" 这种原始字符串，直接显示很难看
      lastMessageTime: formatMessageTime(item.lastMessageAt),
      offset: 0,
      dragging: false
    }));

    // 刷新后恢复左滑展开状态，否则每 5 秒弹回一次，按钮根本点不到。
    // 按会话 id 而不是索引找回：轮询期间如果来了新消息，列表会重排，
    // 用索引会把展开状态套到另一条会话上。
    const swipeId = this.data.swipeId;
    let swipeIndex = -1;
    if (swipeId) {
      swipeIndex = conversations.findIndex((item) => item.id === swipeId);
      if (swipeIndex >= 0) {
        conversations[swipeIndex].offset = -ACTION_WIDTH;
      }
    }

    this.setData({
      conversations,
      loading: false,
      unreadCount,
      swipeIndex,
      swipeId: swipeIndex >= 0 ? swipeId : ''
    });
    setMessageBadge(unreadCount);
  },

  selectTab(event) {
    this.setData({
      activeTab: event.currentTarget.dataset.index
    });
  },

  // ================== 左滑交互 ==================

  onTouchStart(event) {
    const index = event.currentTarget.dataset.index;
    this.touchStartX = event.touches[0].clientX;
    this.touchStartY = event.touches[0].clientY;
    this.touchingIndex = index;
    this.isSwiping = false;
    this.startOffset = this.data.conversations[index]
      ? (this.data.conversations[index].offset || 0)
      : 0;
  },

  onTouchMove(event) {
    if (this.touchingIndex === undefined) return;

    const dx = event.touches[0].clientX - this.touchStartX;
    const dy = event.touches[0].clientY - this.touchStartY;

    // 纵向位移更大时判定为滚动列表，交还给页面，避免滑动列表时误触发左滑
    if (!this.isSwiping) {
      if (Math.abs(dy) > Math.abs(dx)) {
        this.touchingIndex = undefined;
        return;
      }
      // 小于这个位移当成点击，不做滑动，防止轻微抖动就露出按钮
      if (Math.abs(dx) < 6) return;
      this.isSwiping = true;
      // 拖动期间关掉过渡动画：带着 0.2s 过渡跟随手指会拖影，看起来像卡顿
      this.setData({
        [`conversations[${this.touchingIndex}].dragging`]: true
      });
    }

    let offset = this.startOffset + dx;
    if (offset > 0) offset = 0;
    if (offset < -ACTION_WIDTH) offset = -ACTION_WIDTH;

    this.setData({
      [`conversations[${this.touchingIndex}].offset`]: offset
    });
  },

  onTouchEnd() {
    if (this.touchingIndex === undefined) return;

    const index = this.touchingIndex;
    const current = this.data.conversations[index] || {};
    const offset = current.offset || 0;
    // 超过一半就吸附展开，否则弹回
    const shouldOpen = offset < -ACTION_WIDTH / 2;

    const updates = {
      [`conversations[${index}].offset`]: shouldOpen ? -ACTION_WIDTH : 0,
      [`conversations[${index}].dragging`]: false
    };

    // 同时只允许一条展开
    const previous = this.data.swipeIndex;
    if (previous >= 0 && previous !== index && this.data.conversations[previous]) {
      updates[`conversations[${previous}].offset`] = 0;
    }
    updates.swipeIndex = shouldOpen ? index : -1;
    updates.swipeId = shouldOpen ? (current.id || '') : '';

    this.setData(updates);
    this.touchingIndex = undefined;
    this.isSwiping = false;
  },

  closeSwipe() {
    const index = this.data.swipeIndex;
    if (index < 0) return;
    this.setData({
      [`conversations[${index}].offset`]: 0,
      swipeIndex: -1,
      swipeId: ''
    });
  },

  // ================== 左滑操作 ==================

  async doMarkUnread(event) {
    const index = event.currentTarget.dataset.index;
    const item = this.data.conversations[index];
    if (!item) return;

    const result = await markConversationUnread(item.id);
    if (!result || !result.ok) {
      wx.showToast({ title: (result && result.message) || '设置失败', icon: 'none' });
      return;
    }

    const unread = Math.max(1, Number(item.unread) || 0);
    this.setData({
      [`conversations[${index}].unread`]: unread,
      [`conversations[${index}].offset`]: 0,
      swipeIndex: -1,
      swipeId: ''
    });

    if (typeof result.unreadCount === 'number' && result.unreadCount >= 0) {
      this.setData({ unreadCount: result.unreadCount });
      setMessageBadge(result.unreadCount);
    } else {
      this.loadConversations({ silent: true });
    }

    wx.showToast({ title: '已标为未读', icon: 'none' });
  },

  doDelete(event) {
    const index = event.currentTarget.dataset.index;
    const item = this.data.conversations[index];
    if (!item) return;

    // 用回调式而不是 await wx.showModal：部分基础库不返回 { confirm }，
    // 会导致弹窗关了但什么都没发生，看起来像「点了没反应」。
    wx.showModal({
      title: '删除会话',
      content: '只删除你这边的会话，聊天记录和对方都不受影响。对方再发消息时会重新出现。',
      confirmText: '删除',
      confirmColor: '#E24B4A',
      success: async (res) => {
        if (!res || !res.confirm) return;

        const result = await deleteConversation(item.id);
        if (!result || !result.ok) {
          wx.showToast({ title: (result && result.message) || '删除失败', icon: 'none' });
          return;
        }

        const conversations = this.data.conversations.filter((_, i) => i !== index);
        this.setData({ conversations, swipeIndex: -1, swipeId: '' });
        wx.showToast({ title: '已删除', icon: 'none' });

        // 删掉的会话可能带着未读，角标要重新算
        this.loadConversations({ silent: true });
      },
      fail: () => {}
    });
  },

  // ================== 跳转 ==================

  goChat(event) {
    // 有会话处于展开状态时，这一次点击先用来收起，不跳转——
    // 否则用户想关掉按钮，结果进了聊天页。
    if (this.data.swipeIndex >= 0) {
      this.closeSwipe();
      return;
    }

    const { id, openid, name, avatar, avatarUrl, orderId } = event.currentTarget.dataset;
    // 把对方身份一并带过去：
    // peerOpenid 用来区分「我拉黑了对方」和「对方拉黑了我」，
    // 名字和头像用来在聊天页顶部显示「正在和谁聊」。
    const query = [
      `conversationId=${id}`,
      openid ? `peerOpenid=${encodeURIComponent(openid)}` : '',
      name ? `peerName=${encodeURIComponent(name)}` : '',
      avatar ? `peerAvatarText=${encodeURIComponent(avatar)}` : '',
      avatarUrl ? `peerAvatarUrl=${encodeURIComponent(avatarUrl)}` : '',
      orderId ? `orderId=${encodeURIComponent(orderId)}` : ''
    ].filter(Boolean).join('&');
    wx.navigateTo({
      url: `/pages/message/chat?${query}`
    });
  },


  // 点头像进对方只读主页，catchtap 已阻止冒泡，不会同时进聊天页
  goProfile(event) {
    const { openid } = event.currentTarget.dataset;
    if (!openid) return;
    wx.navigateTo({
      url: `/pages/user/profile-view/profile-view?openid=${encodeURIComponent(openid)}`
    });
  },

  // 订单会话的显式入口：过去只能从会话里猜路径，发布者找不到
  // 「接受接单 / 确认完成」在哪里。catchtap 阻止冒泡到卡片的 goChat。
  goOrder(event) {
    const { orderId, conversationId } = event.currentTarget.dataset;
    if (!orderId) {
      wx.showToast({ title: '暂无订单编号', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: `/pages/order-detail/order-detail?orderId=${encodeURIComponent(orderId)}&conversationId=${encodeURIComponent(conversationId || '')}`
    });
  },

  goSettings() {
    wx.navigateTo({
      url: '/pages/user/notification-settings'
    });
  }
});
//（注：内容由AI生成）
