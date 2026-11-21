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
    let title = '处理完成';
    if (!result) {
      title = '处理失败，请稍后重试';
    } else if (!result.ok) {
      title = result.code === 'NOT_ADMIN' ? '没有管理员权限' : (result.message || '处理失败');
    } else if (result.alreadyReviewed) {
      title = '该投诉已处理过';
    } else if (result.autoBanned) {
      title = '投诉成立，已临时封禁 24 小时';
    }
    wx.showToast({ title, icon: 'none' });
    this.loadComplaints();
  }
});
