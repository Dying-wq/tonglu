const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

// 左滑「删除」：只把会话从「我」的列表里拿掉。
//
// 三个不动：
// - 不动对方那边（微信的删除就是单方面的视图操作）
// - 不删 messages 记录（对方还需要看到聊天记录，也便于投诉取证）
// - 不改会话状态（拉黑状态、关联内容都保持原样）
//
// 做法是给会话打一个 hiddenMap[openid] = true 标记，getConversationList 过滤掉。
// 对方再发新消息时，sendMessage 会把双方的 hiddenMap 清掉，会话自动回到列表——
// 否则对方发了消息而我看不到，就是「消息丢了」。
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

  // 整体重写 hiddenMap，而不是写 `hiddenMap.${openid}` 这种点路径。
  // 点路径在键名异常、字段缺失时会静默不生效，而且不报错，很难排查。
  const hiddenMap = { ...(conversation.hiddenMap || {}) };
  hiddenMap[openid] = true;

  await db.collection('conversations').doc(conversationId).update({
    data: {
      hiddenMap,
      updatedAt: db.serverDate()
    }
  });

  return { ok: true, action: 'deleteConversation' };
};
