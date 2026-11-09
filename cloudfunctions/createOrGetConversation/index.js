const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

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

  // 会话里必须同时记住双方的显示信息。
  // 只存一个 peerName 的话，它只能对其中一方正确——发布者打开会话会看到自己的名字。
  const initiatorRes = await db.collection('users').where({ openid }).limit(1).get();
  const initiator = initiatorRes.data[0] || {};
  const initiatorName = initiator.nickname || '旅者';
  const participantInfo = {
    [publisherOpenid]: {
      name: publisherName,
      avatarText: (post.publisherInfo && post.publisherInfo.avatarText) || publisherName.slice(0, 1),
      avatarUrl: (post.publisherInfo && post.publisherInfo.avatarUrl) || '',
      rankName: (post.publisherInfo && post.publisherInfo.rankName) || '青铜'
    },
    [openid]: {
      name: initiatorName,
      avatarText: initiator.avatarText || initiatorName.slice(0, 1),
      avatarUrl: initiator.avatarUrl || '',
      rankName: initiator.creditLevelName || initiator.rankName || '青铜'
    }
  };

  const result = await db.collection('conversations').add({
    data: {
      relatedType,
      relatedId,
      postId: post._id || relatedId,
      orderId: order ? order._id : event.orderId || '',
      participantIds,
      participantOpenids: participantIds,
      participantInfo,
      publisherOpenid,
      peerName: publisherName,
      peerAvatarText: publisherName.slice(0, 1),
      peerRankName: post.publisherInfo && post.publisherInfo.rankName ? post.publisherInfo.rankName : '青铜',
      relatedTitle: post.title,
      relatedSummary: post.description || '',
      relatedPath: `/pages/service-detail/service-detail?id=${post._id || relatedId}`,

      // 会话刚建出来时没有任何真实消息。
      // 过去这里写了一条「会话已创建」当 lastMessage、还给对方记了 1 条未读，
      // 结果是：发起方只是点开对话框、一个字都没发，对方的消息列表里就已经
      // 出现了这条会话和一个红点。这与微信的行为相反，也会误导对方。
      // 现在改为：lastMessage 留空、双方未读都是 0、hasMessages=false。
      // 未开始的会话由 getConversationList 挡在列表外，
      // 真正发第一条消息时（sendMessage）才把 hasMessages 置为 true。
      lastMessage: '',
      lastMessageAt: db.serverDate(),
      unreadMap: participantIds.reduce((map, id) => {
        map[id] = 0;
        return map;
      }, {}),
      hasMessages: false,
      initiatorOpenid: openid,
      status: 'active',
      createdAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
  });

  // 订阅消息不在这里发：此刻还没有任何内容可通知。
  // 首次联系的提醒挪到 sendMessage 里，等第一条消息真正发出时再推。

  return {
    ok: true,
    action: 'createConversation',
    conversationId: result._id
  };
};
