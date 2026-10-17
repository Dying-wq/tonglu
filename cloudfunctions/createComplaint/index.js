const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event = {}) => {
  if (!event.relatedId || !event.reason) {
    return {
      ok: false,
      code: 'INVALID_COMPLAINT',
      message: '投诉需要 relatedId 和 reason。'
    };
  }

  const wxContext = cloud.getWXContext();
  const complaint = {
    relatedId: event.relatedId,
    relatedType: event.relatedType || 'order',
    complainantOpenid: wxContext.OPENID,
    targetUserOpenid: event.targetUserOpenid || '',
    reason: event.reason,
    content: event.content || '',
    status: 'pending',
    decision: '',
    creditPenalty: 0,
    adminNote: '',
    reviewedAt: null,
    createdAt: db.serverDate(),
    updatedAt: db.serverDate()
  };
  const result = await db.collection('complaints').add({ data: complaint });

  return {
    ok: true,
    action: 'createComplaint',
    complaintId: result._id,
    status: 'pending',
    message: '投诉已提交，等待管理员处理。'
  };
};
