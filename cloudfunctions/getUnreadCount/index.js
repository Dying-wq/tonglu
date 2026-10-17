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
  const unreadCount = res.data.reduce((sum, item) => sum + (Number(item.unreadMap && item.unreadMap[openid]) || 0), 0);
  return { ok: true, unreadCount };
};
