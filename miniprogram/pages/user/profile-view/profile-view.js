const {
  ensureLogin,
  getUserProfile,
  blockUser,
  ensureConversation
} = require('../../../utils/cloud-api');

Page({
  data: {
    loading: true,
    profile: null,
    targetOpenid: '',
    conversationId: '',
    postId: '',
    joinedDays: 0,
    blockedByMe: false,
    blockedByThem: false,
    canMessage: true
  },

  onLoad(options = {}) {
    const targetOpenid = options.openid || '';
    if (!targetOpenid) {
      wx.showToast({ title: '缺少用户信息', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.setData({
      targetOpenid,
      conversationId: options.conversationId || '',
      postId: options.postId || ''
    });
    this.loadProfile();
  },

  async loadProfile() {
    await ensureLogin();
    const profile = await getUserProfile(this.data.targetOpenid);
    if (!profile || !profile.ok) {
      wx.showToast({ title: (profile && profile.message) || '加载失败', icon: 'none' });
      this.setData({ loading: false });
      return;
    }

    if (profile.isSelf) {
      wx.showToast({ title: '这是你自己', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }

    const joinedDays = this.calcJoinedDays(profile.createdAt);
    const blockedByMe = Boolean(profile.blockedByMe);
    const blockedByThem = Boolean(profile.blockedByThem);
    this.setData({
      loading: false,
      profile,
      joinedDays,
      blockedByMe,
      blockedByThem,
      canMessage: !blockedByMe && !blockedByThem
    });
  },

  calcJoinedDays(createdAt) {
    if (!createdAt) return 0;
    const ts = new Date(createdAt).getTime();
    if (!ts) return 0;
    return Math.max(1, Math.floor((Date.now() - ts) / 86400000) + 1);
  },

  // 发消息：优先用带来的会话；从帖子进来就用 postId 建/取会话
  async goMessage() {
    if (!this.data.canMessage) {
      wx.showToast({
        title: this.data.blockedByMe ? '你已拉黑对方' : '对方已拉黑你',
        icon: 'none'
      });
      return;
    }
    if (this.data.conversationId) {
      wx.navigateTo({
        url: `/pages/message/chat?conversationId=${this.data.conversationId}`
      });
      return;
    }
    if (this.data.postId) {
      const result = await ensureConversation({ postId: this.data.postId });
      if (!result || !result.ok) {
        wx.showToast({ title: '会话打开失败', icon: 'none' });
        return;
      }
      wx.navigateTo({
        url: `/pages/message/chat?conversationId=${result.conversationId}`
      });
      return;
    }
    wx.showToast({ title: '请从帖子或会话发起私聊', icon: 'none' });
  },

  goBlock() {
    if (this.data.blockedByMe) return;
    wx.showModal({
      title: '拉黑该用户',
      content: '拉黑后双方无法互发消息，对方帖子也不再出现在首页。确定吗？',
      success: async (res) => {
        if (!res.confirm) return;
        const result = await blockUser({ targetOpenid: this.data.targetOpenid });
        if (!result || !result.ok) {
          wx.showToast({ title: (result && result.message) || '拉黑失败', icon: 'none' });
          return;
        }
        wx.showToast({ title: '已拉黑', icon: 'none' });
        this.setData({ blockedByMe: true, canMessage: false });
      }
    });
  },

  goReport() {
    wx.navigateTo({
      url: `/pages/complaint-submit/complaint-submit?relatedType=user&relatedId=${this.data.targetOpenid}&targetUserOpenid=${this.data.targetOpenid}`
    });
  },

  goThankWall() {
    wx.navigateTo({ url: '/pages/thank-wall/thank-wall' });
  }
});
//（注：内容由AI生成）
