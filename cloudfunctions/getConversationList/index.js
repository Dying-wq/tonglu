const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

exports.main = async () => {
  const openid = cloud.getWXContext().OPENID;
  const res = await db.collection('conversations')
    .where({
      participantIds: _.all([openid]),
      status: _.neq('blocked')
    })
    .orderBy('lastMessageAt', 'desc')
    .limit(100)
    .get();

  const conversations = res.data.map((item) => ({
    id: item._id,
    relatedType: item.relatedType,
    relatedId: item.relatedId,
    relatedTitle: item.relatedTitle || item.postTitle || '关联内容',
    relatedSummary: item.relatedSummary || '',
    postId: item.postId,
    orderId: item.orderId,
    name: item.peerName || item.relatedTitle || '成理同学',
    avatarText: item.peerAvatarText || '成',
    rankName: item.peerRankName || '青铜',
    lastMessage: item.lastMessage || '暂无消息',
    lastMessageAt: item.lastMessageAt,
    unread: Number(item.unreadMap && item.unreadMap[openid]) || 0,
    status: item.status || 'active'
  }));

  return { ok: true, conversations };
};
