const { posts, serviceTypes } = require('../../utils/mock-data');
const { getPosts } = require('../../utils/cloud-api');

Page({
  data: {
    title: '服务列表',
    type: 'express',
    posts: []
  },

  onLoad(options) {
    const type = options.type || 'express';
    const service = serviceTypes.find((item) => item.key === type);
    this.setData({
      type,
      title: service ? service.name : '服务列表',
      posts: posts.filter((post) => post.type === type)
    });
    wx.setNavigationBarTitle({
      title: service ? service.name : '服务列表'
    });
    this.loadPosts(type);
  },

  async loadPosts(type) {
    const nextPosts = await getPosts(type);
    this.setData({
      posts: nextPosts
    });
  },

  goDetail(event) {
    wx.navigateTo({
      url: `/pages/service-detail/service-detail?id=${event.currentTarget.dataset.id}`
    });
  }
});
