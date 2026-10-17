const { conversations } = require('../../utils/mock-data');
const { getConversationList, getUnreadCount } = require('../../utils/cloud-api');

Page({
  data: {
    conversations,
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
    const finalConversations = nextConversations.length ? nextConversations : conversations;
    this.setData({
      conversations: finalConversations,
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
    wx.navigateTo({
      url: `/pages/message/chat?conversationId=${event.currentTarget.dataset.id}`
    });
  },

  goSettings() {
    wx.navigateTo({
      url: '/pages/user/notification-settings'
    });
  }
});
