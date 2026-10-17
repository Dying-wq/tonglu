const { currentUser, demoOrder } = require('../../utils/mock-data');
const { login, getMyPosts } = require('../../utils/cloud-api');
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

function buildPanels(user, myPosts) {
  return buildProfilePanels({
    user,
    posts: myPosts || [],
    orders: [demoOrder]
  });
}

Page({
  data: {
    user: currentUser,
    menu,
    activePanelKey: 'posts',
    activePanel: buildPanels(currentUser, []).posts,
    panels: buildPanels(currentUser, []),
    myPosts: [],
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
  },

  async initUser() {
    const result = await login();
    const user = result && result.user
      ? { ...this.data.user, ...result.user }
      : this.data.user;
    // 登录成功后再拉取本人发布的帖子，替换掉写死的演示数据
    const myPosts = await getMyPosts();
    this.applyUser(user, myPosts);
  },

  applyUser(user, myPosts) {
    const posts = Array.isArray(myPosts) ? myPosts : (this.data.myPosts || []);
    const panels = buildPanels(user, posts);
    const badges = getEarnedBadges(user);
    const creditColor = getCreditBadgeColor(user.creditScore);

    this.setData({
      user: {
        ...user,
        creditLevelName: getCreditLevelName(user.creditScore),
        badges
      },
      myPosts: posts,
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
