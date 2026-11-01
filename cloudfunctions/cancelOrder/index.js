const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

const CANCELLABLE_STATUSES = ['pending_accept', 'in_progress'];

exports.main = async (event = {}) => {
  if (!event.orderId) {
    return {
      ok: false,
      code: 'INVALID_CANCEL',
      message: '取消订单需要 orderId。'
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

  const isPublisher = order.publisherOpenid === wxContext.OPENID;
  const isTaker = order.takerOpenid === wxContext.OPENID;
  if (!isPublisher && !isTaker) {
    return {
      ok: false,
      code: 'NOT_PARTICIPANT',
      message: '只有订单双方可以取消订单。'
    };
  }

  if (order.status === 'completed') {
    return {
      ok: false,
      code: 'ORDER_ALREADY_COMPLETED',
      message: '已完成的订单不能取消。'
    };
  }

  if (order.status === 'cancelled') {
    return {
      ok: true,
      action: 'cancelOrder',
      alreadyCancelled: true,
      orderStatus: 'cancelled'
    };
  }

  if (!CANCELLABLE_STATUSES.includes(order.status)) {
    return {
      ok: false,
      code: 'ORDER_NOT_CANCELLABLE',
      message: '当前订单状态不可取消。'
    };
  }

  await db.collection('orders').doc(event.orderId).update({
    data: {
      status: 'cancelled',
      cancelledAt: db.serverDate(),
      cancelledBy: wxContext.OPENID,
      updatedAt: db.serverDate()
    }
  });

  // 订单取消后，被锁定的帖子重新开放
  if (order.postId) {
    await db.collection('posts').doc(order.postId).update({
      data: {
        status: 'open',
        acceptedOrderId: '',
        updatedAt: db.serverDate()
      }
    }).catch(() => null);
  }

  if (order.conversationId) {
    await db.collection('conversations').doc(order.conversationId).update({
      data: {
        lastMessage: '订单已取消。',
        lastMessageAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    }).catch(() => null);
  }

  return {
    ok: true,
    action: 'cancelOrder',
    orderStatus: 'cancelled'
  };
};
