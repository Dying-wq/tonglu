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
    // 把「是谁拉黑的」记在会话上。
    // 只写 status: 'blocked' 的话，聊天页没法判断该显示「取消拉黑」
    // 还是「等待对方解除」，只能再查一次 blocks 集合。
    await db.collection('conversations').doc(event.conversationId).update({
      data: {
        status: 'blocked',
        blockedBy: openid,
        blockedAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    });
  }
  return { ok: true, blockId: result._id, targetOpenid };
};
