const { submitReview } = require('../../utils/cloud-api');

Page({
  data: {
    orderId: '',
    revieweeOpenid: '',
    rating: 'good',
    content: '',
    submitting: false
  },

  onLoad(options = {}) {
    this.setData({
      orderId: options.orderId || '',
      revieweeOpenid: options.revieweeOpenid || ''
    });
  },

  selectRating(event) {
    this.setData({
      rating: event.currentTarget.dataset.rating
    });
  },

  updateContent(event) {
    this.setData({
      content: event.detail.value
    });
  },

  async submitReview() {
    if (this.data.submitting) return;

    if (!this.data.orderId || !this.data.revieweeOpenid) {
      wx.showToast({
        title: '评价信息不完整',
        icon: 'none'
      });
      return;
    }

    this.setData({ submitting: true });
    const result = await submitReview({
      orderId: this.data.orderId,
      revieweeOpenid: this.data.revieweeOpenid,
      rating: this.data.rating,
      content: this.data.content
    });
    this.setData({ submitting: false });

    if (!result || !result.ok) {
      wx.showToast({
        title: (result && result.message) || '评价提交失败',
        icon: 'none'
      });
      return;
    }

    wx.showToast({
      title: '评价已提交',
      icon: 'none'
    });
    setTimeout(() => {
      wx.navigateBack();
    }, 800);
  }
});
