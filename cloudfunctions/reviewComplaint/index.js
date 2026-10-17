const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

function getPenalty(decision) {
  return decision === 'approve' ? -20 : 0;
}

function getRankByScore(score) {
  const ranks = [
    { name: '青铜', min: 0, max: 99 },
    { name: '白银', min: 100, max: 199 },
    { name: '黄金', min: 200, max: 399 },
    { name: '铂金', min: 400, max: 699 },
    { name: '钻石', min: 700, max: 999 },
    { name: '星耀', min: 1000, max: 1499 },
    { name: '王者', min: 1500, max: Infinity }
  ];
  const safeScore = Math.max(0, Number(score) || 0);
  return ranks.find((rank) => safeScore >= rank.min && safeScore <= rank.max).name;
}

exports.main = async (event = {}) => {
  if (!event.complaintId || !event.decision) {
    return {
      ok: false,
      code: 'INVALID_REVIEW',
      message: '处理投诉需要 complaintId 和 decision。'
    };
  }

  const wxContext = cloud.getWXContext();
  const adminRes = await db.collection('users').where({ openid: wxContext.OPENID, isAdmin: true }).limit(1).get();
  if (!adminRes.data.length) {
    return {
      ok: false,
      code: 'NOT_ADMIN',
      message: '当前用户不是管理员。'
    };
  }

  const complaintRes = await db.collection('complaints').doc(event.complaintId).get();
  const complaint = complaintRes.data;
  const status = event.decision === 'approve' ? 'approved' : 'rejected';
  const creditPenalty = getPenalty(event.decision);

  await db.collection('complaints').doc(event.complaintId).update({
    data: {
      status,
      decision: event.decision,
      creditPenalty,
      adminNote: event.adminNote || '',
      reviewedAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
  });

  if (status === 'approved' && complaint.targetUserOpenid) {
    const targetRes = await db.collection('users').where({ openid: complaint.targetUserOpenid }).limit(1).get();
    if (targetRes.data.length) {
      const target = targetRes.data[0];
      const nextScore = Math.max(0, (Number(target.creditScore) || 0) + creditPenalty);
      await db.collection('users').doc(targetRes.data[0]._id).update({
        data: {
          creditScore: nextScore,
          rankName: getRankByScore(nextScore),
          updatedAt: db.serverDate()
        }
      });
    }
  }

  if (status === 'approved' && complaint.relatedType && complaint.relatedId) {
    const collection = complaint.relatedType === 'post' ? 'posts' : 'orders';
    await db.collection(collection).doc(complaint.relatedId).update({
      data: {
        status: 'disputed',
        updatedAt: db.serverDate()
      }
    }).catch(() => null);
  }

  return {
    ok: true,
    status,
    creditPenalty,
    message: status === 'approved' ? '投诉成立，已处理。' : '投诉已驳回。'
  };
};
