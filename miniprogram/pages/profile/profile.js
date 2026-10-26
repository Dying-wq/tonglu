const { currentUser } = require('../../utils/mock-data');
const { login, getMyPosts, getMyOrders } = require('../../utils/cloud-api');
const { buildProfilePanels } = require('../../utils/profile');
const { getEarnedBadges, getCreditLevelName, getCreditBadgeColor } = require('../../utils/rank');

const menu = [
  { key: 'posts', title: '我的发布' },
  { key: 'orders', title: '我的参与' },
  { key: 'badges', title: '徽章' },
  { key: 'credit', title: '信用分' },
  { key: 'thanks', title: '感谢墙' },
  { key: 'reports', title: '举报申诉' },
  { key: 'rules', title: '平台规则' },
  { key: 'settings', title: '设置' }
];

function buildPanels(user, myPosts, myOrders) {
  return buildProfilePanels({
    user,
    posts: myPosts || [],
    // 真实订单数据，不再用 mock-data 的演示订单
    orders: myOrders || []
  });
}

Page({
  data: {
    user: currentUser,
    menu,
    activePanelKey: 'posts',
    activePanel: buildPanels(currentUser, [], []).posts,
    panels: buildPanels(currentUser, [], []),
    myPosts: [],
    myOrders: [],
    creditColor: '#27AE60',
    earnedBadges: []
  },

  onLoad() {
    this.initUser();
  },

  onShow() {
    const savedProfile = wx.getStorageSync('customProfile');
    if (savedProfile) {
      this.applyUser({
        ...this.data.user,
        ...savedProfile
      });
    }
    // 从订单详情页返回时刷新「我的参与」，30 秒内不重复请求（避免频繁切页打爆云函数）
    this.refreshMyData();
  },

  async refreshMyData() {
    const app = getApp();
    const openid = app && app.globalData ? app.globalData.openid : '';
    if (!openid) return;
    const now = Date.now();
    if (this.lastRefreshAt && now - this.lastRefreshAt < 30 * 1000) return;
    this.lastRefreshAt = now;

    const [myPosts, myOrders] = await Promise.all([getMyPosts(), getMyOrders()]);
    this.applyUser(this.data.user, myPosts, myOrders);
  },

  async initUser() {
    const result = await login();
    const user = result && result.user
      ? { ...this.data.user, ...result.user }
      : this.data.user;
    // 登录成功后再拉取本人发布的帖子和参与的订单，替换掉写死的演示数据
    const myPosts = await getMyPosts();
    const myOrders = await getMyOrders();
    this.applyUser(user, myPosts, myOrders);
  },

  applyUser(user, myPosts, myOrders) {
    const posts = Array.isArray(myPosts) ? myPosts : (this.data.myPosts || []);
    const orders = Array.isArray(myOrders) ? myOrders : (this.data.myOrders || []);
    // openid 用于判断订单里我是「求助者」还是「帮助者」，登录后从 globalData 取
    const app = getApp();
    const openid = (app && app.globalData && app.globalData.openid) || user.openid || '';
    const panels = buildPanels({ ...user, openid }, posts, orders);
    const badges = getEarnedBadges(user);
    const creditColor = getCreditBadgeColor(user.creditScore);

    this.setData({
      user: {
        ...user,
        creditLevelName: getCreditLevelName(user.creditScore),
        badges
      },
      myPosts: posts,
      myOrders: orders,
      panels,
      activePanel: panels[this.data.activePanelKey] || panels.posts,
      creditColor,
      earnedBadges: badges
    });
  },

  selectMenu(event) {
    const key = event.currentTarget.dataset.key;
    const panel = this.data.panels[key];
    if (!panel) return;
    this.setData({
      activePanelKey: key,
      activePanel: panel
    });
  },

  // 点击「我的发布」「我的参与」里的条目 → 跳转到对应详情页
  openPanelItem(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;

    const key = this.data.activePanelKey;
    if (key === 'posts') {
      wx.navigateTo({ url: `/pages/service-detail/service-detail?id=${id}` });
      return;
    }
    if (key === 'orders') {
      wx.navigateTo({ url: `/pages/order-detail/order-detail?orderId=${id}` });
    }
  },

  openPanelAction() {
    const key = this.data.activePanelKey;
    if (key === 'rules') {
      wx.navigateTo({ url: '/pages/rules/rules' });
      return;
    }
    if (key === 'settings') {
      this.goNotificationSettings();
      return;
    }
    if (key === 'thanks') {
      wx.switchTab({ url: '/pages/thank-wall/thank-wall' });
      return;
    }
    if (key === 'reports') {
      wx.navigateTo({ url: '/pages/complaint-submit/complaint-submit' });
    }
  },

  goAdmin() {
    wx.navigateTo({
      url: '/pages/admin/admin'
    });
  },

  goEditProfile() {
    wx.navigateTo({
      url: '/pages/profile-edit/profile-edit'
    });
  },

  goNotificationSettings() {
    wx.navigateTo({
      url: '/pages/user/notification-settings'
    });
  }
});
