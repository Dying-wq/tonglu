const { getConversationList, getUnreadCount, formatMessageTime } = require('../../utils/cloud-api');
const { setMessageBadge } = require('../../utils/badge');

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
      conversations: (nextConversations || []).map((item) => ({
        ...item,
        // 云函数返回的 lastMessageAt 是 Date，经 JSON 序列化后变成
        // "2026-11-06T04:48:22.483Z" 这种原始字符串，直接显示很难看
        lastMessageTime: formatMessageTime(item.lastMessageAt)
      })),
      loading: false,
      unreadCount
    });
    setMessageBadge(unreadCount);
  },

  selectTab(event) {
    this.setData({
      activeTab: event.currentTarget.dataset.index
    });
  },

  goChat(event) {
    const { id, openid, name, avatar, avatarUrl } = event.currentTarget.dataset;
    // 把对方身份一并带过去：
    // peerOpenid 用来区分「我拉黑了对方」和「对方拉黑了我」，
    // 名字和头像用来在聊天页顶部显示「正在和谁聊」。
    const query = [
      `conversationId=${id}`,
      openid ? `peerOpenid=${encodeURIComponent(openid)}` : '',
      name ? `peerName=${encodeURIComponent(name)}` : '',
      avatar ? `peerAvatarText=${encodeURIComponent(avatar)}` : '',
      avatarUrl ? `peerAvatarUrl=${encodeURIComponent(avatarUrl)}` : ''
    ].filter(Boolean).join('&');
    wx.navigateTo({
      url: `/pages/message/chat?${query}`
    });
  },

  goSettings() {
    wx.navigateTo({
      url: '/pages/user/notification-settings'
    });
  }
});
