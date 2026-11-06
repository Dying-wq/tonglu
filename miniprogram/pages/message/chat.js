const { detectRiskKeywords } = require('../../utils/risk');
const {
  blockUser: blockUserApi,
  createOrGetConversation,
  getMessageList,
  getPostById,
  login,
  markConversationRead,
  reportConversationOrMessage,
  requestWechatExchange,
  sendMessage
} = require('../../utils/cloud-api');

Page({
  data: {
    // 不再用 'demo_conversation' 兜底：会话 id 为空说明会话未建立，
    // 用假 id 去查消息只会拿到空结果，掩盖真实问题。
    conversationId: '',
    post: null,
    // 不再回退 mock-data 的演示消息：假消息会显示成「30 分钟前」这类
    // 固定时间，让用户误以为是真实聊天记录。
    messages: [],
    inputValue: '',
    riskWarning: '',
    pollingText: '',
    wechatExchangeStatus: '未交换',
    // 会话是否已被拉黑：拉黑后云端 sendMessage 会拒绝，前端同步禁用输入
    blocked: false,
    loading: true,
    quickReplies: ['我可以，现在方便沟通吗？', '请问具体时间和地点是？', '我已到附近，稍等一下。']
  },

  onLoad(options = {}) {
    this.initChat(options);
    this.pollingTimer = setInterval(() => this.loadMessages(false), 3000);
  },

  onUnload() {
    clearInterval(this.pollingTimer);
  },

  async initChat(options) {
    await login();
    let conversationId = options.conversationId || '';
    let post = null;
    if (options.postId) {
      post = await getPostById(options.postId);
      const result = await createOrGetConversation({
        relatedType: 'post',
        relatedId: options.postId,
        postId: options.postId
      });
      conversationId = (result && result.conversationId) || conversationId;
    }
    this.setData({ conversationId, post });
    if (conversationId) {
      await markConversationRead(conversationId);
    }
    this.loadMessages(true);
  },

  async loadMessages(showConnected) {
    if (!this.data.conversationId) {
      this.setData({ messages: [], loading: false, pollingText: '' });
      return;
    }
    const nextMessages = await getMessageList(this.data.conversationId);
    this.setData({
      // 云端没有消息就是空列表，由页面显示空状态
      messages: nextMessages || [],
      loading: false,
      pollingText: showConnected ? '已连接' : ''
    });
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
      this.setData({ blocked: true, inputValue: '' });
      wx.showToast({ title: '已拉黑，双方无法再发消息', icon: 'none' });
      return;
    }

    // 拉黑失败要说清原因：常见是 blocks 集合未创建
    const message = (result && result.message) || '拉黑失败，请检查 blocks 集合是否已创建';
    wx.showToast({ title: message, icon: 'none' });
  }
});
