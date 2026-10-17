const { currentUser, posts } = require('../../utils/mock-data');
const { getPromotions, joinHotPromotion } = require('../../utils/cloud-api');
const { canJoinHot } = require('../../utils/hot');

Page({
  data: {
    hotQuota: currentUser.hotQuota || 0,
    showJoinPanel: false,
    ownPosts: posts.slice(0, 4),
    promotions: []
  },

  onLoad() {
    this.loadPromotions();
  },

  async loadPromotions() {
    const promotions = await getPromotions();
    this.setData({ promotions });
  },

  toggleJoinPanel() {
    this.setData({
      showJoinPanel: !this.data.showJoinPanel
    });
  },

  async joinHot(event) {
    const postId = event.currentTarget.dataset.id;
    const post = this.data.ownPosts.find((item) => item.id === postId);
    const localCheck = canJoinHot({
      user: { hotQuota: this.data.hotQuota },
      post
    });

    if (!localCheck.allowed) {
      wx.showToast({
        title: localCheck.reason === 'NO_HOT_QUOTA' ? '热门次数不足' : '该内容暂不可加入热门',
        icon: 'none'
      });
      return;
    }

    const result = await joinHotPromotion({ postId });
    const ok = !result || result.offline || result.ok;
    if (ok) {
      const promoted = {
        ...post,
        tagName: post.tagName || '热门',
        createdAt: '热门中'
      };
      this.setData({
        hotQuota: localCheck.remainingQuota,
        promotions: [promoted].concat(this.data.promotions.filter((item) => item.id !== postId)),
        ownPosts: this.data.ownPosts.map((item) => item.id === postId ? { ...item, isHot: true } : item)
      });
    }

    wx.showToast({
      title: ok ? '已加入热门' : (result.message || '加入失败'),
      icon: 'none'
    });
  },

  goDetail(event) {
    wx.navigateTo({
      url: `/pages/service-detail/service-detail?id=${event.currentTarget.dataset.id}`
    });
  }
});
