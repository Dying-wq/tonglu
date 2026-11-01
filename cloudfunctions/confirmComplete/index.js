const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

const HELP_COMPLETED_SCORE = 5;

// 与 miniprogram/utils/constants.js 的 CREDIT_LEVELS 保持一致
function getCreditLevelName(score) {
  const value = Number(score) || 0;
  if (value >= 60) return '可信任旅客';
  if (value >= 40) return '普通旅客';
  if (value >= 1) return '受限旅客';
  return '已封禁';
}

async function findUser(openid) {
  if (!openid) return null;
  const res = await db.collection('users').where({ openid }).limit(1).get();
  return res.data[0] || null;
}

exports.main = async (event = {}) => {
  if (!event.orderId) {
    return {
      ok: false,
      code: 'INVALID_CONFIRM',
      message: '确认完成需要 orderId。'
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

  if (order.publisherOpenid !== wxContext.OPENID) {
    return {
      ok: false,
      code: 'ONLY_PUBLISHER_CAN_CONFIRM',
      message: '只有求助者可以确认完成。'
    };
  }

  // 幂等：已完成的订单重复调用直接返回成功，不再重复加分
  if (order.status === 'completed') {
    return {
      ok: true,
      action: 'confirmComplete',
      alreadyCompleted: true,
      orderStatus: 'completed',
      creditChange: 0
    };
  }

  if (order.status !== 'in_progress') {
    return {
      ok: false,
      code: 'ORDER_NOT_IN_PROGRESS',
      message: '只有进行中的订单可以确认完成。'
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

  // 帮助者信用分 +5（用新分数同步等级名，避免等级与分数脱节）
  const taker = await findUser(order.takerOpenid);
  const publisher = await findUser(order.publisherOpenid);
  const currentScore = Number(taker && taker.creditScore) || 0;
  const nextScore = currentScore + HELP_COMPLETED_SCORE;

  if (order.takerOpenid) {
    await db.collection('users').where({ openid: order.takerOpenid }).update({
      data: {
        creditScore: nextScore,
        creditLevelName: getCreditLevelName(nextScore),
        helpCount: _.inc(1),
        thankCount: _.inc(1),
        monthlyCompletedCount: _.inc(1),
        lastCompletedAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    });

    // 感谢墙使用双方真实昵称，不再写死「匿名旅客」
    await db.collection('thank_wall').add({
      data: {
        fromOpenid: order.publisherOpenid,
        fromName: (publisher && publisher.nickname) || '匿名旅客',
        toOpenid: order.takerOpenid,
        toName: (taker && taker.nickname) || '匿名旅客',
        content: event.thankMessage || '感谢帮助！',
        orderId: event.orderId,
        createdAt: db.serverDate()
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
