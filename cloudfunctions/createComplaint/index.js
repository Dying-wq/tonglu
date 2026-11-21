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

  // 同一用户对同一对象只保留一条待处理举报：
  // 重复提交会让管理员重复「成立并扣分」，被举报人被重复扣分
  const duplicate = await db.collection('complaints').where({
    complainantOpenid: wxContext.OPENID,
    relatedId: event.relatedId,
    status: 'pending'
  }).limit(1).get();
  if (duplicate.data.length) {
    return {
      ok: true,
      duplicate: true,
      action: 'createComplaint',
      complaintId: duplicate.data[0]._id,
      status: 'pending',
      message: '你已提交过该举报，正在等待管理员处理。'
    };
  }

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
