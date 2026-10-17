const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

function getContactRole(type) {
  if (type === 'secondhand') return '联系卖家';
  if (type === 'sports') return '联系组织者';
  return '联系发布人';
}

exports.main = async (event = {}) => {
  if (!event.relatedId && !event.postId && !event.orderId) {
    return { ok: false, code: 'RELATED_REQUIRED', message: '需要关联内容。' };
  }

  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const relatedType = event.relatedType || (event.orderId ? 'order' : 'post');
  const relatedId = event.relatedId || event.postId || event.orderId;

  let post = null;
  let order = null;
  if (relatedType === 'order') {
    const orderRes = await db.collection('orders').doc(relatedId).get();
    order = orderRes.data;
    const postRes = await db.collection('posts').doc(order.postId).get();
    post = postRes.data;
  } else {
    const postRes = await db.collection('posts').doc(relatedId).get();
    post = postRes.data;
  }

  if (!post || !post.publisherOpenid) {
    return { ok: false, code: 'RELATED_NOT_FOUND', message: '关联内容不存在。' };
  }

  const publisherOpenid = post.publisherOpenid;
  const participantIds = Array.from(new Set([publisherOpenid, openid]));
  const existing = await db.collection('conversations')
    .where({
      relatedType,
      relatedId,
      participantIds: _.all(participantIds)
    })
    .limit(1)
    .get();

  if (existing.data.length) {
    return {
      ok: true,
      action: 'reuseConversation',
      conversationId: existing.data[0]._id,
      conversation: existing.data[0]
    };
  }

  const publisherName = post.publisherInfo && post.publisherInfo.nickname ? post.publisherInfo.nickname : '发布者';
  const lastMessage = `${getContactRole(post.type)}会话已创建，可以开始沟通细节。`;
  const result = await db.collection('conversations').add({
    data: {
      relatedType,
      relatedId,
      postId: post._id || relatedId,
      orderId: order ? order._id : event.orderId || '',
      participantIds,
      participantOpenids: participantIds,
      publisherOpenid,
      peerName: publisherName,
      peerAvatarText: publisherName.slice(0, 1),
      peerRankName: post.publisherInfo && post.publisherInfo.rankName ? post.publisherInfo.rankName : '青铜',
      relatedTitle: post.title,
      relatedSummary: post.description || '',
      relatedPath: `/pages/service-detail/service-detail?id=${post._id || relatedId}`,
      lastMessage,
      lastMessageAt: db.serverDate(),
      unreadMap: participantIds.reduce((map, id) => {
        map[id] = id === openid ? 0 : 1;
        return map;
      }, {}),
      status: 'active',
      createdAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
  });

  try {
    await cloud.callFunction({
      name: 'sendSubscribeNotice',
      data: {
        eventType: post.type === 'secondhand' ? 'secondhand_consult' : (post.type === 'lost' ? 'lost_claim' : 'first_contact'),
        targetOpenid: publisherOpenid,
        page: `/pages/message/chat?conversationId=${result._id}`,
        title: post.title,
        content: lastMessage
      }
    });
  } catch (error) {
    await db.collection('notification_logs').add({
      data: {
        eventType: 'first_contact',
        targetOpenid: publisherOpenid,
        relatedType: 'chat',
        relatedId: result._id,
        page: `/pages/message/chat?conversationId=${result._id}`,
        status: 'pending',
        error: error.message || error.errMsg || String(error),
        createdAt: db.serverDate()
      }
    });
  }

  return {
    ok: true,
    action: 'createConversation',
    conversationId: result._id
  };
};
