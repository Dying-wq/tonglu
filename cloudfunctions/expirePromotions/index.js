const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const command = db.command;

exports.main = async () => {
  const now = new Date();
  const res = await db.collection('promotions')
    .where({
      status: 'active',
      endedAt: command.lte(now)
    })
    .limit(100)
    .get();

  for (const item of res.data) {
    await db.collection('promotions').doc(item._id).update({
      data: {
        status: 'expired',
        updatedAt: db.serverDate()
      }
    });
    if (item.postId) {
      await db.collection('posts').doc(item.postId).update({
        data: {
          isHot: false,
          hotUntil: null,
          updatedAt: db.serverDate()
        }
      });
    }
  }

  return {
    ok: true,
    expiredCount: res.data.length
  };
};
