const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

// 左滑「标为未读」。
//
// 语义与微信一致：这不是「恢复真实未读消息数」，而是给自己这边钉一个提醒，
// 点进会话就清零。所以这里直接把未读数置为至少 1，而不是去统计 messages。
// 真实统计会把「已经读过的历史消息」重新算成未读，红点数会大得离谱。
exports.main = async (event = {}) => {
  const conversationId = event.conversationId || '';
  if (!conversationId) {
    return { ok: false, code: 'CONVERSATION_REQUIRED', message: '缺少会话 ID。' };
  }

  const openid = cloud.getWXContext().OPENID;

  let conversation = null;
  try {
    const doc = await db.collection('conversations').doc(conversationId).get();
    conversation = doc.data || {};
  } catch (error) {
    return { ok: false, code: 'CONVERSATION_NOT_FOUND', message: '会话不存在或无权访问。' };
  }

  const participantIds = conversation.participantIds || conversation.participantOpenids || [];
  if (!participantIds.includes(openid)) {
    return { ok: false, code: 'NOT_PARTICIPANT', message: '你不是该会话成员。' };
  }

  // 与 markConversationRead 对称：整体重写，不用点路径
  const unreadMap = { ...(conversation.unreadMap || {}) };
  unreadMap[openid] = Math.max(1, Number(unreadMap[openid]) || 0);

  // 标为未读的同时要取消「删除」标记，否则列表里根本看不到这条会话，
  // 红点也就无处显示。
  const hiddenMap = { ...(conversation.hiddenMap || {}) };
  hiddenMap[openid] = false;

  await db.collection('conversations').doc(conversationId).update({
    data: {
      unreadMap,
      hiddenMap,
      updatedAt: db.serverDate()
    }
  });

  // 返回新的总未读数，前端可直接刷角标，省一次往返
  try {
    const res = await db.collection('conversations')
      .where({ participantIds: _.all([openid]) })
      .limit(100)
      .get();
    const unreadCount = (res.data || []).reduce((sum, item) => {
      const hidden = (item.hiddenMap || {})[openid] === true;
      if (hidden) return sum;
      return sum + (Number(item.unreadMap && item.unreadMap[openid]) || 0);
    }, 0);
    return { ok: true, unreadCount };
  } catch (error) {
    // -1 表示「未知」，前端收到后会重新查询一次，不能直接当 0 用
    return { ok: true, unreadCount: -1 };
  }
};
