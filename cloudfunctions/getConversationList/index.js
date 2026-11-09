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
  //
  // 但要过滤 hasMessages === false 的会话：
  // 会话在「点联系发布人」的那一刻就创建了，当时双方都还没有任何消息。
  // 过去这种空会话会直接出现在对方列表里、还带 1 条未读，看起来像「对方找我了」，
  // 实际上一个字都没发。微信的行为是不显示，这里跟它对齐。
  // 老会话没有这个字段，用 exists(false) 兜住，避免历史会话整批消失。
  const res = await db.collection('conversations')
    .where(_.and([
      { participantIds: _.all([openid]) },
      _.or([
        { hasMessages: true },
        { hasMessages: _.exists(false) }
      ])
    ]))
    .orderBy('lastMessageAt', 'desc')
    .limit(100)
    .get();

  // 左滑「删除」只删自己这一边，用 hiddenMap[openid]=true 标记。
  // 这里在取回后过滤，而不是写进 where 的点路径条件：
  // 点路径在键名异常时会静默不生效，而删除会话是低频操作，
  // 100 条上限内做一次内存过滤的代价可以忽略。
  const rows = (res.data || []).filter((item) => {
    const hiddenMap = item.hiddenMap || {};
    return hiddenMap[openid] !== true;
  });
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

  // 顺便把总未读数算出来一起返回。
  // 消息页每 5 秒轮询一次，如果列表和角标各调一个云函数，等于往返两次；
  // 而且两次读数来自不同时刻，角标可能和列表对不上。
  // 这里基于已过滤的列表求和，也天然排除了「已删除会话」的未读数。
  const unreadTotal = conversations.reduce(
    (sum, item) => sum + (Number(item.unread) || 0),
    0
  );

  return { ok: true, conversations, unreadTotal };
};
