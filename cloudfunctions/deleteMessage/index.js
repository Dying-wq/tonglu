const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

// 长按「删除」：只让自己看不到这条消息。
//
// 与微信一致：删除是单方面的视图操作，对方的聊天记录不受影响，
// 也不删除数据库里的记录（投诉取证还需要原始内容）。
// 做法是往消息的 deletedFor 数组里加自己的 openid，
// getMessageList 查询时用 nin 把自己删掉的消息过滤掉。
exports.main = async (event = {}) => {
  const messageId = event.messageId || '';
  if (!messageId) {
    return { ok: false, code: 'MESSAGE_REQUIRED', message: '缺少消息 ID。' };
  }

  const openid = cloud.getWXContext().OPENID;

  let message = null;
  try {
    const doc = await db.collection('messages').doc(messageId).get();
    message = doc.data || {};
  } catch (error) {
    return { ok: false, code: 'MESSAGE_NOT_FOUND', message: '消息不存在或已被删除。' };
  }

  // 必须是这条消息所属会话的参与者，防止知道 messageId 的第三方乱删
  const conversationId = message.conversationId || '';
  let conversation = {};
  try {
    const doc = await db.collection('conversations').doc(conversationId).get();
    conversation = doc.data || {};
  } catch (error) {
    return { ok: false, code: 'CONVERSATION_NOT_FOUND', message: '会话不存在。' };
  }

  const participantIds = conversation.participantIds || conversation.participantOpenids || [];
  if (!participantIds.includes(openid)) {
    return { ok: false, code: 'NOT_PARTICIPANT', message: '你不是该会话成员。' };
  }

  // 数组去重：重复删除同一条不该产生重复 openid
  const deletedFor = Array.from(new Set([...(message.deletedFor || []), openid]));

  await db.collection('messages').doc(messageId).update({
    data: {
      deletedFor,
      updatedAt: db.serverDate()
    }
  });

  return { ok: true, action: 'deleteMessage', messageId };
};
