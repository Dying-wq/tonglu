const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

const HELP_COMPLETED_SCORE = 5;

exports.main = async (event = {}) => {
  if (!event.orderId) {
    return {
      ok: false,
      code: 'INVALID_CONFIRM',
      message: '确认完成需要 orderId。'
    };
  }

  const wxContext = cloud.getWXContext();
  const orderRes = await db.collection('orders').doc(event.orderId).get();
  const order = orderRes.data;

  if (order.publisherOpenid !== wxContext.OPENID) {
    return {
      ok: false,
      code: 'ONLY_PUBLISHER_CAN_CONFIRM',
      message: '只有求助者可以确认完成。'
    };
  }

  // 更新订单状态
  await db.collection('orders').doc(event.orderId).update({
    data: {
      status: 'completed',
      publisherConfirmedAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
  });

  // 更新帖子状态为已解决
  if (order.postId) {
    await db.collection('posts').doc(order.postId).update({
      data: {
        status: 'resolved',
        resolved: true,
        updatedAt: db.serverDate()
      }
    });
  }

  // 帮助者信用分 +5，helpCount +1
  if (order.takerOpenid) {
    await db.collection('users').where({ openid: order.takerOpenid }).update({
      data: {
        creditScore: _.inc(HELP_COMPLETED_SCORE),
        helpCount: _.inc(1),
        monthlyCompletedCount: _.inc(1),
        lastCompletedAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    });

    // 求助者 thankCount +1（被感谢次数）
    // 同时在感谢墙添加记录
    await db.collection('thank_wall').add({
      data: {
        fromOpenid: wxContext.OPENID,
        fromName: '匿名旅客',
        toOpenid: order.takerOpenid,
        toName: '匿名旅客',
        content: event.thankMessage || '感谢帮助！',
        orderId: event.orderId,
        createdAt: db.serverDate()
      }
    });

    // 求助者也被记录一次感谢
    await db.collection('users').where({ openid: order.takerOpenid }).update({
      data: {
        thankCount: _.inc(1)
      }
    });
  }

  return {
    ok: true,
    action: 'confirmComplete',
    orderStatus: 'completed',
    creditChange: HELP_COMPLETED_SCORE
  };
};
