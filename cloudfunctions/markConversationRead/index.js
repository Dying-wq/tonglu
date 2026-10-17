const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event = {}) => {
  if (!event.conversationId) return { ok: false, code: 'CONVERSATION_REQUIRED', message: '缺少会话 ID。' };
  const openid = cloud.getWXContext().OPENID;
  await db.collection('conversations').doc(event.conversationId).update({
    data: {
      [`unreadMap.${openid}`]: 0,
      updatedAt: db.serverDate()
    }
  });
  await db.collection('messages')
    .where({ conversationId: event.conversationId, receiverId: openid })
    .update({ data: { isRead: true } });
  return { ok: true, unreadCount: 0 };
};
