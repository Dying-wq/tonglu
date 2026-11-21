const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

// 版本号写进返回值：部署后可在 Console 里确认云端跑的是不是新代码
const VERSION = '2026-11-21.1';

// 从会话里推出对方 openid。
// 会话字段被改坏时，participantInfo 的 key 和 peerOpenid 往往还留着对方的 openid。
function pickPeer(data, openid) {
  const ids = data.participantIds || data.participantOpenids || [];
  const fromIds = ids.find((id) => id !== openid);
  if (fromIds) return fromIds;
  const fromInfo = Object.keys(data.participantInfo || {}).find((id) => id !== openid);
  if (fromInfo) return fromInfo;
  if (data.peerOpenid && data.peerOpenid !== openid) return data.peerOpenid;
  return '';
}

async function getDoc(collection, id) {
  if (!id) return null;
  try {
    const res = await db.collection(collection).doc(id).get();
    return res.data || null;
  } catch (error) {
    return null;
  }
}

exports.main = async (event = {}) => {
  const openid = cloud.getWXContext().OPENID;
  const targetType = event.targetType || (event.messageId ? 'message' : 'conversation');
  const targetId = event.targetId || event.messageId || event.conversationId;
  if (!targetId) {
    return { ok: false, code: 'TARGET_REQUIRED', version: VERSION, message: '缺少举报对象。' };
  }

  let targetUserOpenid = event.targetUserOpenid || '';
  let conversationId = event.conversationId || '';

  if (!targetUserOpenid) {
    if (targetType === 'message') {
      const message = await getDoc('messages', targetId);
      if (message) {
        conversationId = conversationId || message.conversationId || '';
        const sender = message.senderOpenid || message.senderId || '';
        targetUserOpenid = sender && sender !== openid ? sender : '';
      }
    } else {
      const conversation = await getDoc('conversations', conversationId || targetId);
      if (conversation) {
        conversationId = conversationId || targetId;
        targetUserOpenid = pickPeer(conversation, openid);
      }
    }
  }

  // 举报必须落到具体的人身上，否则管理员成立投诉时没有扣分对象
  if (!targetUserOpenid) {
    return {
      ok: false,
      code: 'TARGET_REQUIRED',
      version: VERSION,
      message: '没能从会话里定位被举报人，请从帖子或对方主页进入后再举报。'
    };
  }
  if (targetUserOpenid === openid) {
    return { ok: false, code: 'TARGET_REQUIRED', version: VERSION, message: '不能举报自己。' };
  }

  // 同一举报人对同一对象的待处理举报只保留一条，避免重复点击刷屏
  const duplicate = await db.collection('complaints').where({
    complainantOpenid: openid,
    relatedId: targetId,
    status: 'pending'
  }).limit(1).get();
  if (duplicate.data.length) {
    return { ok: true, duplicate: true, version: VERSION, message: '已提交过举报，等待管理员处理。' };
  }

  // 统一写入 complaints：聊天页举报与投诉页举报共用同一套管理员审核流程
  const result = await db.collection('complaints').add({
    data: {
      relatedId: targetId,
      relatedType: targetType,
      conversationId,
      complainantOpenid: openid,
      targetUserOpenid,
      reason: event.reason || '其他',
      content: event.content || '',
      evidence: event.evidence || [],
      status: 'pending',
      decision: '',
      creditPenalty: 0,
      adminNote: '',
      reviewedAt: null,
      createdAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
  });

  return { ok: true, complaintId: result._id, targetUserOpenid, version: VERSION };
};
