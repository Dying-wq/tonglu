const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

const VERSION = '2026-11-07.1';

exports.main = async (event = {}) => {
  const openid = cloud.getWXContext().OPENID;
  if (!event.targetOpenid && !event.conversationId) {
    return { ok: false, code: 'TARGET_REQUIRED', version: VERSION, message: '缺少拉黑对象。' };
  }

  let targetOpenid = event.targetOpenid || '';
  if (!targetOpenid && event.conversationId) {
    const conversation = await db.collection('conversations').doc(event.conversationId).get();
    const data = conversation.data || {};
    const ids = data.participantIds || data.participantOpenids || [];
    targetOpenid = ids.find((id) => id !== openid) || '';
    // 会话字段被改坏时，participantInfo 的 key 往往还留着对方的 openid
    if (!targetOpenid) {
      targetOpenid = Object.keys(data.participantInfo || {}).find((id) => id !== openid)
        || (data.peerOpenid && data.peerOpenid !== openid ? data.peerOpenid : '');
    }
  }

  // 单账号自测时会话是「自己跟自己聊」，participantIds 只有一个人。
  // 旧版本会照样往 blocks 里写一条 targetId 为空的垃圾记录，
  // 之后取消拉黑又推不出对象，界面就卡死在「已拉黑」。这里直接拦住。
  if (!targetOpenid) {
    return {
      ok: false,
      code: 'TARGET_REQUIRED',
      version: VERSION,
      message: '当前会话里只有你自己（单账号自测场景），没有可拉黑的对象。请用第二个账号发帖后进入聊天，或在 conversations 的 participantIds 里补一个对方 openid。'
    };
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
  return { ok: true, blockId: result._id, targetOpenid, version: VERSION };
};
