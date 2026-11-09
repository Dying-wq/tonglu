const { detectRiskKeywords } = require('../../utils/risk');
const {
  blockUser: blockUserApi,
  createOrGetConversation,
  deleteMessage: deleteMessageApi,
  getChatState,
  getPostById,
  login,
  markConversationRead,
  recallMessage: recallMessageApi,
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
    // 云函数版本不匹配时的开发提示（正常部署时始终为空，不会出现在正式界面）
    deployHint: '',
    // 会话里只有自己（单账号自测）时提示，避免把「没有对方」误判成功能坏了
    selfOnly: false,
    // 订单会话：从消息页带过来，聊天页顶部直接给出去订单确认页的入口
    orderId: '',
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
      peerAvatarUrl,
      orderId: options.orderId || ''
    });
    if (conversationId) {
      // 进会话即已读，并同步把 tabBar 红点减掉——
      // 原来只标记已读不刷角标，用户回到首页红点还是原数字，看着像没生效
      await this.markReadAndSyncBadge();
    }
    // 拉黑状态、对方身份都由 getMessageList 一并返回，
    // 不再依赖 URL 里的 peerOpenid 或额外的拉黑名单云函数。
    await this.loadMessages(true);
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

  async loadMessages(showConnected) {
    if (!this.data.conversationId) {
      this.setData({ messages: [], loading: false, pollingText: '', selfOnly: false });
      return;
    }

    const state = await getChatState(this.data.conversationId);
    const list = state.messages || [];

    // 页面开着的时候对方又发了消息，立刻再标一次已读：
    // 否则未读数会一直涨，用户明明在看却被红点追着。
    // 首次加载不算「新消息」——initChat 里已经标过已读了，不必重复调。
    const grew = this.messagesInitialized && list.length > this.data.messages.length;

    const patch = {
      messages: list,
      loading: false,
      pollingText: showConnected ? '已连接' : '',
      blocked: state.blocked,
      blockedByMe: state.blockedByMe,
      selfOnly: state.selfOnly
    };

    // 对方身份以服务端为准：从会话列表进来时 URL 带的名字可能已经过期
    if (state.peer && state.peer.name) {
      patch.peerOpenid = state.peerOpenid;
      patch.peerName = state.peer.name;
      patch.peerAvatarText = state.peer.avatarText || state.peer.name.slice(0, 1);
      patch.peerAvatarUrl = state.peer.avatarUrl || '';
    }

    // 云函数还是旧版本时明确提示，避免被误认为「功能没做」
    patch.deployHint = state.needsRedeploy
      ? '云函数 getMessageList 尚未更新到最新版本，拉黑状态无法读取，请重新上传部署。'
      : '';

    this.setData(patch);
    this.messagesInitialized = true;

    if (state.error && state.offline) {
      this.setData({ pollingText: '云服务未连接' });
    }

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

  // 订单会话：不用退出聊天再回消息页找，直接进接受接单 / 确认完成
  goOrder() {
    const { orderId, conversationId } = this.data;
    if (!orderId) return;
    wx.navigateTo({
      url: `/pages/order-detail/order-detail?orderId=${encodeURIComponent(orderId)}&conversationId=${encodeURIComponent(conversationId || '')}`
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

  // ================== 长按消息：撤回 / 删除 ==================

  // 长按气泡弹出操作菜单。
  // 「撤回」只对自己发的、2 分钟内的消息出现；「删除」任何时候都有。
  // 前端只是决定菜单项，真正的时限判定在 recallMessage 云函数里再做一次，
  // 因为客户端时间可以改，不能作为唯一依据。
  onMessageLongPress(event) {
    const index = event.currentTarget.dataset.index;
    const item = this.data.messages[index];
    if (!item) return;

    // 已撤回的消息只剩占位文案，没有可操作的内容
    if (item.recalled) {
      wx.showToast({ title: '这条消息已撤回', icon: 'none' });
      return;
    }

    const actions = item.canRecall ? ['撤回', '删除'] : ['删除'];

    wx.showActionSheet({
      itemList: actions,
      success: (res) => {
        const label = actions[res.tapIndex];
        if (label === '撤回') {
          this.doRecall(item);
        } else if (label === '删除') {
          this.doDelete(item);
        }
      },
      fail: () => {}
    });
  },

  doRecall(item) {
    wx.showModal({
      title: '撤回消息',
      content: '撤回后双方都看不到这条消息，确定撤回吗？',
      confirmText: '撤回',
      success: async (res) => {
        if (!res || !res.confirm) return;

        const result = await recallMessageApi(item.id);
        if (!result || !result.ok) {
          // 超时是最常见的情况，云函数会带回「发送于 X 分钟前」的具体说明，
          // 用弹窗而不是 toast，避免长文案被截断
          wx.showModal({
            title: '撤回失败',
            content: (result && result.message) || '请稍后重试',
            showCancel: false,
            confirmText: '知道了'
          });
          return;
        }

        wx.showToast({ title: '已撤回', icon: 'none' });
        this.loadMessages(false);
      },
      fail: () => {}
    });
  },

  doDelete(item) {
    wx.showModal({
      title: '删除消息',
      content: '只删除你这边，对方仍能看到这条消息。',
      confirmText: '删除',
      confirmColor: '#E24B4A',
      success: async (res) => {
        if (!res || !res.confirm) return;

        const result = await deleteMessageApi(item.id);
        if (!result || !result.ok) {
          wx.showToast({ title: (result && result.message) || '删除失败', icon: 'none' });
          return;
        }

        // 本地先移除，不必等下一次轮询
        const messages = this.data.messages.filter((msg) => msg.id !== item.id);
        this.setData({ messages });
      },
      fail: () => {}
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
        // 拉一次会话状态，把按钮切成「取消拉黑」或「等待对方解除」
        this.loadMessages(false);
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
      riskStatus: risk.hasRisk ? 'warning' : 'safe',
      // 刚发出的消息一定在撤回窗口内，本地先给出正确的菜单项，
      // 免得长按后只有「删除」、等下一次轮询才出现「撤回」
      recalled: false,
      recallText: '',
      canRecall: true
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

    // 拉黑失败要说清原因：常见是 blocks 集合未创建或 blockUser 未部署
    const message = (result && result.message) || '拉黑失败，请检查 blocks 集合是否已创建';
    wx.showModal({
      title: '拉黑未成功',
      content: message,
      showCancel: false,
      confirmText: '知道了'
    });
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

    // 以 conversationId 为主，peerOpenid 只作为提示；
    // 对方身份最终由云端从会话/消息/拉黑记录里推断并校验，前端说了不算。
    const result = await unblockUserApi({
      conversationId: this.data.conversationId,
      peerOpenid: this.data.peerOpenid || ''
    });
    console.info('[unblockUser] 云端返回：', result);

    if (result && result.ok) {
      this.setData({ blocked: false, blockedByMe: false, inputValue: '', riskWarning: '' });
      // 单账号自测会话（只有自己）会返回 warning：状态已恢复，但要说清这不是真实双账号场景
      if (result.warning) {
        wx.showModal({
          title: '已恢复会话',
          content: result.warning,
          showCancel: false,
          confirmText: '知道了'
        });
      } else {
        wx.showToast({ title: '已取消拉黑，可以继续聊天', icon: 'none' });
      }
      // 再从服务端拉一次，确认状态真的恢复了（而不是只改了本地变量）
      this.loadMessages(false);
      return;
    }

    const code = result && result.code;
    let message = (result && result.message) || '取消拉黑失败，请稍后重试';
    if (code === 'NO_ACTIVE_BLOCK') {
      message = '你并没有拉黑对方，是对方拉黑了你，需要对方解除。';
      this.setData({ blockedByMe: false });
    }
    // 返回值里没有 version = 云端跑的还是旧版云函数，
    // 改本地代码不会生效，必须重新上传部署。
    if (!result || !result.version) {
      message += '\n\n云端 unblockUser 可能还是旧版本：右键 cloudfunctions/unblockUser → 上传并部署（云端安装依赖）。';
    }

    // 用弹窗而不是 toast：失败原因比较长，toast 会被截断，
    // 用户只能看到「取消拉黑失败」，无法判断到底卡在哪一步。
    wx.showModal({
      title: '取消拉黑未成功',
      content: message,
      showCancel: false,
      confirmText: '知道了'
    });
  }
});
