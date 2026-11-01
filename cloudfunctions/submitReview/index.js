const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

const VALID_RATINGS = ['good', 'normal', 'bad'];

exports.main = async (event = {}) => {
  if (!event.orderId || !event.revieweeOpenid || !event.rating) {
    return {
      ok: false,
      code: 'INVALID_REVIEW',
      message: '提交评价需要 orderId、revieweeOpenid 和 rating。'
    };
  }

  if (!VALID_RATINGS.includes(event.rating)) {
    return {
      ok: false,
      code: 'INVALID_RATING',
      message: '评价类型不合法。'
    };
  }

  const wxContext = cloud.getWXContext();
  let order = null;
  try {
    const orderRes = await db.collection('orders').doc(event.orderId).get();
    order = orderRes.data;
  } catch (error) {
    order = null;
  }

  if (!order) {
    return {
      ok: false,
      code: 'ORDER_NOT_FOUND',
      message: '订单不存在。'
    };
  }

  if (order.status !== 'completed') {
    return {
      ok: false,
      code: 'ORDER_NOT_COMPLETED',
      message: '只有已完成的订单可以评价。'
    };
  }

  const isPublisher = order.publisherOpenid === wxContext.OPENID;
  const isTaker = order.takerOpenid === wxContext.OPENID;
  if (!isPublisher && !isTaker) {
    return {
      ok: false,
      code: 'NOT_PARTICIPANT',
      message: '只有订单双方可以评价。'
    };
  }

  const counterpart = isPublisher ? order.takerOpenid : order.publisherOpenid;
  if (!counterpart || counterpart !== event.revieweeOpenid) {
    return {
      ok: false,
      code: 'INVALID_REVIEWEE',
      message: '被评价人必须是订单的另一方。'
    };
  }

  const existing = await db.collection('reviews')
    .where({ orderId: event.orderId, reviewerOpenid: wxContext.OPENID })
    .limit(1)
    .get();
  if (existing.data.length) {
    return {
      ok: false,
      code: 'ALREADY_REVIEWED',
      message: '你已经评价过这笔订单。'
    };
  }

  await db.collection('reviews').add({
    data: {
      orderId: event.orderId,
      reviewerOpenid: wxContext.OPENID,
      revieweeOpenid: event.revieweeOpenid,
      rating: event.rating,
      content: String(event.content || '').slice(0, 200),
      createdAt: db.serverDate()
    }
  });

  // 按报告书口径：评价只记录口碑，不额外调整信用分。
  // 完成互助的 +5 已在 confirmComplete 中发放，避免重复加分。
  return {
    ok: true,
    action: 'submitReview',
    creditChange: 0
  };
};
