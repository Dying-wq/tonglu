const { messages } = require('../../utils/mock-data');
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
    conversationId: 'demo_conversation',
    post: null,
    messages,
    inputValue: '',
    riskWarning: '',
    pollingText: '连接中',
    wechatExchangeStatus: '未交换',
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
      conversationId = result.conversationId || conversationId || 'demo_conversation';
    }
    this.setData({
      conversationId: conversationId || 'demo_conversation',
      post
    });
    await markConversationRead(this.data.conversationId);
    this.loadMessages(true);
  },

  async loadMessages(showConnected) {
    const nextMessages = await getMessageList(this.data.conversationId);
    this.setData({
      messages: nextMessages.length ? nextMessages : messages,
      pollingText: `${showConnected ? '已连接' : '已刷新'} ${new Date().toLocaleTimeString()}`
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
    this.setData({
      inputValue: event.currentTarget.dataset.text
    });
  },

  async sendText() {
    const content = this.data.inputValue.trim();
    if (!content) return;
    const risk = detectRiskKeywords(content);
    const localMessage = {
      id: `msg_${Date.now()}`,
      sender: 'me',
      content,
      contentType: 'text',
      createdAt: '刚刚',
      riskStatus: risk.hasRisk ? 'warning' : 'safe'
    };
    await sendMessage({
      conversationId: this.data.conversationId,
      content,
      contentType: 'text'
    });
    this.setData({
      messages: this.data.messages.concat(localMessage),
      inputValue: '',
      riskWarning: ''
    });
  },

  async requestWechat() {
    const result = await requestWechatExchange(this.data.conversationId);
    this.setData({
      wechatExchangeStatus: result && result.ok ? '已发送微信交换请求，等待对方同意' : '已本地记录交换请求'
    });
  },

  async reportConversation() {
    const result = await reportConversationOrMessage({
      conversationId: this.data.conversationId,
      targetType: 'conversation',
      reason: '聊天内容违规'
    });
    wx.showToast({
      title: result && result.ok ? '已提交举报' : '已本地记录',
      icon: 'none'
    });
  },

  async blockUser() {
    const result = await blockUserApi({
      conversationId: this.data.conversationId,
      reason: '用户主动拉黑'
    });
    wx.showToast({
      title: result && result.ok ? '已拉黑' : '已本地记录',
      icon: 'none'
    });
  }
});
