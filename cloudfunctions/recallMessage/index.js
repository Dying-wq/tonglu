const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

// 撤回时限：2 分钟。与微信一致。
const RECALL_WINDOW_MS = 2 * 60 * 1000;

// createdAt 在不同链路里可能是 Date 对象、时间戳、ISO 字符串，
// 也可能是序列化后的 { $date: ... }。统一转成毫秒时间戳。
function toTimestamp(value) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const ts = new Date(value).getTime();
    return Number.isFinite(ts) ? ts : 0;
  }
  if (typeof value === 'object' && value.$date) {
    return Number(value.$date) || 0;
  }
  return 0;
}

// 长按「撤回」：双方都看不到这条消息。
//
// 三条硬约束，全部在服务端校验——客户端时间可以改，前端隐藏按钮不算数：
// 1) 只能撤回自己发的消息
// 2) 超过 2 分钟不能撤回
// 3) 已经撤回过的不能重复撤回
//
// 撤回后把 content 清空，只留 recalled 标记。这样即使有人直接读库，
// 也拿不到原文；getMessageList 返回时按 recalled 渲染占位文案。
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

  const sender = message.senderId || message.senderOpenid || '';
  if (sender !== openid) {
    return { ok: false, code: 'NOT_SENDER', message: '只能撤回自己发送的消息。' };
  }

  if (message.recalled) {
    return { ok: false, code: 'ALREADY_RECALLED', message: '这条消息已经撤回过了。' };
  }

  const createdTs = toTimestamp(message.createdAt);
  const elapsed = Date.now() - createdTs;
  // createdTs 为 0 说明时间字段异常，按「不可撤回」处理，
  // 宁可拒绝也不要放开一个无法校验的窗口
  if (!createdTs || elapsed > RECALL_WINDOW_MS) {
    const minutes = createdTs ? Math.floor(elapsed / 60000) : 0;
    return {
      ok: false,
      code: 'RECALL_EXPIRED',
      message: createdTs
        ? `这条消息发送于 ${minutes} 分钟前，超过 2 分钟不能撤回。`
        : '无法确认消息发送时间，不能撤回。'
    };
  }

  await db.collection('messages').doc(messageId).update({
    data: {
      recalled: true,
      recalledAt: db.serverDate(),
      // 正文清空，避免撤回后仍能从数据库或接口读回原文
      content: '',
      updatedAt: db.serverDate()
    }
  });

  // 撤回的如果正好是会话的最后一条，会话列表的摘要还留着原文，必须一起改。
  // 只比对内容不够严谨，但 lastMessage 就是发消息时写入的原文，
  // 命中即说明这条就是列表上显示的那条。
  try {
    if (conversation.lastMessage && conversation.lastMessage === message.content) {
      await db.collection('conversations').doc(conversationId).update({
        data: {
          lastMessage: '[消息已撤回]',
          updatedAt: db.serverDate()
        }
      });
    }
  } catch (error) {
    // 摘要更新失败不影响撤回本身，会话列表最多短暂显示旧内容
  }

  return { ok: true, action: 'recallMessage', messageId };
};
