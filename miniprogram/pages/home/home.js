const { serviceTypes, posts } = require('../../utils/mock-data');
const { getPosts } = require('../../utils/cloud-api');
const { sortPostsByStatus, getUrgencyInfo } = require('../../utils/order-flow');
const { calcRemainingRatio } = require('../../utils/train');

const featureTiles = [
  { key: 'help', name: '求助', type: 'help' },
  { key: 'offer', name: '帮助', type: 'offer' },
  { key: 'topic', name: '话题', type: 'topic' }
];

Page({
  data: {
    serviceTypes,
    featureTiles,
    activeFilter: '',
    allPosts: [],
    feedPosts: [],
    headerTop: 44,
    trainBinding: null,
    noticeText: '同路微光提醒：禁止金钱交易，建议物物交换或无偿帮助。',
    showPrivacyNotice: false
  },

  onLoad() {
    const systemInfo = wx.getSystemInfoSync();
    this.setData({
      headerTop: systemInfo.statusBarHeight || 44
    });
    this.checkPrivacyNotice();
    this.loadTrainBinding();
    this.loadPosts();
  },

  onShow() {
    this.loadTrainBinding();
    this.loadPosts();
  },

  checkPrivacyNotice() {
    const app = getApp();
    if (app && !app.globalData.privacyNoticeShown) {
      this.setData({ showPrivacyNotice: true });
    }
  },

  closePrivacyNotice() {
    const app = getApp();
    if (app) {
      app.markPrivacyNoticeShown();
    }
    this.setData({ showPrivacyNotice: false });
  },

  loadTrainBinding() {
    const app = getApp();
    const binding = app && app.globalData.trainBinding;
    this.setData({ trainBinding: binding });
  },

  goTrainBinding() {
    wx.navigateTo({
      url: '/pages/train-binding/train-binding'
    });
  },

  selectFilter(event) {
    const item = event.currentTarget.dataset.item;
    if (!item) return;
    const feedPosts = this.data.activeFilter === item.type
      ? this.data.allPosts
      : this.data.allPosts.filter((post) => post.type === item.type);
    this.setData({
      activeFilter: this.data.activeFilter === item.type ? '' : item.type,
      feedPosts: this.data.activeFilter === item.type ? this.data.allPosts : feedPosts
    });
  },

  clearFilter() {
    this.setData({
      activeFilter: '',
      feedPosts: this.data.allPosts
    });
  },

  async loadPosts() {
    const nextPosts = await getPosts(this.data.activeFilter || undefined);
    const app = getApp();
    const cloudReady = Boolean(app && app.globalData && app.globalData.cloudReady);
    // 云开发就绪时以云端结果为准：空列表就是空列表，不能回退到演示数据
    const allPosts = cloudReady ? (nextPosts || []) : posts;

    // 计算紧急程度颜色：按「绑定时长 + 到达时间」实时算剩余车程，不再用写死的静态比例
    const binding = app && app.globalData.trainBinding;
    const remainingRatio = binding ? calcRemainingRatio(binding) : 1;

    const enrichedPosts = allPosts.map((post) => {
      if (post.urgencyColor) return post; // 已有颜色
      const urgencyInfo = getUrgencyInfo(remainingRatio, post.createdAtTs);
      return { ...post, urgencyLevel: urgencyInfo.level, urgencyColor: urgencyInfo.color };
    });

    const sorted = sortPostsByStatus(enrichedPosts);

    this.setData({
      allPosts: sorted,
      feedPosts: this.data.activeFilter
        ? sorted.filter((post) => post.type === this.data.activeFilter)
        : sorted
    });
  },

  goDetail(event) {
    wx.navigateTo({
      url: `/pages/service-detail/service-detail?id=${event.currentTarget.dataset.id}`
    });
  },

  goRules() {
    wx.navigateTo({
      url: '/pages/rules/rules'
    });
  },

  goSearch() {
    wx.navigateTo({
      url: '/pages/search/search'
    });
  }
});
