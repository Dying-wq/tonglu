const { detectRiskKeywords } = require('../../utils/risk');
const {
  blockUser: blockUserApi,
  createOrGetConversation,
  getBlockRelations,
  getMessageList,
  getPostById,
  login,
  markConversationRead,
  reportConversationOrMessage,
  requestWechatExchange,
  sendMessage,
  unblockUser: unblockUserApi
} = require('../../utils/cloud-api');
const { applyUnreadCount } = require('../../utils/badge');

// URL 参数里的中文/头像地址是 encodeURIComponent 过的，解不开时按原值用
function decodeParam(value) {
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch (error) {
    return String(value);
  }
}

Page({
  data: {
    // 不再用 'demo_conversation' 兜底：会话 id 为空说明会话未建立，
    // 用假 id 去查消息只会拿到空结果，掩盖真实问题。
    conversationId: '',
    post: null,
    // 对方的显示信息：从会话列表进入时由 URL 带过来，
    // 从帖子进入时取帖子发布者，保证顶部显示的是「对方」而不是自己
    peerName: '',
    peerAvatarText: '',
    peerAvatarUrl: '',
    // 不再回退 mock-data 的演示消息：假消息会显示成「30 分钟前」这类
    // 固定时间，让用户误以为是真实聊天记录。
    messages: [],
    inputValue: '',
    riskWarning: '',
    pollingText: '',
    wechatExchangeStatus: '未交换',
    // 会话是否已被拉黑：拉黑后云端 sendMessage 会拒绝，前端同步禁用输入
    blocked: false,
    // 拉黑方向：true = 我拉黑了对方（可以自己取消）；
    // false = 对方拉黑了我（只能等对方解除）
    blockedByMe: false,
    // 对方 openid：从会话列表进入时由 query 传入，从帖子进入时取帖子发布者
    peerOpenid: '',
    loading: true,
    quickReplies: ['我可以，现在方便沟通吗？', '请问具体时间和地点是？', '我已到附近，稍等一下。']
  },

  onLoad(options = {}) {
    this.initChat(options);
    this.pollingTimer = setInterval(() => this.loadMessages(false), 3000);
  },

  onShow() {
    // 从后台切回来时补一次已读：这期间可能有新消息进来
    this.markReadAndSyncBadge();
  },

  onUnload() {
    clearInterval(this.pollingTimer);
  },

  async initChat(options) {
    await login();
    let conversationId = options.conversationId || '';
    let post = null;
    let peerOpenid = decodeParam(options.peerOpenid);
    let peerName = decodeParam(options.peerName);
    let peerAvatarText = decodeParam(options.peerAvatarText);
    let peerAvatarUrl = decodeParam(options.peerAvatarUrl);

    if (options.postId) {
      post = await getPostById(options.postId);
      const result = await createOrGetConversation({
        relatedType: 'post',
        relatedId: options.postId,
        postId: options.postId
      });
      conversationId = (result && result.conversationId) || conversationId;
      // 从帖子进来时，对方就是发布者
      peerOpenid = peerOpenid || (post && post.publisherOpenid) || '';
      peerName = peerName || (post && post.publisherName) || '';
      peerAvatarText = peerAvatarText || (post && post.publisherAvatarText) || '';
      peerAvatarUrl = peerAvatarUrl || (post && post.publisherAvatarUrl) || '';
    }

    this.setData({
      conversationId,
      post,
      peerOpenid,
      peerName,
      peerAvatarText: peerAvatarText || peerName.slice(0, 1),
      peerAvatarUrl
    });
    if (conversationId) {
      // 进会话即已读，并同步把 tabBar 红点减掉——
      // 原来只标记已读不刷角标，用户回到首页红点还是原数字，看着像没生效
      await this.markReadAndSyncBadge();
    }
    // 先判定拉黑状态，再拉消息：已拉黑的会话要直接显示禁用态，
    // 而不是让用户打一行字、点发送，才被云端告知发不出去。
    await this.refreshBlockState();
    this.loadMessages(true);
  },

  // 标记当前会话已读，并用云端返回的最新总未读数刷新 tabBar 角标
  async markReadAndSyncBadge() {
    const conversationId = this.data.conversationId;
    if (!conversationId) return;
    const result = await markConversationRead(conversationId);
    if (result && result.ok) {
      applyUnreadCount(result.unreadCount);
    }
  },

  // 从 blocks 集合反查当前会话的拉黑方向。
  // 云端不返回拉黑状态（conversations.status 只有 blocked/active，
  // 分不清是谁拉黑了谁），所以这里用双向名单比对。
  async refreshBlockState() {
    const peer = this.data.peerOpenid;
    if (!peer) return;
    const relations = await getBlockRelations();
    const blockedByMe = relations.blockedOpenids.indexOf(peer) !== -1;
    const blockedByPeer = relations.blockedByOpenids.indexOf(peer) !== -1;
    this.setData({
      blocked: blockedByMe || blockedByPeer,
      blockedByMe
    });
  },

  async loadMessages(showConnected) {
    if (!this.data.conversationId) {
      this.setData({ messages: [], loading: false, pollingText: '' });
      return;
    }
    const nextMessages = await getMessageList(this.data.conversationId);
    const list = nextMessages || [];
    // 页面开着的时候对方又发了消息，立刻再标一次已读：
    // 否则未读数会一直涨，用户明明在看却被红点追着。
    // 首次加载不算「新消息」——initChat 里已经标过已读了，不必重复调。
    const grew = this.messagesInitialized && list.length > this.data.messages.length;
    this.setData({
      // 云端没有消息就是空列表，由页面显示空状态
      messages: list,
      loading: false,
      pollingText: showConnected ? '已连接' : ''
    });
    this.messagesInitialized = true;
    if (grew && list.length) {
      this.markReadAndSyncBadge();
    }
  },

  goPost() {
    if (!this.data.post) return;
    wx.navigateTo({
      url: `/pages/service-detail/service-detail?id=${this.data.post.id}`
    });
  },

  updateInput(event) {
    const inputValue = event.detail.value;
    const risk = detectRiskKeywords(inputValue);
    this.setData({
      inputValue,
      riskWarning: risk.hasRisk ? `检测到风险词：${risk.keywords.join('、')}。平台不托管资金，请谨慎线下交易。` : ''
    });
  },

  useQuickReply(event) {
    if (this.data.blocked) return;
    this.setData({
      inputValue: event.currentTarget.dataset.text
    });
  },

  async sendText() {
    const content = this.data.inputValue.trim();
    if (!content) return;

    if (this.data.blocked) {
      wx.showToast({ title: '已拉黑该用户，无法发送', icon: 'none' });
      return;
    }
    if (!this.data.conversationId) {
      wx.showToast({ title: '会话未建立，请重新进入', icon: 'none' });
      return;
    }

    const risk = detectRiskKeywords(content);
    const result = await sendMessage({
      conversationId: this.data.conversationId,
      content,
      contentType: 'text'
    });

    // 云函数返回 ok:false 时必须让用户看到原因，
    // 否则表现就是「点了发送，消息没出现」，无法判断是网络问题还是被拦截。
    if (!result || result.ok === false) {
      const code = result && result.code;
      let message = (result && result.message) || '发送失败，请稍后重试';
      if (code === 'CONVERSATION_BLOCKED') {
        message = '该会话已被拉黑，无法继续发送';
        this.setData({ blocked: true });
        // 顺便查一次拉黑方向，好把按钮显示成「取消拉黑」还是「等待对方解除」
        this.refreshBlockState();
      } else if (result && result.offline) {
        message = '云服务未连接，消息未发送';
      }
      wx.showToast({ title: message, icon: 'none' });
      return;
    }

    const localMessage = {
      id: `msg_${Date.now()}`,
      sender: 'me',
      content,
      contentType: 'text',
      createdAt: '刚刚',
      riskStatus: risk.hasRisk ? 'warning' : 'safe'
    };
    this.setData({
      messages: this.data.messages.concat(localMessage),
      inputValue: '',
      riskWarning: ''
    });
    // 拉一次云端，保证消息顺序与服务端一致
    this.loadMessages(false);
  },

  async requestWechat() {
    const result = await requestWechatExchange(this.data.conversationId);
    this.setData({
      wechatExchangeStatus: result && result.ok ? '已发送微信交换请求，等待对方同意' : '微信交换请求未发送成功'
    });
  },

  async reportConversation() {
    const result = await reportConversationOrMessage({
      conversationId: this.data.conversationId,
      targetType: 'conversation',
      reason: '聊天内容违规'
    });
    wx.showToast({
      title: result && result.ok ? '已提交举报' : '举报未提交成功',
      icon: 'none'
    });
  },

  async blockUser() {
    const confirm = await new Promise((resolve) => {
      wx.showModal({
        title: '拉黑该用户',
        content: '拉黑后双方将无法继续发送消息，确定继续吗？',
        confirmText: '拉黑',
        confirmColor: '#EB5757',
        success: (res) => resolve(Boolean(res && res.confirm)),
        fail: () => resolve(false)
      });
    });
    if (!confirm) return;

    const result = await blockUserApi({
      conversationId: this.data.conversationId,
      reason: '用户主动拉黑'
    });

    if (result && result.ok) {
      this.setData({ blocked: true, blockedByMe: true, inputValue: '' });
      wx.showToast({ title: '已拉黑，双方无法再发消息', icon: 'none' });
      return;
    }

    // 拉黑失败要说清原因：常见是 blocks 集合未创建
    const message = (result && result.message) || '拉黑失败，请检查 blocks 集合是否已创建';
    wx.showToast({ title: message, icon: 'none' });
  },

  // 取消拉黑：恢复 blocks 记录与会话状态，双方可以重新发消息。
  // 只对自己发起的拉黑有效；对方拉黑我时云端返回 NO_ACTIVE_BLOCK。
  async unblock() {
    const confirm = await new Promise((resolve) => {
      wx.showModal({
        title: '取消拉黑',
        content: '取消后双方可以重新发送消息，确定继续吗？',
        confirmText: '取消拉黑',
        success: (res) => resolve(Boolean(res && res.confirm)),
        fail: () => resolve(false)
      });
    });
    if (!confirm) return;

    const result = await unblockUserApi({
      conversationId: this.data.conversationId,
      targetOpenid: this.data.peerOpenid
    });

    if (result && result.ok) {
      this.setData({ blocked: false, blockedByMe: false, riskWarning: '' });
      wx.showToast({ title: '已取消拉黑，可以继续聊天', icon: 'none' });
      return;
    }

    const code = result && result.code;
    let message = (result && result.message) || '取消拉黑失败，请稍后重试';
    if (code === 'NO_ACTIVE_BLOCK') {
      message = '你并没有拉黑对方，可能是对方拉黑了你';
      // 对方拉黑我时按钮没有意义，直接切到「只能等对方解除」的展示
      this.setData({ blockedByMe: false });
    }
    wx.showToast({ title: message, icon: 'none' });
  }
});
