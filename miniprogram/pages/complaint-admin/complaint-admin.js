const { getComplaints, reviewComplaint } = require('../../utils/cloud-api');

Page({
  data: {
    complaints: []
  },

  onLoad() {
    this.loadComplaints();
  },

  async loadComplaints() {
    const complaints = await getComplaints();
    this.setData({ complaints });
  },

  async approve(event) {
    await this.review(event.currentTarget.dataset.id, 'approve');
  },

  async reject(event) {
    await this.review(event.currentTarget.dataset.id, 'reject');
  },

  async review(complaintId, decision) {
    const result = await reviewComplaint({
      complaintId,
      decision,
      adminNote: decision === 'approve' ? '投诉成立，扣除信用分。' : '证据不足，驳回投诉。'
    });
    wx.showToast({
      title: result && result.ok ? '处理完成' : '已本地处理',
      icon: 'none'
    });
    this.loadComplaints();
  }
});
