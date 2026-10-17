const { saveSubscribeAuth } = require('../../utils/cloud-api');
const { CHANNEL_LABELS, requestSubscribe } = require('../../utils/subscribe');

const settingItems = [
  { key: 'chat', title: '回帖提醒', desc: '有人响应你的求助或帮助时提醒' },
  { key: 'order', title: '互助提醒', desc: '帮助响应状态变化提醒' },
  { key: 'activity', title: '话题提醒', desc: '话题打卡有新回复时提醒' },
  { key: 'system', title: '系统通知', desc: '举报、申诉、平台处理结果提醒' }
];

Page({
  data: {
    settingItems: settingItems.map((item) => ({ ...item, enabled: true })),
    settings: {
      chat: true,
      order: true,
      activity: true,
      lost: true,
      hot: true,
      system: true
    },
    statusText: '开启后，有人联系你、接单、报名或认领时可收到微信服务通知。'
  },

  onLoad() {
    const saved = wx.getStorageSync('notificationSettings');
    if (saved) {
      this.setData({
        settings: saved,
        settingItems: settingItems.map((item) => ({ ...item, enabled: Boolean(saved[item.key]) }))
      });
    }
  },

  toggleSetting(event) {
    const key = event.currentTarget.dataset.key;
    const settings = {
      ...this.data.settings,
      [key]: !this.data.settings[key]
    };
    wx.setStorageSync('notificationSettings', settings);
    this.setData({
      settings,
      settingItems: this.data.settingItems.map((item) => item.key === key ? { ...item, enabled: settings[key] } : item)
    });
  },

  async requestAllSubscribe() {
    const channels = this.data.settingItems.filter((item) => item.enabled).map((item) => item.key);
    const result = await requestSubscribe(channels);
    await saveSubscribeAuth({
      channels,
      auth: result.auth,
      settings: this.data.settings,
      scene: 'notification_settings'
    });
    const accepted = Object.keys(result.auth || {}).filter((key) => result.auth[key]).map((key) => CHANNEL_LABELS[key]);
    this.setData({
      statusText: accepted.length ? `已开启：${accepted.join('、')}` : '未获取到授权，仍会保留小程序内红点提醒。'
    });
  }
});
