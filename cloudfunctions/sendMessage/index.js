const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

const RISK_WORDS = ['代课', '替课', '代签到', '代签', '代写', '代考试', '代考', '刷课', '出售答案', '先转账', '押金', '保证金', '低俗', '陪聊'];

function detectRisk(content) {
  const keywords = RISK_WORDS.filter((word) => String(content || '').includes(word));
  return {
    riskStatus: keywords.length ? 'warning' : 'safe',
    riskKeywords: keywords
  };
}

exports.main = async (event = {}) => {
  if (!event.conversationId || !event.content) {
    return {
      ok: false,
      code: 'INVALID_MESSAGE',
      message: '发送消息需要 conversationId 和 content。'
    };
  }

  const wxContext = cloud.getWXContext();
  const conversationRes = await db.collection('conversations').doc(event.conversationId).get();
  const conversation = conversationRes.data;
  const participantIds = conversation.participantIds || conversation.participantOpenids || [];
  const receiverIds = participantIds.filter((id) => id !== wxContext.OPENID);
  const risk = detectRisk(event.content);
  const message = {
    conversationId: event.conversationId,
    senderId: wxContext.OPENID,
    senderOpenid: wxContext.OPENID,
    receiverId: receiverIds[0] || '',
    content: event.content,
    contentType: event.type || event.contentType || 'text',
    type: event.type || event.contentType || 'text',
    isRead: false,
    read: false,
    riskStatus: risk.riskStatus,
    riskKeywords: risk.riskKeywords,
    createdAt: db.serverDate()
  };

  const result = await db.collection('messages').add({ data: message });
  const unreadMap = { ...(conversation.unreadMap || {}) };
  participantIds.forEach((id) => {
    unreadMap[id] = id === wxContext.OPENID ? (Number(unreadMap[id]) || 0) : (Number(unreadMap[id]) || 0) + 1;
  });
  await db.collection('conversations').doc(event.conversationId).update({
    data: {
      lastMessage: event.content,
      lastMessageAt: db.serverDate(),
      unreadMap,
      updatedAt: db.serverDate()
    }
  });

  return {
    ok: true,
    action: 'sendMessage',
    messageId: result._id,
    messageType: event.type || 'text',
    riskStatus: risk.riskStatus,
    riskKeywords: risk.riskKeywords,
    message
  };
};
