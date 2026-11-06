const { getUnreadCount } = require('./cloud-api');

// 消息 tab 在 app.json 的 tabBar.list 里排第 4 个（索引 3）。
// 原来这个索引值在 app.js 和消息页里各写了一遍，改 tab 顺序时容易漏改一处。
const MESSAGE_TAB_INDEX = 3;

function setMessageBadge(count) {
  if (!wx.setTabBarBadge || !wx.removeTabBarBadge) return;
  const value = Number(count) || 0;
  if (value > 0) {
    wx.setTabBarBadge({
      index: MESSAGE_TAB_INDEX,
      text: value > 99 ? '99+' : String(value)
    });
    return;
  }
  wx.removeTabBarBadge({ index: MESSAGE_TAB_INDEX });
}

// 从云端拉一次未读数并刷新角标
async function refreshMessageBadge() {
  const count = await getUnreadCount();
  setMessageBadge(count);
  return count;
}

// 已经有未读数时直接刷角标。
// markConversationRead 会带回新的总未读数，用它比再查一次更快也更一致；
// 传 -1 表示云端统计失败，此时退回重新查询。
async function applyUnreadCount(count) {
  if (typeof count === 'number' && count >= 0) {
    setMessageBadge(count);
    return count;
  }
  return refreshMessageBadge();
}

module.exports = {
  MESSAGE_TAB_INDEX,
  setMessageBadge,
  refreshMessageBadge,
  applyUnreadCount
};
