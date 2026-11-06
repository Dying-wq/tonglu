const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

// 取消拉黑：把该用户对目标的拉黑记录置为 inactive，并恢复会话状态。
// 保留历史记录（不物理删除），便于后续做「拉黑记录」查询和风控统计。
exports.main = async (event = {}) => {
  const openid = cloud.getWXContext().OPENID;
  const conversationId = event.conversationId || '';
  let targetOpenid = event.targetOpenid || '';

  if (!conversationId && !targetOpenid) {
    return { ok: false, code: 'TARGET_REQUIRED', message: '缺少取消拉黑的对象。' };
  }

  // 只给了会话 id 时，从会话参与者里推断对方
  if (!targetOpenid && conversationId) {
    try {
      const conversation = await db.collection('conversations').doc(conversationId).get();
      const ids = conversation.data.participantIds
        || conversation.data.participantOpenids
        || [];
      targetOpenid = ids.find((id) => id !== openid) || '';
    } catch (error) {
      return { ok: false, code: 'CONVERSATION_NOT_FOUND', message: '会话不存在或无权访问。' };
    }
  }

  if (!targetOpenid) {
    return { ok: false, code: 'TARGET_REQUIRED', message: '无法确定要取消拉黑的用户。' };
  }

  let updated = 0;
  try {
    const result = await db.collection('blocks')
      .where({
        blockerId: openid,
        targetId: targetOpenid,
        status: 'active'
      })
      .update({
        data: {
          status: 'inactive',
          unblockedAt: db.serverDate(),
          updatedAt: db.serverDate()
        }
      });
    updated = (result.stats && result.stats.updated) || 0;
  } catch (error) {
    // blocks 集合不存在时直接返回明确原因，避免前端只看到「失败」
    return {
      ok: false,
      code: 'BLOCKS_COLLECTION_ERROR',
      message: '拉黑记录更新失败，请确认 blocks 集合已创建。'
    };
  }

  // 一条都没更新，说明当前用户并没有拉黑对方。
  // 最常见的情况是「对方拉黑了我」——此时不该假装成功，
  // 也不该去恢复会话状态，否则会误报「已取消拉黑」但消息依然发不出去。
  if (updated === 0) {
    return {
      ok: false,
      code: 'NO_ACTIVE_BLOCK',
      targetOpenid,
      message: '没有找到你对该用户的拉黑记录，可能是对方拉黑了你，需要对方解除。'
    };
  }

  // 恢复会话为正常状态，双方可以继续发消息
  if (conversationId) {
    try {
      await db.collection('conversations').doc(conversationId).update({
        data: { status: 'active', updatedAt: db.serverDate() }
      });
    } catch (error) {
      // 会话恢复失败不影响拉黑记录本身的解除，如实返回
      return {
        ok: true,
        updated,
        targetOpenid,
        warning: '拉黑已解除，但会话状态恢复失败，请重新进入会话。'
      };
    }
  }

  return { ok: true, updated, targetOpenid };
};
