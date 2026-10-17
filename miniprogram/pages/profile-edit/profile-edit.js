const { currentUser } = require('../../utils/mock-data');
const { updateProfile } = require('../../utils/cloud-api');

const THEME_COLORS = [
  { key: '#1f6feb', name: '微光蓝' },
  { key: '#27AE60', name: '同路绿' },
  { key: '#7C3AED', name: '旅途紫' },
  { key: '#EB5757', name: '暖心红' },
  { key: '#F2994A', name: '暖阳橙' },
  { key: '#14B8A6', name: '远方青' }
];

function getInitialProfile() {
  const saved = wx.getStorageSync('customProfile') || {};
  return {
    avatarUrl: saved.avatarUrl || currentUser.avatarUrl || '',
    avatarText: saved.avatarText || currentUser.avatarText || '旅',
    nickname: saved.nickname || currentUser.nickname || '旅者',
    signature: saved.signature || currentUser.signature || '',
    themeColor: saved.themeColor || currentUser.themeColor || '#1f6feb'
  };
}

Page({
  data: {
    form: getInitialProfile(),
    themeColors: THEME_COLORS
  },

  chooseAvatar(event) {
    const avatarUrl = event.detail && event.detail.avatarUrl;
    if (!avatarUrl) return;
    this.setData({
      'form.avatarUrl': avatarUrl
    });
  },

  updateField(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({
      [`form.${field}`]: event.detail.value
    });
  },

  selectTheme(event) {
    this.setData({
      'form.themeColor': event.currentTarget.dataset.color
    });
  },

  async saveProfile() {
    const nickname = this.data.form.nickname.trim();
    if (!nickname) {
      wx.showToast({
        title: '请填写昵称',
        icon: 'none'
      });
      return;
    }

    const profile = {
      ...this.data.form,
      nickname,
      avatarText: nickname.slice(0, 1)
    };
    const result = await updateProfile(profile);
    wx.setStorageSync('customProfile', profile);
    wx.showToast({
      title: result && result.ok ? '已同步保存' : '已保存本地',
      icon: 'success'
    });
    setTimeout(() => wx.navigateBack(), 450);
  }
});
