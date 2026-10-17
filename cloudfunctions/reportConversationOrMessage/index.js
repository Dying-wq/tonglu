const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event = {}) => {
  const openid = cloud.getWXContext().OPENID;
  const targetType = event.targetType || (event.messageId ? 'message' : 'conversation');
  const targetId = event.targetId || event.messageId || event.conversationId;
  if (!targetId) return { ok: false, code: 'TARGET_REQUIRED', message: '缺少举报对象。' };

  const result = await db.collection('reports').add({
    data: {
      reporterId: openid,
      reporterOpenid: openid,
      targetType,
      targetId,
      conversationId: event.conversationId || '',
      reason: event.reason || '不当内容',
      content: event.content || '',
      evidence: event.evidence || [],
      status: 'pending',
      createdAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
  });
  return { ok: true, reportId: result._id };
};
