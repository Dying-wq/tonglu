const { posts, serviceTypes } = require('../../utils/mock-data');
const { acceptOrder, getPostById, saveSubscribeAuth } = require('../../utils/cloud-api');
const { requestSubscribe } = require('../../utils/subscribe');

Page({
  data: {
    post: null,
    actionText: '我来帮',
    contactText: '私信联系',
    canOrder: false,
    riskText: '平台禁止金钱交易，建议物物交换或无偿帮助。'
  },

  onLoad(options) {
    const post = posts.find((item) => item.id === options.id) || posts[0];
    const service = serviceTypes.find((item) => item.key === post.type);
    this.setData({
      post,
      actionText: service ? service.actionText : '我来帮',
      contactText: this.getContactText(post.type),
      canOrder: this.computeCanOrder(post)
    });
    this.loadPost(options.id);
  },

  async loadPost(id) {
    const post = await getPostById(id);
    if (!post) {
      this.setData({
        post: null,
        canOrder: false
      });
      return;
    }

    const service = serviceTypes.find((item) => item.key === post.type);
    this.setData({
      post,
      actionText: service ? service.actionText : '我来帮',
      contactText: this.getContactText(post.type),
      canOrder: this.computeCanOrder(post)
    });
  },

  // 只有帖子仍开放且不是自己发布时，才显示「我来帮/联系TA」
  computeCanOrder(post) {
    if (!post || post.type === 'topic') return false;
    if (post.status && post.status !== 'open') return false;
    const app = typeof getApp === 'function' ? getApp() : null;
    const openid = app && app.globalData ? app.globalData.openid : '';
    if (openid && post.publisherOpenid && post.publisherOpenid === openid) return false;
    return true;
  },

  getContactText(type) {
    if (type === 'help') return '私信帮TA';
    if (type === 'offer') return '联系TA';
    if (type === 'topic') return '参与话题';
    return '私信联系';
  },

  async startOrder() {
    const result = await acceptOrder(this.data.post);
    if (result && result.ok) {
      wx.showToast({
        title: '已响应',
        icon: 'none'
      });
    }
    const orderId = result && result.orderId ? result.orderId : '';
    const conversationId = result && result.conversationId ? result.conversationId : '';
    this.requestNoticeAuth(['order', 'chat'], 'accept_order');
    wx.navigateTo({
      url: `/pages/order-detail/order-detail?orderId=${orderId}&conversationId=${conversationId}`
    });
  },

  goChat() {
    wx.navigateTo({
      url: `/pages/message/chat?postId=${this.data.post.id}`
    });
  },

  async requestNoticeAuth(channels, scene) {
    const result = await requestSubscribe(channels);
    if (result.ok) {
      await saveSubscribeAuth({
        channels,
        auth: result.auth,
        scene
      });
    }
  },

  goComplaint() {
    wx.navigateTo({
      url: `/pages/complaint-submit/complaint-submit?relatedId=${this.data.post.id}&relatedType=post`
    });
  }
});
