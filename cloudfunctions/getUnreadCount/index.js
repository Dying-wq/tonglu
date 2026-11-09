const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

exports.main = async () => {
  const openid = cloud.getWXContext().OPENID;
  const res = await db.collection('conversations')
    .where({ participantIds: _.all([openid]) })
    .limit(100)
    .get();

  // 可见性规则必须和 getConversationList 保持一致：
  // 1) 未开始的会话（hasMessages === false）不计入——那种会话在列表里根本不显示；
  // 2) 用户左滑删除的会话（hiddenMap[我] === true）也不计入。
  // 不一致的表现就是「角标写着 2 条未读，点进去一条都找不到」。
  const unreadCount = (res.data || []).reduce((sum, item) => {
    if (item.hasMessages === false) return sum;
    if ((item.hiddenMap || {})[openid] === true) return sum;
    return sum + (Number(item.unreadMap && item.unreadMap[openid]) || 0);
  }, 0);

  return { ok: true, unreadCount };
};
