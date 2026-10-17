const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const command = db.command;

const ranks = [
  { name: '青铜', min: 0, max: 99 },
  { name: '白银', min: 100, max: 199 },
  { name: '黄金', min: 200, max: 399 },
  { name: '铂金', min: 400, max: 699 },
  { name: '钻石', min: 700, max: 999 },
  { name: '星耀', min: 1000, max: 1499 },
  { name: '王者', min: 1500, max: Infinity }
];

function applyMonthlyRankDecay(user) {
  const currentIndex = Math.max(0, ranks.findIndex((rank) => rank.name === user.rankName));

  if (user.isAdmin || user.monthlyCompletedCount > 0 || currentIndex === 0) {
    return {
      ...user,
      decayed: false
    };
  }

  const nextRank = ranks[currentIndex - 1];
  return {
    ...user,
    creditScore: nextRank.max,
    rankName: nextRank.name,
    monthlyCompletedCount: 0,
    decayed: true
  };
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext();
  const adminRes = await db.collection('users').where({ openid: wxContext.OPENID, isAdmin: true }).limit(1).get();
  const query = event.userOpenid
    ? { openid: event.userOpenid }
    : adminRes.data.length
      ? { isAdmin: command.neq(true) }
      : { openid: wxContext.OPENID };
  const users = await db.collection('users').where(query).limit(100).get();
  const results = [];

  for (const user of users.data) {
    const result = applyMonthlyRankDecay(user);
    if (result.decayed) {
      await db.collection('users').doc(user._id).update({
        data: {
          creditScore: result.creditScore,
          rankName: result.rankName,
          monthlyCompletedCount: 0,
          lastRankCheckMonth: event.month || '',
          updatedAt: db.serverDate()
        }
      });
    }
    results.push({
      userId: user._id,
      openid: user.openid,
      decayed: result.decayed,
      rankName: result.rankName,
      creditScore: result.creditScore
    });
  }

  return {
    ok: true,
    action: 'monthlyRankDecay',
    results
  };
};
