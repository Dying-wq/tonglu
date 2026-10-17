const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event = {}) => {
  if (!event.postId) {
    return {
      ok: false,
      code: 'INVALID_ORDER',
      message: '接单/下单/报名需要 postId。'
    };
  }

  const wxContext = cloud.getWXContext();
  const postRes = await db.collection('posts').doc(event.postId).get();
  const post = postRes.data;

  if (!post || post.status !== 'open') {
    return {
      ok: false,
      code: 'POST_NOT_OPEN',
      message: '该内容不可接单。'
    };
  }

  if (post.publisherOpenid === wxContext.OPENID) {
    return {
      ok: false,
      code: 'SELF_ORDER_NOT_ALLOWED',
      message: '不能接自己发布的内容。'
    };
  }

  const orderData = {
    postId: event.postId,
    postType: post.type,
    title: post.title,
    publisherOpenid: post.publisherOpenid,
    takerOpenid: wxContext.OPENID,
    amount: Number(post.price) || 0,
    status: 'pending_accept',
    publisherConfirmedAt: null,
    completedAt: null,
    createdAt: db.serverDate(),
    updatedAt: db.serverDate()
  };

  const orderResult = await db.collection('orders').add({ data: orderData });
  const participantIds = [post.publisherOpenid, wxContext.OPENID];
  const conversationData = {
    orderId: orderResult._id,
    postId: event.postId,
    relatedType: 'order',
    relatedId: orderResult._id,
    relatedTitle: post.title,
    relatedSummary: post.description || '',
    participantIds,
    participantOpenids: participantIds,
    lastMessage: '对方已发起接单申请，请私聊协商后由发布者确认接受。',
    lastMessageAt: db.serverDate(),
    unreadMap: {
      [post.publisherOpenid]: 1,
      [wxContext.OPENID]: 0
    },
    status: 'active',
    wechatExchangeStatus: 'none',
    createdAt: db.serverDate(),
    updatedAt: db.serverDate()
  };
  const conversationResult = await db.collection('conversations').add({ data: conversationData });

  await db.collection('orders').doc(orderResult._id).update({
    data: {
      conversationId: conversationResult._id
    }
  });
  try {
    await cloud.callFunction({
      name: 'sendSubscribeNotice',
      data: {
        eventType: post.type === 'sports' ? 'ball_joined' : 'order_taken',
        targetOpenid: post.publisherOpenid,
        page: `/pages/order-detail/order-detail?orderId=${orderResult._id}&conversationId=${conversationResult._id}`,
        title: post.title,
        content: '有人接单/报名，请进入会话确认。'
      }
    });
  } catch (error) {
    await db.collection('notification_logs').add({
      data: {
        eventType: 'order_taken',
        targetOpenid: post.publisherOpenid,
        status: 'pending',
        error: error.message || error.errMsg || String(error),
        createdAt: db.serverDate()
      }
    });
  }
  return {
    ok: true,
    action: 'acceptOrder',
    orderId: orderResult._id,
    conversationId: conversationResult._id,
    orderStatus: 'pending_accept',
    postStatus: 'open',
    message: '已发起接单申请，请等待发布者私聊确认。'
  };
};
