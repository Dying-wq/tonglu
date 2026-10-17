const ranks = [
  { name: '青铜', min: 0, max: 99 },
  { name: '白银', min: 100, max: 199 },
  { name: '黄金', min: 200, max: 399 },
  { name: '铂金', min: 400, max: 699 },
  { name: '钻石', min: 700, max: 999 },
  { name: '星耀', min: 1000, max: 1499 },
  { name: '王者', min: 1500, max: Infinity }
];

function getRankByScore(score) {
  const safeScore = Math.max(0, Number(score) || 0);
  return ranks.find((rank) => safeScore >= rank.min && safeScore <= rank.max).name;
}

function getReviewScoreChange(rating) {
  const reviewBonusMap = {
    good: 10,
    normal: 0,
    bad: -10
  };

  return {
    completionScore: 20,
    reviewBonus: reviewBonusMap[rating] || 0,
    total: 20 + (reviewBonusMap[rating] || 0)
  };
}

exports.main = async (event = {}) => {
  if (!event.orderId || !event.revieweeOpenid || !event.rating) {
    return {
      ok: false,
      code: 'INVALID_REVIEW',
      message: '提交评价需要 orderId、revieweeOpenid 和 rating。'
    };
  }

  const wxContext = cloud.getWXContext();
  const score = getReviewScoreChange(event.rating);
  const userRes = await db.collection('users').where({ openid: event.revieweeOpenid }).limit(1).get();
  const reviewee = userRes.data[0];
  const currentScore = reviewee ? Number(reviewee.creditScore) || 0 : 0;
  const nextScore = Math.max(0, currentScore + score.total);
  const nextRank = getRankByScore(nextScore);

  await db.collection('reviews').add({
    data: {
      orderId: event.orderId,
      reviewerOpenid: wxContext.OPENID,
      revieweeOpenid: event.revieweeOpenid,
      rating: event.rating,
      content: event.content || '',
      scoreChange: score.total,
      createdAt: db.serverDate()
    }
  });

  if (reviewee) {
    await db.collection('users').doc(reviewee._id).update({
      data: {
        creditScore: nextScore,
        rankName: nextRank,
        monthlyCompletedCount: command.inc(1),
        lastCompletedAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    });
  }

  return {
    ok: true,
    action: 'submitReview',
    scoreChange: score,
    nextScore,
    nextRank
  };
};
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const command = db.command;
