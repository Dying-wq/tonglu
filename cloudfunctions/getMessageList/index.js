const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event = {}) => {
  if (!event.conversationId) return { ok: false, code: 'CONVERSATION_REQUIRED', message: '缺少会话 ID。' };
  const openid = cloud.getWXContext().OPENID;
  const res = await db.collection('messages')
    .where({ conversationId: event.conversationId })
    .orderBy('createdAt', 'asc')
    .limit(100)
    .get();

  return {
    ok: true,
    messages: res.data.map((item) => ({
      id: item._id,
      sender: item.senderId === openid || item.senderOpenid === openid ? 'me' : 'other',
      senderId: item.senderId || item.senderOpenid,
      receiverId: item.receiverId,
      contentType: item.contentType || item.type || 'text',
      content: item.content,
      isRead: Boolean(item.isRead || item.read),
      riskStatus: item.riskStatus || 'safe',
      createdAt: item.createdAt
    }))
  };
};
