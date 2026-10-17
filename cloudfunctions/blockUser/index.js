const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event = {}) => {
  const openid = cloud.getWXContext().OPENID;
  if (!event.targetOpenid && !event.conversationId) {
    return { ok: false, code: 'TARGET_REQUIRED', message: '缺少拉黑对象。' };
  }

  let targetOpenid = event.targetOpenid || '';
  if (!targetOpenid && event.conversationId) {
    const conversation = await db.collection('conversations').doc(event.conversationId).get();
    const ids = conversation.data.participantIds || conversation.data.participantOpenids || [];
    targetOpenid = ids.find((id) => id !== openid) || '';
  }

  const result = await db.collection('blocks').add({
    data: {
      blockerId: openid,
      blockerOpenid: openid,
      targetId: targetOpenid,
      targetOpenid,
      conversationId: event.conversationId || '',
      reason: event.reason || '',
      status: 'active',
      createdAt: db.serverDate()
    }
  });
  if (event.conversationId) {
    await db.collection('conversations').doc(event.conversationId).update({
      data: { status: 'blocked', updatedAt: db.serverDate() }
    });
  }
  return { ok: true, blockId: result._id };
};
