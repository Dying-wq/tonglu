const { createComplaint } = require('../../utils/cloud-api');

Page({
  data: {
    relatedId: '',
    relatedType: 'order',
    reason: '诈骗/金钱交易',
    content: '',
    targetUserOpenid: '',
    reasons: ['诈骗/金钱交易', '骚扰', '广告', '其他'],
    submitting: false
  },

  onLoad(options) {
    this.setData({
      relatedId: options.relatedId || '',
      relatedType: options.relatedType || 'order'
    });
  },

  selectReason(event) {
    this.setData({
      reason: event.currentTarget.dataset.reason
    });
  },

  updateContent(event) {
    this.setData({
      content: event.detail.value
    });
  },

  updateTarget(event) {
    this.setData({
      targetUserOpenid: event.detail.value
    });
  },

  async submitComplaint() {
    if (!this.data.content.trim()) {
      wx.showToast({ title: '请填写举报说明', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    try {
      const result = await createComplaint({
        relatedId: this.data.relatedId,
        relatedType: this.data.relatedType,
        reason: this.data.reason,
        content: this.data.content,
        targetUserOpenid: this.data.targetUserOpenid
      });
      wx.showToast({
        title: result && result.ok ? '已提交举报' : '已本地提交',
        icon: 'none'
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 1000);
    } finally {
      this.setData({ submitting: false });
    }
  }
});
