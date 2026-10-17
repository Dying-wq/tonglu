const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event = {}) => {
  if (!event.targetCollection || !event.targetId || !event.status) {
    return {
      ok: false,
      code: 'INVALID_ADMIN_ACTION',
      message: '管理员操作需要 targetCollection、targetId 和 status。'
    };
  }

  const wxContext = cloud.getWXContext();
  const adminRes = await db.collection('users').where({ openid: wxContext.OPENID, isAdmin: true }).limit(1).get();
  if (!adminRes.data.length) {
    return {
      ok: false,
      code: 'NOT_ADMIN',
      message: '当前用户不是管理员。'
    };
  }

  await db.collection(event.targetCollection).doc(event.targetId).update({
    data: {
      status: event.status,
      updatedAt: db.serverDate()
    }
  });
  await db.collection('admin_logs').add({
    data: {
      adminOpenid: wxContext.OPENID,
      targetCollection: event.targetCollection,
      targetId: event.targetId,
      status: event.status,
      note: event.note || '',
      createdAt: db.serverDate()
    }
  });

  return {
    ok: true,
    action: 'adminUpdateStatus',
    message: '状态已更新。'
  };
};
