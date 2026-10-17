const { getThankWall } = require('../../utils/cloud-api');

Page({
  data: {
    thankList: [],
    loading: true
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
  }
});
