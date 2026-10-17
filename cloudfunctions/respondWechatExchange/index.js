const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event = {}) => {
  if (!event.requestId || !event.decision) {
    return {
      ok: false,
      code: 'INVALID_WECHAT_RESPONSE',
      message: '微信交换响应需要 requestId 和 decision。'
    };
  }

  const wxContext = cloud.getWXContext();
  const status = event.decision === 'agree' ? 'agreed' : 'rejected';
  await db.collection('wechat_exchange_requests').doc(event.requestId).update({
    data: {
      respondentOpenid: wxContext.OPENID,
      status,
      updatedAt: db.serverDate()
    }
  });

  return {
    ok: true,
    action: 'respondWechatExchange',
    status,
    message: status === 'agreed' ? '已同意交换微信。' : '已拒绝交换微信。'
  };
};
