const { getThankWall, getMyOrders, createThank } = require('../../utils/cloud-api');

Page({
  data: {
    thankList: [],
    loading: true,
    showForm: false,
    completedOrders: [],
    orderLabels: [],
    orderIndex: -1,
    content: '',
    submitting: false
  },

  onLoad() {
    this.loadThankWall();
  },

  onPullDownRefresh() {
    this.loadThankWall().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  async loadThankWall() {
    this.setData({ loading: true });
    try {
      const list = await getThankWall();
      this.setData({
        thankList: list || [],
        loading: false
      });
    } catch (error) {
      console.warn('加载感谢墙失败：', error);
      this.setData({ loading: false });
    }
  },

  async toggleForm() {
    if (this.data.showForm) {
      this.setData({ showForm: false });
      return;
    }

    const app = getApp();
    const openid = (app && app.globalData && app.globalData.openid) || '';
    if (!openid) {
      wx.showToast({ title: '请先登录后再写感谢', icon: 'none' });
      return;
    }

    const orders = await getMyOrders();
    // 只有被帮助的一方（发布者）可以写感谢，且订单必须已完成
    const completed = (orders || []).filter(
      (order) => order.status === 'completed' && order.publisherOpenid === openid
    );
    if (!completed.length) {
      wx.showToast({ title: '还没有已完成的互助可以感谢', icon: 'none' });
      return;
    }

    this.setData({
      showForm: true,
      completedOrders: completed,
      orderLabels: completed.map((order) => order.title || '互助订单'),
      orderIndex: 0
    });
  },

  selectOrder(event) {
    this.setData({ orderIndex: Number(event.detail.value) });
  },

  updateContent(event) {
    this.setData({ content: event.detail.value });
  },

  async submit() {
    if (this.data.submitting) return;
    const order = this.data.completedOrders[this.data.orderIndex];
    const content = this.data.content.trim();

    if (!order) {
      wx.showToast({ title: '请选择一条已完成的互助', icon: 'none' });
      return;
    }
    if (!content) {
      wx.showToast({ title: '请写一句感谢的话', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    try {
      const result = await createThank({ orderId: order._id, content });
      if (result && result.ok) {
        wx.showToast({ title: result.updated ? '感谢已更新' : '感谢已发布', icon: 'none' });
        this.setData({ showForm: false, content: '', orderIndex: -1 });
        this.loadThankWall();
        return;
      }
      wx.showToast({ title: (result && result.message) || '发布失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  }
});
