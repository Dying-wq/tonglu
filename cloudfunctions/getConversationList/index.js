const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

exports.main = async () => {
  const openid = cloud.getWXContext().OPENID;
  // 不过滤 status === 'blocked' 的会话：
  // 拉黑后如果会话从列表消失，用户就再也点不进聊天页，也就无法「取消拉黑」。
  // 拉黑状态改为在列表里打标显示，会话本身保留。
  const res = await db.collection('conversations')
    .where({
      participantIds: _.all([openid])
    })
    .orderBy('lastMessageAt', 'desc')
    .limit(100)
    .get();

  const conversations = res.data.map((item) => {
    const ids = item.participantIds || item.participantOpenids || [];
    return {
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
      status: item.status || 'active',
      // 对方的 openid：聊天页据此判断「是我拉黑了对方」还是「对方拉黑了我」
      peerOpenid: ids.find((id) => id !== openid) || ''
    };
  });

  return { ok: true, conversations };
};
