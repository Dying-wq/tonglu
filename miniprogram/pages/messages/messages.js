const { conversations } = require('../../utils/mock-data');
const { getConversations } = require('../../utils/cloud-api');

Page({
  data: {
    conversations,
    tabs: ['全部', '私聊', '订单', '报名', '系统', '举报'],
    activeTab: 0
  },

  onShow() {
    this.loadConversations();
  },

  async loadConversations() {
    const nextConversations = await getConversations();
    this.setData({
      conversations: nextConversations.length ? nextConversations : conversations
    });
  },

  selectTab(event) {
    this.setData({
      activeTab: event.currentTarget.dataset.index
    });
  },

  goChat(event) {
    const id = event.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/message/chat?conversationId=${id}`
    });
  }
});
