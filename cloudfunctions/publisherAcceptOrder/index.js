const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event = {}) => {
  if (!event.orderId) {
    return {
      ok: false,
      code: 'ORDER_REQUIRED',
      message: '接受接单需要 orderId。'
    };
  }

  const wxContext = cloud.getWXContext();
  const orderRes = await db.collection('orders').doc(event.orderId).get();
  const order = orderRes.data;

  if (!order || order.status !== 'pending_accept') {
    return {
      ok: false,
      code: 'ORDER_NOT_PENDING',
      message: '该申请不可接受。'
    };
  }

  if (order.publisherOpenid !== wxContext.OPENID) {
    return {
      ok: false,
      code: 'ONLY_PUBLISHER_CAN_ACCEPT',
      message: '只有发布者可以接受接单。'
    };
  }

  const postRes = await db.collection('posts').doc(order.postId).get();
  const post = postRes.data;
  if (!post || post.status !== 'open') {
    return {
      ok: false,
      code: 'POST_NOT_OPEN',
      message: '该帖子已经不可接受接单。'
    };
  }

  await db.collection('orders').doc(event.orderId).update({
    data: {
      status: 'in_progress',
      acceptedAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
  });

  await db.collection('posts').doc(order.postId).update({
    data: {
      status: 'locked',
      acceptedOrderId: event.orderId,
      updatedAt: db.serverDate()
    }
  });

  await db.collection('conversations').doc(order.conversationId).update({
    data: {
      lastMessage: '发布者已接受接单，任务进入进行中。',
      lastMessageAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
  }).catch(() => null);

  return {
    ok: true,
    action: 'publisherAcceptOrder',
    orderStatus: 'in_progress',
    postStatus: 'locked',
    message: '已接受接单，帖子已从公开列表隐藏。'
  };
};
