const cloud = require('wx-server-sdk');
const { resolveTargetOpenid } = require('./target');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

// 改了云函数一定要重新「上传并部署」。这个版本号会出现在每一次返回值里，
// 在开发者工具 Console 里看到它，就说明云端跑的是这份新代码。
const VERSION = '2026-11-07.1';

// 会话记录里可能压根没写对方 openid（单账号自测时自己跟自己聊天），
// 这时再从历史消息和拉黑记录里找一次。
async function loadEvidence(conversationId, openid) {
  if (!conversationId) return { messages: [], blocks: [] };
  const [messages, blocks] = await Promise.all([
    db.collection('messages')
      .where({ conversationId })
      .limit(20)
      .get()
      .then((res) => res.data || [])
      .catch(() => []),
    db.collection('blocks')
      .where(_.or([
        { blockerId: openid },
        { blockerOpenid: openid },
        { targetId: openid },
        { targetOpenid: openid }
      ]))
      .limit(50)
      .get()
      .then((res) => res.data || [])
      .catch(() => [])
  ]);
  return { messages, blocks };
}

// 取消拉黑：把该用户对目标的拉黑记录置为 inactive，并恢复会话状态。
// 保留历史记录（不物理删除），便于后续做「拉黑记录」查询和风控统计。
exports.main = async (event = {}) => {
  const openid = cloud.getWXContext().OPENID;
  const conversationId = event.conversationId || '';
  // 前端可以带一个 peerOpenid 作为提示，但只作为提示，服务端会校验
  const hint = event.targetOpenid || event.peerOpenid || '';

  if (!conversationId && !hint) {
    return { ok: false, code: 'TARGET_REQUIRED', version: VERSION, message: '缺少取消拉黑的对象。' };
  }

  // 先读会话：既能推断对方是谁，也能判断会话当前是否真的处于拉黑状态
  let conversation = null;
  if (conversationId) {
    try {
      const doc = await db.collection('conversations').doc(conversationId).get();
      conversation = doc.data || {};
    } catch (error) {
      return {
        ok: false,
        code: 'CONVERSATION_NOT_FOUND',
        version: VERSION,
        message: '会话不存在或无权访问。'
      };
    }
  }

  let targetOpenid = resolveTargetOpenid({ conversation: conversation || {}, openid, hint });
  if (!targetOpenid && conversationId) {
    const evidence = await loadEvidence(conversationId, openid);
    targetOpenid = resolveTargetOpenid({ conversation: conversation || {}, openid, hint, ...evidence });
  }

  const participantIds = (conversation && (conversation.participantIds || conversation.participantOpenids)) || [];

  // 推不出对方 = 会话里只有自己（单账号自测常见），或状态是手工改出来的脏数据。
  // 早期版本在这里直接报「无法确定要取消拉黑的用户。」，
  // 用户会永远卡在「已拉黑」，其实会话里根本没有真实的拉黑对象：
  // 直接把状态恢复正常，并明确告诉用户这是自测场景。
  if (!targetOpenid) {
    const dirty = Boolean(conversation)
      && (conversation.status === 'blocked' || Boolean(conversation.blockedBy));
    if (conversationId && dirty) {
      try {
        await db.collection('conversations').doc(conversationId).update({
          data: {
            status: 'active',
            blockedBy: '',
            // 解除拉黑时把「删除会话」的隐藏标记一起清掉：
            // 用户可能已经左滑删掉了这条会话，不清的话解除后仍然找不到人，
            // 会以为「解除了但什么都没变」。
            hiddenMap: {},
            unblockedAt: db.serverDate(),
            updatedAt: db.serverDate()
          }
        });
        return {
          ok: true,
          updated: 0,
          targetOpenid: '',
          selfOnly: true,
          participantCount: participantIds.length,
          version: VERSION,
          warning: '当前会话里只有你自己（单账号自测常见），没有真实的拉黑对象；已直接恢复会话状态。真实双账号会话不受影响。'
        };
      } catch (error) {
        return {
          ok: false,
          code: 'CONVERSATION_UPDATE_FAILED',
          version: VERSION,
          message: '会话状态恢复失败，请重新进入会话再试。'
        };
      }
    }
    return {
      ok: false,
      code: 'TARGET_REQUIRED',
      version: VERSION,
      participantCount: participantIds.length,
      message: '会话里没有第二个参与者，无法确定要取消拉黑的用户。请用第二个账号发帖后进入聊天再测。'
    };
  }

  // 从黑名单页进来时只带 targetOpenid，没有 conversationId
  // （用户很可能已经把那条会话左滑删掉了）。
  // 这里按参与者反查一次，否则 blocks 记录解除了、会话状态还停在 blocked，
  // 用户看到「已解除」但聊天页依然发不出消息。
  let effectiveConversationId = conversationId;
  if (!effectiveConversationId && targetOpenid) {
    try {
      const res = await db.collection('conversations')
        .where({ participantIds: _.all([openid, targetOpenid]) })
        .limit(1)
        .get();
      const found = (res.data && res.data[0]) || null;
      if (found) {
        conversation = found;
        effectiveConversationId = found._id;
      }
    } catch (error) {
      // 反查失败就只解除 blocks 记录，不让它阻断主流程
    }
  }

  let updated = 0;
  try {
    // 兼容早期数据里 blockerOpenid / targetOpenid 的写法，
    // 逐条按 _id 更新，避免 .where().update() 在部分字段缺失时静默更新 0 条。
    const blockRes = await db.collection('blocks')
      .where(_.or([
        { blockerId: openid, targetId: targetOpenid, status: 'active' },
        { blockerId: openid, targetOpenid: targetOpenid, status: 'active' },
        { blockerOpenid: openid, targetId: targetOpenid, status: 'active' },
        { blockerOpenid: openid, targetOpenid: targetOpenid, status: 'active' }
      ]))
      .limit(20)
      .get();
    const records = blockRes.data || [];
    for (const record of records) {
      await db.collection('blocks').doc(record._id).update({
        data: {
          status: 'inactive',
          unblockedAt: db.serverDate(),
          updatedAt: db.serverDate()
        }
      });
      updated += 1;
    }
  } catch (error) {
    // blocks 集合不存在时直接返回明确原因，避免前端只看到「失败」
    return {
      ok: false,
      code: 'BLOCKS_COLLECTION_ERROR',
      version: VERSION,
      targetOpenid,
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
      version: VERSION,
      targetOpenid,
      message: '没有找到你对该用户的拉黑记录，是对方拉黑了你，需要对方解除。'
    };
  }

  // 恢复会话为正常状态，双方可以继续发消息。
  // 这里同时覆盖「blocks 里没有记录、但会话被标记为 blocked」的脏数据：
  // 早期版本拉黑时只改了会话状态，blocks 写入可能失败，
  // 如果死等 blocks 记录，用户就永远取消不掉。
  if (effectiveConversationId) {
    try {
      await db.collection('conversations').doc(effectiveConversationId).update({
        data: {
          status: 'active',
          // 清掉「谁拉黑的」标记，否则聊天页会一直认为会话处于拉黑状态
          blockedBy: '',
          // 同时清掉删除会话的隐藏标记：用户可能已经左滑删掉了这条会话，
          // 不清的话解除拉黑后仍然在列表里找不到对方。
          hiddenMap: {},
          unblockedAt: db.serverDate(),
          updatedAt: db.serverDate()
        }
      });
    } catch (error) {
      return {
        ok: true,
        updated,
        targetOpenid,
        version: VERSION,
        warning: '拉黑已解除，但会话状态恢复失败，请重新进入会话。'
      };
    }
  }

  return { ok: true, updated, targetOpenid, version: VERSION };
};
