const { messages } = require('../../utils/mock-data');
const { detectRiskKeywords } = require('../../utils/risk');
const { ensureConversation, getMessages, getPostById, login, requestWechatExchange, sendMessage } = require('../../utils/cloud-api');

Page({
  data: {
    messages,
    conversationId: 'demo_conversation',
    post: null,
    inputValue: '',
    riskWarning: '',
    pollingText: '每 3 秒轮询刷新消息',
    wechatExchangeStatus: '未交换'
  },

  onLoad(options = {}) {
    this.initChat(options);
    this.pollingTimer = setInterval(() => {
      this.loadMessages(false);
    }, 3000);
  },

  onUnload() {
    clearInterval(this.pollingTimer);
  },

  async initChat(options) {
    await login();
    let conversationId = options.conversationId || '';
    const postId = options.postId || '';
    let post = null;
    if (postId) {
      post = await getPostById(postId);
      const result = await ensureConversation({ postId });
      conversationId = result.conversationId || conversationId || 'demo_conversation';
    }

    this.setData({
      conversationId: conversationId || 'demo_conversation',
      post
    });
    this.loadMessages(true);
  },

  async loadMessages(showLoadingText) {
    const nextMessages = await getMessages(this.data.conversationId);
    this.setData({
      messages: nextMessages,
      pollingText: `${showLoadingText ? '已连接' : '已刷新'} ${new Date().toLocaleTimeString()}`
    });
  },

  updateInput(event) {
    const inputValue = event.detail.value;
    const risk = detectRiskKeywords(inputValue);
    this.setData({
      inputValue,
      riskWarning: risk.hasRisk ? `检测到风险词：${risk.keywords.join('、')}，请谨慎线下转账。` : ''
    });
  },

  async sendMessage() {
    if (!this.data.inputValue.trim()) return;
    const nextMessage = {
      id: `msg_${Date.now()}`,
      sender: 'me',
      content: this.data.inputValue,
      createdAt: '刚刚'
    };
    await sendMessage({
      conversationId: this.data.conversationId,
      content: this.data.inputValue,
      type: 'text'
    });
    this.setData({
      messages: this.data.messages.concat(nextMessage),
      inputValue: '',
      riskWarning: ''
    });
  },

  async requestWechat() {
    const result = await requestWechatExchange(this.data.conversationId);
    this.setData({
      wechatExchangeStatus: result && result.ok ? '已发送微信交换请求，等待对方同意' : '已本地记录交换请求'
    });
  }
});
