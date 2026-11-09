const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

// 内容安全词库：与小程序端 utils/risk.js 保持同一口径
const RISK_WORDS = [
  '转账', '微信付款', '支付宝', '先付', '押金', '保证金', '定金', '手续费',
  '私下交易', '不走平台', '加微信付款', '二维码收款', '收款码', '有偿服务',
  '出售', '倒卖', '代购', '刷单', '兼职刷', '中奖', '免费领', '诈骗',
  '违禁品', '管制刀具', '易燃', '易爆', '色情', '低俗', '裸聊', '陪聊',
  '代课', '代签到', '代写作业', '代考试', '代考', '出售答案', '考试答案'
];

function detectRisk(text) {
  return RISK_WORDS.filter((word) => String(text || '').includes(word));
}

// 微信内容安全接口：未开通或无权限时返回 true，降级为本地词库校验
async function checkContentSecurity(content, openid) {
  try {
    const res = await cloud.openapi.security.msgSecCheck({
      content,
      version: 2,
      scene: 2,
      openid
    });
    return Boolean(res && res.result && res.result.suggest === 'pass');
  } catch (error) {
    return true;
  }
}

exports.main = async (event = {}) => {
  if (!event.type || !event.title) {
    return {
      ok: false,
      code: 'INVALID_POST',
      message: '发布内容需要 type 和 title。'
    };
  }

  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  // 内容安全校验：词库命中直接拒绝，微信接口判定不通过也拒绝
  const contentText = `${event.title || ''} ${event.description || ''}`;
  const riskKeywords = detectRisk(contentText);
  if (riskKeywords.length) {
    return {
      ok: false,
      code: 'RISK_CONTENT',
      message: `内容包含敏感词（${riskKeywords.join('、')}），请修改后再发布。`,
      riskKeywords
    };
  }
  const securityPassed = await checkContentSecurity(contentText, openid);
  if (!securityPassed) {
    return {
      ok: false,
      code: 'RISK_CONTENT',
      message: '内容未通过安全检测，请修改后再发布。'
    };
  }

  const userRes = await db.collection('users').where({ openid }).limit(1).get();
  const user = userRes.data[0] || {};

  // 信用分检查：< 40分不能发布
  const creditScore = user.creditScore || 60;
  if (creditScore < 40) {
    return {
      ok: false,
      code: 'CREDIT_TOO_LOW',
      message: '信用分低于40分，暂时无法发布信息。请通过帮助他人提升信用分。'
    };
  }

  // 帖子跟随发布者的行程：到站之后就不该继续出现在同车次旅客的首页上，
  // 否则有人会照着一条「人已经下车了」的帖子白跑一趟。
  // 到达时间取用户当前绑定的车次（bindTrain 写入 users.trainBinding.arrivalTs），
  // 再加 2 小时宽限——刚下车时可能还在站台交接物品，立刻消失反而不合理。
  // 没有绑定行程（arrivalTs 缺失）时不写这个字段，表示永不过期，
  // 这样历史帖子和未绑定场景都不会被误伤。
  const EXPIRE_GRACE_MS = 2 * 60 * 60 * 1000;
  const binding = user.trainBinding || {};
  const arrivalTs = Number(binding.arrivalTs) || 0;
  const expireAt = arrivalTs ? new Date(arrivalTs + EXPIRE_GRACE_MS) : null;

  const post = {
    type: event.type,
    title: event.title,
    description: event.description || '',
    images: event.images || [],
    trainNo: event.trainNo || '',
    carriageNo: event.carriageNo || '',
    seatNo: event.seatNo || '',
    location: event.location || '',
    publisherOpenid: openid,
    publisherInfo: {
      nickname: user.nickname || '匿名旅客',
      // 头像随帖子一起存下来，聊天页和会话列表才有东西可显示；
      // 微信已收回 getUserProfile，头像只能来自用户自己上传的 avatarUrl
      avatarText: user.avatarText || (user.nickname || '匿').slice(0, 1),
      avatarUrl: user.avatarUrl || '',
      creditScore: creditScore,
      rankName: user.creditLevelName || '可信任旅客'
    },
    status: 'open',
    resolved: false,
    createdAt: db.serverDate(),
    updatedAt: db.serverDate()
  };

  if (expireAt) {
    post.expireAt = expireAt;
  }

  const result = await db.collection('posts').add({ data: post });

  // 如果是话题打卡，增加用户 topicCount
  if (event.type === 'topic') {
    await db.collection('users').where({ openid }).update({
      data: {
        topicCount: _.inc(1),
        updatedAt: db.serverDate()
      }
    });
  }

  return {
    ok: true,
    action: 'createPost',
    postId: result._id,
    post
  };
};
