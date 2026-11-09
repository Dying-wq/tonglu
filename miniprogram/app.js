const { CLOUD_ENV_ID } = require('./config');
const { createPost, ensureLogin } = require('./utils/cloud-api');
const { refreshMessageBadge } = require('./utils/badge');
const {
  readPendingPosts,
  writePendingPosts,
  flushPendingPosts: flushQueue
} = require('./utils/draft');

// tabBar 未读角标的全局轮询间隔。
// 比消息页的 5 秒慢：这里只查一个数字，覆盖的是「用户不在消息页」的场景，
// 没必要那么频繁。20 秒足够让人察觉有新消息，又不会把云函数调用量拉高。
const BADGE_POLL_INTERVAL = 20000;

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
      // 尽早拿到 openid：订单详情的「接受接单/确认完成」、
      // 「我的发布/我的参与」、以及帖子评论的作者判定都依赖它。
      // 之前只有聊天页和资料页会登录，从首页直接进订单页时按钮全都不显示。
      ensureLogin();
      this.refreshUnreadBadge();
      this.loadTrainBinding();
      this.checkPrivacyNotice();
    }
  },

  onShow() {
    this.refreshUnreadBadge();
    this.loadTrainBinding();
    this.retryPendingPosts();
    this.startBadgePolling();
  },

  // 小程序退到后台时停掉轮询，避免在后台空跑
  onHide() {
    this.stopBadgePolling();
  },

  // tabBar 角标的全局轮询。
  // 原来只在 onShow 刷一次：用户停在首页不动，对方发来消息，角标不会变，
  // 必须切一次页面才更新。消息页自己有 5 秒轮询，但那只在消息页生效。
  // 这里补一个更慢的全局轮询，保证在任何页面都能看到未读变化。
  startBadgePolling() {
    this.stopBadgePolling();
    if (!this.globalData.cloudReady) return;

    this.badgeTimer = setInterval(() => {
      // 消息页有更快的 5 秒轮询，并且会自己刷角标，这里跳过避免重复调用
      const pages = getCurrentPages();
      const current = pages[pages.length - 1];
      if (current && current.route === 'pages/message/index') return;
      this.refreshUnreadBadge();
    }, BADGE_POLL_INTERVAL);
  },

  stopBadgePolling() {
    if (this.badgeTimer) {
      clearInterval(this.badgeTimer);
      this.badgeTimer = null;
    }
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
    if (!this.globalData.cloudReady || !wx.cloud) return Promise.resolve(0);
    return refreshMessageBadge();
  }
});
