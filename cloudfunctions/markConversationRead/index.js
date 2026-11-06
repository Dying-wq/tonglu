const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

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

  // 整体重写 unreadMap，而不是用「unreadMap 点 openid」这种点路径更新。
  // 点路径在键名特殊、字段缺失等情况下会静默不生效，
  // 表现就是「看完了消息，红点还在」，而且没有任何报错可查。
  const unreadMap = { ...(conversation.unreadMap || {}) };
  unreadMap[openid] = 0;

  await db.collection('conversations').doc(conversationId).update({
    data: {
      unreadMap,
      updatedAt: db.serverDate()
    }
  });

  // 把该会话里发给我的消息标为已读，失败不影响未读计数
  try {
    await db.collection('messages')
      .where({ conversationId, receiverId: openid })
      .update({ data: { isRead: true, read: true } });
  } catch (error) {
    // 忽略：消息级已读只用于展示，不影响红点
  }

  // 直接返回新的总未读数，前端可以立刻刷新 tabBar 角标，
  // 不用再单独调一次 getUnreadCount，省一次往返也避免两次读数不一致
  try {
    const res = await db.collection('conversations')
      .where({ participantIds: _.all([openid]) })
      .limit(100)
      .get();
    const unreadCount = (res.data || []).reduce(
      (sum, item) => sum + (Number(item.unreadMap && item.unreadMap[openid]) || 0),
      0
    );
    return { ok: true, unreadCount };
  } catch (error) {
    // 统计失败时不能返回 0——那会让角标错误地清空。
    // 返回 -1 表示「未知」，前端收到后会再走一次 getUnreadCount 复核。
    return { ok: true, unreadCount: -1 };
  }
};
