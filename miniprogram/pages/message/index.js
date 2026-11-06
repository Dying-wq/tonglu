const { getConversationList, getUnreadCount } = require('../../utils/cloud-api');

Page({
  data: {
    // 不再用 mock-data 的演示会话兜底：那些「热心大叔」「旅者小李」是写死的假记录，
    // 点进去没有真实消息，还会让人以为拉黑后会话仍然存在。
    conversations: [],
    loading: true,
    tabs: ['全部', '私聊', '订单', '报名', '系统', '举报'],
    activeTab: 0,
    unreadCount: 0
  },

  onShow() {
    this.loadConversations();
  },

  async loadConversations() {
    const [nextConversations, unreadCount] = await Promise.all([
      getConversationList(),
      getUnreadCount()
    ]);
    this.setData({
      conversations: nextConversations || [],
      loading: false,
      unreadCount
    });
    this.syncTabBadge(unreadCount);
  },

  syncTabBadge(unreadCount) {
    if (!wx.setTabBarBadge) return;
    if (unreadCount > 0) {
      wx.setTabBarBadge({
        index: 3,
        text: unreadCount > 99 ? '99+' : String(unreadCount)
      });
      return;
    }
    wx.removeTabBarBadge({ index: 3 });
  },

  selectTab(event) {
    this.setData({
      activeTab: event.currentTarget.dataset.index
    });
  },

  goChat(event) {
    const { id, openid } = event.currentTarget.dataset;
    // 带上对方 openid：聊天页据此区分「我拉黑了对方」和「对方拉黑了我」，
    // 只有前者才显示「取消拉黑」按钮。
    const peer = openid ? `&peerOpenid=${openid}` : '';
    wx.navigateTo({
      url: `/pages/message/chat?conversationId=${id}${peer}`
    });
  },

  goSettings() {
    wx.navigateTo({
      url: '/pages/user/notification-settings'
    });
  }
});
