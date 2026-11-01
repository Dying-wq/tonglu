const { cancelOrder, confirmComplete, getOrderById, publisherAcceptOrder } = require('../../utils/cloud-api');

const STATUS_LABELS = {
  pending_accept: '待确认',
  in_progress: '进行中',
  completed: '已完成',
  expired: '已过期',
  cancelled: '已取消'
};

Page({
  data: {
    order: null,
    conversationId: '',
    statusText: '',
    isPublisher: false,
    isTaker: false,
    canAccept: false,
    canConfirm: false,
    canCancel: false,
    canReview: false,
    loading: true
  },

  onLoad(options = {}) {
    this.setData({
      conversationId: options.conversationId || ''
    });
    this.loadOrder(options.orderId);
  },

  async loadOrder(orderId) {
    if (!orderId) {
      this.setData({ loading: false });
      wx.showToast({
        title: '缺少订单编号',
        icon: 'none'
      });
      return;
    }

    const order = await getOrderById(orderId);
    const app = typeof getApp === 'function' ? getApp() : null;
    const openid = app && app.globalData ? app.globalData.openid : '';
    const isPublisher = Boolean(openid && order.publisherOpenid === openid);
    const isTaker = Boolean(openid && order.takerOpenid === openid);
    const status = order.status;

    this.setData({
      order,
      loading: false,
      isPublisher,
      isTaker,
      statusText: STATUS_LABELS[status] || status || '未知',
      canAccept: isPublisher && status === 'pending_accept',
      canConfirm: isPublisher && status === 'in_progress',
      canCancel: (isPublisher || isTaker) && (status === 'pending_accept' || status === 'in_progress'),
      canReview: status === 'completed' && (isPublisher || isTaker),
      conversationId: this.data.conversationId || order.conversationId || ''
    });
  },

  goChat() {
    if (!this.data.conversationId) {
      wx.showToast({
        title: '暂无会话',
        icon: 'none'
      });
      return;
    }
    wx.navigateTo({
      url: `/pages/message/chat?conversationId=${this.data.conversationId}`
    });
  },

  async publisherAccept() {
    const result = await publisherAcceptOrder(this.data.order.id);
    if (!result || !result.ok) {
      wx.showToast({
        title: (result && result.message) || '接受失败',
        icon: 'none'
      });
      return;
    }
    wx.showToast({
      title: '已接受接单',
      icon: 'none'
    });
    this.loadOrder(this.data.order.id);
  },

  async confirmComplete() {
    const result = await confirmComplete(this.data.order.id);
    if (!result || !result.ok) {
      wx.showToast({
        title: (result && result.message) || '确认失败',
        icon: 'none'
      });
      return;
    }
    wx.showToast({
      title: '已确认完成',
      icon: 'none'
    });
    this.loadOrder(this.data.order.id);
  },

  cancel() {
    wx.showModal({
      title: '取消订单',
      content: '取消后订单不可恢复，确定取消吗？',
      success: async (res) => {
        if (!res.confirm) return;
        const result = await cancelOrder(this.data.order.id);
        if (!result || !result.ok) {
          wx.showToast({
            title: (result && result.message) || '取消失败',
            icon: 'none'
          });
          return;
        }
        wx.showToast({
          title: '订单已取消',
          icon: 'none'
        });
        this.loadOrder(this.data.order.id);
      }
    });
  },

  goReview() {
    const order = this.data.order || {};
    const app = typeof getApp === 'function' ? getApp() : null;
    const openid = app && app.globalData ? app.globalData.openid : '';
    const revieweeOpenid = order.publisherOpenid === openid
      ? order.takerOpenid
      : order.publisherOpenid;

    if (!revieweeOpenid) {
      wx.showToast({
        title: '暂无可评价对象',
        icon: 'none'
      });
      return;
    }

    wx.navigateTo({
      url: `/pages/review/review?orderId=${order.id}&revieweeOpenid=${revieweeOpenid}`
    });
  },

  goComplaint() {
    wx.navigateTo({
      url: `/pages/complaint-submit/complaint-submit?relatedId=${this.data.order.id}&relatedType=order`
    });
  }
});
