const { demoOrder } = require('../../utils/mock-data');
const { confirmComplete, getOrderById, publisherAcceptOrder } = require('../../utils/cloud-api');

Page({
  data: {
    order: demoOrder,
    conversationId: ''
  },

  onLoad(options = {}) {
    this.setData({
      conversationId: options.conversationId || ''
    });
    this.loadOrder(options.orderId);
  },

  async loadOrder(orderId) {
    const order = await getOrderById(orderId);
    this.setData({
      order,
      conversationId: this.data.conversationId || order.conversationId || ''
    });
  },

  goChat() {
    wx.navigateTo({
      url: `/pages/message/chat?conversationId=${this.data.conversationId || 'demo_conversation'}`
    });
  },

  async confirmComplete() {
    await confirmComplete(this.data.order.id);
    this.setData({
      'order.status': 'pending_review'
    });
    wx.showToast({
      title: '已进入待评价',
      icon: 'none'
    });
  },

  async publisherAccept() {
    const result = await publisherAcceptOrder(this.data.order.id);
    this.setData({
      'order.status': 'in_progress'
    });
    wx.showToast({
      title: result && result.ok ? '已接受接单' : '已本地接受',
      icon: 'none'
    });
  },

  goReview() {
    wx.navigateTo({
      url: '/pages/review/review'
    });
  },

  goComplaint() {
    wx.navigateTo({
      url: `/pages/complaint-submit/complaint-submit?relatedId=${this.data.order.id}&relatedType=order`
    });
  }
});
