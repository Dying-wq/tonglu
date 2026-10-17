const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

exports.main = async (event = {}) => {
  if (!event.postId && !event.orderId) {
    return {
      ok: false,
      code: 'TARGET_REQUIRED',
      message: '需要关联帖子或订单。'
    };
  }

  const wxContext = cloud.getWXContext();
  let post = null;
  let orderId = event.orderId || '';

  if (event.postId) {
    const postRes = await db.collection('posts').doc(event.postId).get();
    post = postRes.data;
  } else if (event.orderId) {
    const orderRes = await db.collection('orders').doc(event.orderId).get();
    const order = orderRes.data;
    orderId = order._id;
    const postRes = await db.collection('posts').doc(order.postId).get();
    post = postRes.data;
  }

  if (!post || !post.publisherOpenid) {
    return {
      ok: false,
      code: 'POST_NOT_FOUND',
      message: '关联帖子不存在。'
    };
  }

  const participantOpenids = post.publisherOpenid === wxContext.OPENID
    ? [wxContext.OPENID]
    : [post.publisherOpenid, wxContext.OPENID];

  const existing = await db.collection('conversations')
    .where({
      postId: event.postId || post._id,
      participantOpenids: _.all(participantOpenids)
    })
    .limit(1)
    .get();

  if (existing.data.length) {
    return {
      ok: true,
      action: 'reuseConversation',
      conversationId: existing.data[0]._id
    };
  }

  const peerName = post.publisherInfo && post.publisherInfo.nickname ? post.publisherInfo.nickname : '发布者';
  const result = await db.collection('conversations').add({
    data: {
      orderId,
      postId: event.postId || post._id,
      postTitle: post.title,
      participantOpenids,
      peerName,
      peerAvatarText: peerName.slice(0, 1),
      peerRankName: post.publisherInfo && post.publisherInfo.rankName ? post.publisherInfo.rankName : '青铜',
      lastMessage: '会话已创建，可以开始协商细节。',
      lastMessageAt: db.serverDate(),
      unreadCount: 0,
      wechatExchangeStatus: 'none',
      createdAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
  });

  return {
    ok: true,
    action: 'createConversation',
    conversationId: result._id
  };
};
