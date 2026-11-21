const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

// 版本号写进返回值：部署后可在 Console 里确认云端跑的是不是新代码
const VERSION = '2026-11-21.1';

// 与小程序端 constants.js 的 CREDIT_RULES / CREDIT_LEVELS 保持同一口径
const PENALTY_APPROVED = -20; // 投诉成立，被举报人扣分
const REPORTER_REWARD = 3; // 举报属实，举报人加分
const AUTO_BAN_THRESHOLD = 3; // 3 个不同举报人、同一理由
const AUTO_BAN_HOURS = 24;

function getCreditLevelName(score) {
  const safeScore = Number(score);
  const value = Number.isFinite(safeScore) ? safeScore : 60;
  if (value >= 60) return '可信任旅客';
  if (value >= 40) return '普通旅客';
  if (value >= 1) return '受限旅客';
  return '已封禁';
}

async function findUser(openid) {
  if (!openid) return null;
  const res = await db.collection('users').where({ openid }).limit(1).get();
  return res.data[0] || null;
}

async function adjustCredit(openid, delta) {
  const user = await findUser(openid);
  if (!user) return null;
  const current = Number(user.creditScore);
  const before = Number.isFinite(current) ? current : 60;
  const after = Math.max(0, before + delta);
  await db.collection('users').doc(user._id).update({
    data: {
      creditScore: after,
      creditLevelName: getCreditLevelName(after),
      updatedAt: db.serverDate()
    }
  });
  return { openid, before, after, delta };
}

// 同一被举报人 + 同一理由，被 3 个不同举报人投诉成立 → 临时封禁 24 小时。
// 封禁只是写入 bannedUntil，createPost / sendMessage 会读取这个字段做拦截。
async function applyAutoBan(targetOpenid, reason) {
  if (!targetOpenid) return null;
  const res = await db.collection('complaints')
    .where({ targetUserOpenid: targetOpenid, reason, status: 'approved' })
    .limit(50)
    .get();
  const reporters = new Set(
    (res.data || []).map((item) => item.complainantOpenid).filter(Boolean)
  );
  if (reporters.size < AUTO_BAN_THRESHOLD) return null;

  const user = await findUser(targetOpenid);
  if (!user) return null;
  const bannedUntil = new Date(Date.now() + AUTO_BAN_HOURS * 3600 * 1000);
  await db.collection('users').doc(user._id).update({
    data: {
      bannedUntil,
      banReason: reason,
      updatedAt: db.serverDate()
    }
  });
  return { bannedUntil, reason, reporters: reporters.size };
}

exports.main = async (event = {}) => {
  if (!event.complaintId || !event.decision) {
    return {
      ok: false,
      code: 'INVALID_REVIEW',
      version: VERSION,
      message: '处理投诉需要 complaintId 和 decision。'
    };
  }

  const wxContext = cloud.getWXContext();
  const admin = await findUser(wxContext.OPENID);
  if (!admin || !admin.isAdmin) {
    return {
      ok: false,
      code: 'NOT_ADMIN',
      version: VERSION,
      message: '当前用户不是管理员。'
    };
  }

  let complaint = null;
  try {
    const res = await db.collection('complaints').doc(event.complaintId).get();
    complaint = res.data;
  } catch (error) {
    return {
      ok: false,
      code: 'COMPLAINT_NOT_FOUND',
      version: VERSION,
      message: '投诉不存在或已被删除。'
    };
  }

  // 已处理过的投诉直接返回，避免重复点击造成重复扣分
  if (complaint.status !== 'pending') {
    return {
      ok: true,
      alreadyReviewed: true,
      status: complaint.status,
      version: VERSION,
      message: '该投诉已处理过，未重复扣分。'
    };
  }

  const approved = event.decision === 'approve';
  const status = approved ? 'approved' : 'rejected';

  await db.collection('complaints').doc(event.complaintId).update({
    data: {
      status,
      decision: event.decision,
      creditPenalty: approved ? PENALTY_APPROVED : 0,
      adminNote: event.adminNote || '',
      reviewedAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
  });

  let targetChange = null;
  let reporterChange = null;
  let autoBan = null;

  if (approved) {
    targetChange = await adjustCredit(complaint.targetUserOpenid, PENALTY_APPROVED);

    // 举报人加分：CREDIT_RULES.REPORT_VERIFIED 此前只写在常量里，没有任何代码执行
    if (complaint.complainantOpenid && complaint.complainantOpenid !== complaint.targetUserOpenid) {
      reporterChange = await adjustCredit(complaint.complainantOpenid, REPORTER_REWARD);
    }

    autoBan = await applyAutoBan(complaint.targetUserOpenid, complaint.reason);

    // 只有帖子/订单类投诉才有对应业务单据；聊天举报没有单据可改，跳过
    if (complaint.relatedId && (complaint.relatedType === 'post' || complaint.relatedType === 'order')) {
      const collection = complaint.relatedType === 'post' ? 'posts' : 'orders';
      await db.collection(collection).doc(complaint.relatedId).update({
        data: {
          status: 'disputed',
          updatedAt: db.serverDate()
        }
      }).catch(() => null);
    }
  }

  return {
    ok: true,
    status,
    creditPenalty: approved ? PENALTY_APPROVED : 0,
    reporterReward: reporterChange ? REPORTER_REWARD : 0,
    targetCredit: targetChange,
    reporterCredit: reporterChange,
    autoBanned: Boolean(autoBan),
    bannedUntil: autoBan ? autoBan.bannedUntil : null,
    version: VERSION,
    message: approved ? '投诉成立，已按规则扣分。' : '投诉已驳回。'
  };
};
