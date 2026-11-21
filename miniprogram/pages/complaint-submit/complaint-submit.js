const { createComplaint } = require('../../utils/cloud-api');

// URL 里的中文昵称是 encodeURIComponent 过的，解不开时按原值用
function decodeParam(value) {
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch (error) {
    return String(value);
  }
}

Page({
  data: {
    relatedId: '',
    relatedType: 'order',
    // 不预选理由：理由会参与「3 个不同用户同一理由自动封禁」的判定，
    // 默认值容易让用户直接提交出错误理由
    reason: '',
    content: '',
    targetUserOpenid: '',
    targetUserName: '',
    // 从聊天页进入时已带上被举报人，锁定显示，不再让用户手填
    targetLocked: false,
    reasons: ['诈骗/金钱交易', '辱骂/人身攻击', '骚扰', '广告', '其他'],
    submitting: false
  },

  onLoad(options = {}) {
    const relatedId = decodeParam(options.relatedId);
    const targetUserOpenid = decodeParam(options.targetUserOpenid);
    this.setData({
      relatedId,
      // 没有任何关联单据时（从「我的-举报与申诉」直接进入）按用户举报处理
      relatedType: options.relatedType || (relatedId ? 'order' : 'user'),
      targetUserOpenid,
      targetUserName: decodeParam(options.targetUserName),
      targetLocked: Boolean(targetUserOpenid)
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
    if (!this.data.reason) {
      wx.showToast({ title: '请选择举报理由', icon: 'none' });
      return;
    }
    if (!this.data.content.trim()) {
      wx.showToast({ title: '请填写举报说明', icon: 'none' });
      return;
    }
    // 从「我的-举报与申诉」进入时没有关联单据，用被举报人ID兜底
    const relatedId = this.data.relatedId || this.data.targetUserOpenid.trim();
    if (!relatedId) {
      wx.showToast({ title: '请填写被举报用户ID', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    try {
      const result = await createComplaint({
        relatedId,
        relatedType: this.data.relatedType,
        reason: this.data.reason,
        content: this.data.content.trim(),
        targetUserOpenid: this.data.targetUserOpenid.trim()
      });
      if (!result || !result.ok) {
        // 提交失败时停在当前页，用户改完还能重试
        wx.showModal({
          title: '举报未提交',
          content: (result && result.message) || '网络异常，请稍后重试',
          showCancel: false
        });
        return;
      }
      wx.showToast({
        title: result.duplicate ? '你已举报过，等待处理' : '已提交举报',
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
