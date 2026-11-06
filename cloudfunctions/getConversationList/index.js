const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

// 批量取用户资料。_.in 单次最多 100 个值，超过要分片。
async function loadPeerProfiles(openids) {
  const unique = Array.from(new Set(openids.filter(Boolean)));
  const profiles = {};
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    try {
      const res = await db.collection('users')
        .where({ openid: _.in(chunk) })
        .limit(100)
        .get();
      (res.data || []).forEach((user) => {
        profiles[user.openid] = user;
      });
    } catch (error) {
      // 查不到资料时退回会话里存的名字，不能让整张会话列表失败
    }
  }
  return profiles;
}

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

  const rows = res.data || [];
  const peerIds = rows.map((item) => {
    const ids = item.participantIds || item.participantOpenids || [];
    return ids.find((id) => id !== openid) || '';
  });
  const profiles = await loadPeerProfiles(peerIds);

  const conversations = rows.map((item, index) => {
    const peerOpenid = peerIds[index];
    const profile = profiles[peerOpenid] || {};
    const stored = (item.participantInfo && item.participantInfo[peerOpenid]) || {};

    // 显示名必须按「对方」算，不能用会话里存的单一字段。
    // 老数据把 peerName 存成了发布者昵称，对发布者本人来说等于显示自己，
    // 所以取值顺序是：users 表最新资料 → 建会话时存的对方资料 → 老字段兜底。
    const name = profile.nickname || stored.name || item.peerName || '成理同学';
    const avatarText = profile.avatarText
      || stored.avatarText
      || (profile.nickname ? profile.nickname.slice(0, 1) : '')
      || name.slice(0, 1);
    const avatarUrl = profile.avatarUrl || stored.avatarUrl || '';
    const rankName = profile.creditLevelName || profile.rankName || stored.rankName || '青铜';

    return {
      id: item._id,
      relatedType: item.relatedType,
      relatedId: item.relatedId,
      relatedTitle: item.relatedTitle || item.postTitle || '关联内容',
      relatedSummary: item.relatedSummary || '',
      postId: item.postId,
      orderId: item.orderId,
      name,
      avatarText,
      avatarUrl,
      rankName,
      lastMessage: item.lastMessage || '暂无消息',
      lastMessageAt: item.lastMessageAt,
      unread: Number(item.unreadMap && item.unreadMap[openid]) || 0,
      status: item.status || 'active',
      // 对方的 openid：聊天页据此判断「是我拉黑了对方」还是「对方拉黑了我」
      peerOpenid
    };
  });

  return { ok: true, conversations };
};
