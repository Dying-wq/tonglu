const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event = {}) => {
  if (!event.conversationId) {
    return {
      ok: false,
      code: 'INVALID_WECHAT_REQUEST',
      message: '微信交换请求需要 conversationId。'
    };
  }

  const wxContext = cloud.getWXContext();
  const request = {
    conversationId: event.conversationId,
    requesterOpenid: wxContext.OPENID,
    status: 'pending',
    createdAt: db.serverDate(),
    updatedAt: db.serverDate()
  };
  const result = await db.collection('wechat_exchange_requests').add({ data: request });

  return {
    ok: true,
    action: 'requestWechatExchange',
    requestId: result._id,
    status: 'pending',
    message: '已发送微信交换请求。'
  };
};
