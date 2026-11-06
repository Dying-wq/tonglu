const { posts } = require('../../utils/mock-data');
const { getPosts } = require('../../utils/cloud-api');

// 与首页筛选栏保持一致的类型取值（help / offer / topic）
const TYPE_FILTERS = [
  { key: '', label: '全部' },
  { key: 'help', label: '求助' },
  { key: 'offer', label: '帮助' },
  { key: 'topic', label: '话题' }
];

const TYPE_LABELS = { help: '求助', offer: '帮助', topic: '话题' };

Page({
  data: {
    keyword: '',
    activeType: '',
    typeFilters: TYPE_FILTERS,
    allPosts: posts,
    results: []
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
    this.setData({ allPosts });
    this.applyFilter(this.data.keyword, this.data.activeType);
  },

  updateKeyword(event) {
    // 这里不 trim：输入过程中的空格应原样保留在输入框里，只在匹配时忽略首尾空白
    const keyword = event.detail.value;
    this.setData({ keyword });
    this.applyFilter(keyword, this.data.activeType);
  },

  clearKeyword() {
    this.setData({ keyword: '' });
    this.applyFilter('', this.data.activeType);
  },

  switchType(event) {
    const type = event.currentTarget.dataset.type || '';
    this.setData({ activeType: type });
    this.applyFilter(this.data.keyword, type);
  },

  // 关键词匹配范围：标题、正文、位置、标签、发布者昵称、发布者 openid
  // 支持搜用户 ID（openid 片段），便于定位某个用户发布的内容
  applyFilter(keyword, type) {
    const kw = String(keyword || '').trim().toLowerCase();
    const results = this.data.allPosts
      .filter((post) => {
        if (type && post.type !== type) return false;
        if (!kw) return true;
        const text = [
          post.title,
          post.description,
          post.location,
          post.tagName,
          post.publisherName,
          post.publisherOpenid
        ].filter(Boolean).join(' ').toLowerCase();
        return text.includes(kw);
      })
      .map((post) => ({ ...post, typeLabel: TYPE_LABELS[post.type] || '互助' }));
    this.setData({ results });
  },

  goDetail(event) {
    wx.navigateTo({
      url: `/pages/service-detail/service-detail?id=${event.currentTarget.dataset.id}`
    });
  }
});
