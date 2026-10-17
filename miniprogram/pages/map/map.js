const categories = ['全部', '教学楼', '宿舍', '食堂', '图书馆', '运动场', '快递点', '失物地点'];

const pois = [
  {
    id: 'poi_library',
    name: '图书馆',
    category: '图书馆',
    x: 48,
    y: 34,
    description: '自习、资料交接、学习互助常用地点',
    tags: ['学习互助', '找搭子']
  },
  {
    id: 'poi_dorm_3',
    name: '3 号宿舍',
    category: '宿舍',
    x: 70,
    y: 58,
    description: '代取送达高频区域',
    tags: ['代取', '代办']
  },
  {
    id: 'poi_express',
    name: '菜鸟驿站',
    category: '快递点',
    x: 24,
    y: 66,
    description: '快递代取集中发布地点',
    tags: ['代取']
  },
  {
    id: 'poi_court',
    name: '西区球场',
    category: '运动场',
    x: 34,
    y: 46,
    description: '篮球、羽毛球、足球活动集合点',
    tags: ['约球']
  },
  {
    id: 'poi_canteen',
    name: '一食堂',
    category: '食堂',
    x: 58,
    y: 72,
    description: '饭搭子、外卖代取和临时帮买常用地点',
    tags: ['找搭子', '代办']
  }
];

Page({
  data: {
    categories,
    activeCategory: '全部',
    keyword: '',
    pois,
    visiblePois: pois,
    selectedPoi: pois[0]
  },

  selectCategory(event) {
    const activeCategory = event.currentTarget.dataset.category;
    this.setData({ activeCategory }, this.applyFilters);
  },

  updateKeyword(event) {
    this.setData({ keyword: event.detail.value }, this.applyFilters);
  },

  applyFilters() {
    const { activeCategory, keyword } = this.data;
    const word = keyword.trim();
    const visiblePois = pois.filter((poi) => {
      const matchCategory = activeCategory === '全部' || poi.category === activeCategory;
      const matchKeyword = !word || poi.name.includes(word) || poi.description.includes(word) || poi.tags.join('').includes(word);
      return matchCategory && matchKeyword;
    });

    this.setData({
      visiblePois,
      selectedPoi: visiblePois[0] || null
    });
  },

  selectPoi(event) {
    const selectedPoi = pois.find((poi) => poi.id === event.currentTarget.dataset.id);
    this.setData({ selectedPoi });
  },

  goNearby() {
    if (!this.data.selectedPoi) return;
    wx.navigateTo({
      url: '/pages/service-list/service-list'
    });
  },

  goPublishLost() {
    wx.switchTab({
      url: '/pages/publish/publish'
    });
  }
});
