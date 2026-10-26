const { CLOUD_ENV_ID } = require('./config');
const { createPost } = require('./utils/cloud-api');
const {
  readPendingPosts,
  writePendingPosts,
  flushPendingPosts: flushQueue
} = require('./utils/draft');

App({
  globalData: {
    userInfo: null,
    cloudReady: false,
    openid: '',
    // 车次绑定状态
    trainBinding: null,
    // 隐私提示是否已展示
    privacyNoticeShown: false
  },

  onLaunch() {
    if (wx.cloud) {
      const cloudOptions = {
        traceUser: true
      };
      if (CLOUD_ENV_ID) {
        cloudOptions.env = CLOUD_ENV_ID;
      }
      wx.cloud.init(cloudOptions);
      this.globalData.cloudReady = true;
      this.refreshUnreadBadge();
      this.loadTrainBinding();
      this.checkPrivacyNotice();
    }
  },

  onShow() {
    this.refreshUnreadBadge();
    this.loadTrainBinding();
    this.retryPendingPosts();
  },

  // 弱网兜底：把发布失败暂存在本地的内容补发出去（报告书 6.1.1）
  async retryPendingPosts() {
    if (!this.globalData.cloudReady || this.flushingPending) return;
    const pending = readPendingPosts();
    if (!pending.length) return;

    this.flushingPending = true;
    try {
      const { sent, failed } = await flushQueue(pending, async (payload) => {
        const result = await createPost(payload);
        return Boolean(result && result.ok);
      });
      writePendingPosts(failed);
      if (sent.length > 0) {
        wx.showToast({ title: `${sent.length} 条暂存内容已自动发布`, icon: 'none' });
      }
    } finally {
      this.flushingPending = false;
    }
  },

  // 加载车次绑定状态
  loadTrainBinding() {
    const stored = wx.getStorageSync('trainBinding');
    if (stored && stored.trainNo) {
      // 检查是否已过期（到站自动解除）
      if (stored.arrivalTs && Date.now() > stored.arrivalTs) {
        wx.removeStorageSync('trainBinding');
        this.globalData.trainBinding = null;
      } else {
        this.globalData.trainBinding = stored;
      }
    } else {
      this.globalData.trainBinding = null;
    }
  },

  // 设置车次绑定
  setTrainBinding(binding) {
    if (binding) {
      wx.setStorageSync('trainBinding', binding);
    } else {
      wx.removeStorageSync('trainBinding');
    }
    this.globalData.trainBinding = binding;
  },

  // 首次使用隐私提示
  checkPrivacyNotice() {
    const shown = wx.getStorageSync('privacyNoticeShown');
    if (!shown) {
      this.globalData.privacyNoticeShown = false;
    } else {
      this.globalData.privacyNoticeShown = true;
    }
  },

  markPrivacyNoticeShown() {
    wx.setStorageSync('privacyNoticeShown', true);
    this.globalData.privacyNoticeShown = true;
  },

  refreshUnreadBadge() {
    if (!this.globalData.cloudReady || !wx.cloud || !wx.setTabBarBadge) return;
    wx.cloud.callFunction({ name: 'getUnreadCount' })
      .then((res) => {
        const count = res.result && res.result.ok ? res.result.unreadCount : 0;
        if (count > 0) {
          wx.setTabBarBadge({ index: 3, text: count > 99 ? '99+' : String(count) });
        } else {
          wx.removeTabBarBadge({ index: 3 });
        }
      })
      .catch(() => {});
  }
});
