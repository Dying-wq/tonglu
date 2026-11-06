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

// 空表单：作为 data 的初始值，避免页面首次渲染时报错。
// 真正的数据在 onLoad 里读取，不能写在 data 字面量中——
// data 里的函数调用只在模块加载时求值一次，之后永远拿到同一个旧快照，
// 表现为「保存过资料，再进来还是默认界面」。
const EMPTY_FORM = {
  avatarUrl: '',
  avatarText: '旅',
  nickname: '',
  signature: '',
  themeColor: '#1f6feb'
};

function buildInitialProfile() {
  const saved = wx.getStorageSync('customProfile') || {};
  return {
    avatarUrl: saved.avatarUrl || currentUser.avatarUrl || '',
    avatarText: saved.avatarText || currentUser.avatarText || '旅',
    nickname: saved.nickname || currentUser.nickname || '',
    signature: saved.signature || currentUser.signature || '',
    themeColor: saved.themeColor || currentUser.themeColor || '#1f6feb'
  };
}

Page({
  data: {
    form: EMPTY_FORM,
    themeColors: THEME_COLORS
  },

  // 每次进入页面都重新读取已保存的资料
  onLoad() {
    this.setData({ form: buildInitialProfile() });
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
