const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

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
  const conversation = conversationRes.data || {};
  const participantIds = conversation.participantIds || conversation.participantOpenids || [];

  // 只有会话参与者可以发消息，防止知道 conversationId 的第三方插话
  if (!participantIds.includes(wxContext.OPENID)) {
    return {
      ok: false,
      code: 'NOT_PARTICIPANT',
      message: '你不是该会话成员，无法发送消息。'
    };
  }

  // 会话被拉黑后不再允许继续发送
  if (conversation.status === 'blocked') {
    return {
      ok: false,
      code: 'CONVERSATION_BLOCKED',
      message: '该会话已被拉黑，无法继续发送消息。'
    };
  }

  // 再查一次 blocks：两人互相拉黑后其中一方取消拉黑，conversations.status
  // 会回到 active，但另一方的拉黑记录仍然有效。只看会话状态会漏掉这种情况。
  const peerOpenid = participantIds.find((id) => id !== wxContext.OPENID) || '';
  if (peerOpenid) {
    try {
      const blockRes = await db.collection('blocks')
        .where(_.or([
          { blockerId: wxContext.OPENID, targetId: peerOpenid, status: 'active' },
          { blockerId: peerOpenid, targetId: wxContext.OPENID, status: 'active' }
        ]))
        .limit(1)
        .get();
      if (blockRes.data && blockRes.data.length) {
        return {
          ok: false,
          code: 'CONVERSATION_BLOCKED',
          message: '双方存在拉黑关系，无法继续发送消息。'
        };
      }
    } catch (error) {
      // blocks 集合不存在或查询失败时按「无拉黑记录」放行，
      // 不能让拉黑名单的故障连带把正常聊天也堵死。
    }
  }

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
