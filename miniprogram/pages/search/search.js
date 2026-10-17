const { posts } = require('../../utils/mock-data');
const { getPosts } = require('../../utils/cloud-api');

Page({
  data: {
    keyword: '',
    allPosts: posts,
    results: posts
  },

  onLoad() {
    this.loadPosts();
  },

  async loadPosts() {
    const nextPosts = await getPosts();
    const app = getApp();
    const cloudReady = Boolean(app && app.globalData && app.globalData.cloudReady);
    // 云开发就绪时以云端结果为准：无数据就是无数据，不能回退到演示数据
    const allPosts = cloudReady ? (nextPosts || []) : posts;
    this.setData({
      allPosts,
      results: allPosts
    });
  },

  updateKeyword(event) {
    const keyword = event.detail.value.trim();
    const results = this.data.allPosts.filter((post) => {
      const text = `${post.title || ''}${post.description || ''}${post.location || ''}${post.tagName || ''}${post.publisherName || ''}`;
      return !keyword || text.includes(keyword);
    });
    this.setData({ keyword, results });
  },

  goDetail(event) {
    wx.navigateTo({
      url: `/pages/service-detail/service-detail?id=${event.currentTarget.dataset.id}`
    });
  }
});
