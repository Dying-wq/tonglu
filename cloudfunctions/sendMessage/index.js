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

  // 对方可能把这条会话「删除」过（只删自己那一边）。新消息到达时必须让它
  // 重新出现，否则对方永远看不到这条消息，而发送方以为已经发出去了。
  const hiddenMap = { ...(conversation.hiddenMap || {}) };
  participantIds.forEach((id) => {
    hiddenMap[id] = false;
  });

  // 会话的第一条真实消息：此时才把会话「激活」，
  // 对方的会话列表也才会第一次出现这条会话。
  const isFirstMessage = conversation.hasMessages !== true;

  await db.collection('conversations').doc(event.conversationId).update({
    data: {
      lastMessage: event.content,
      lastMessageAt: db.serverDate(),
      unreadMap,
      hiddenMap,
      hasMessages: true,
      startedAt: conversation.startedAt || db.serverDate(),
      updatedAt: db.serverDate()
    }
  });

  // 首次联系的订阅提醒挪到这里：只有会话的第一条消息才推一次。
  // 放在 createOrGetConversation 里会导致「点开对话框但没发消息」就打扰对方。
  if (isFirstMessage && peerOpenid) {
    try {
      await cloud.callFunction({
        name: 'sendSubscribeNotice',
        data: {
          eventType: 'first_contact',
          targetOpenid: peerOpenid,
          page: `/pages/message/chat?conversationId=${event.conversationId}`,
          title: conversation.relatedTitle || '新消息',
          content: event.content
        }
      });
    } catch (error) {
      try {
        await db.collection('notification_logs').add({
          data: {
            eventType: 'first_contact',
            targetOpenid: peerOpenid,
            relatedType: 'chat',
            relatedId: event.conversationId,
            page: `/pages/message/chat?conversationId=${event.conversationId}`,
            status: 'pending',
            error: error.message || error.errMsg || String(error),
            createdAt: db.serverDate()
          }
        });
      } catch (logError) {
        // 日志写失败不影响消息本身，忽略
      }
    }
  }

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
