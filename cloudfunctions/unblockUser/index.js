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

  // 先读会话：既能推断对方是谁，也能判断会话当前是否真的处于拉黑状态
  let conversation = null;
  if (conversationId) {
    try {
      const doc = await db.collection('conversations').doc(conversationId).get();
      conversation = doc.data || {};
    } catch (error) {
      return { ok: false, code: 'CONVERSATION_NOT_FOUND', message: '会话不存在或无权访问。' };
    }
    const ids = conversation.participantIds || conversation.participantOpenids || [];
    if (!targetOpenid) {
      targetOpenid = ids.find((id) => id !== openid) || '';
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

  // 会话当前是否处于拉黑状态，以及是不是我拉黑的
  const conversationBlocked = Boolean(conversation) && conversation.status === 'blocked';
  const blockedBy = (conversation && conversation.blockedBy) || '';
  const blockedByMe = conversationBlocked && (!blockedBy || blockedBy === openid);

  // 一条拉黑记录都没更新，且会话也不是我拉黑的状态 → 确实是对方拉黑了我
  if (updated === 0 && !blockedByMe) {
    return {
      ok: false,
      code: 'NO_ACTIVE_BLOCK',
      targetOpenid,
      message: '没有找到你对该用户的拉黑记录，是对方拉黑了你，需要对方解除。'
    };
  }

  // 恢复会话为正常状态，双方可以继续发消息。
  // 这里同时覆盖「blocks 里没有记录、但会话被标记为 blocked」的脏数据：
  // 早期版本拉黑时只改了会话状态，blocks 写入可能失败，
  // 如果死等 blocks 记录，用户就永远取消不掉。
  if (conversationId) {
    try {
      await db.collection('conversations').doc(conversationId).update({
        data: {
          status: 'active',
          // 清掉「谁拉黑的」标记，否则聊天页会一直认为会话处于拉黑状态
          blockedBy: '',
          unblockedAt: db.serverDate(),
          updatedAt: db.serverDate()
        }
      });
    } catch (error) {
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
