const { CLOUD_ENV_ID } = require('./config');

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
