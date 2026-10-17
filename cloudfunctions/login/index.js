const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

const INITIAL_CREDIT_SCORE = 60;

exports.main = async () => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const users = db.collection('users');
  const existing = await users.where({ openid }).limit(1).get();

  if (existing.data.length) {
    const user = existing.data[0];
    // 兼容旧数据：补充新字段
    if (user.creditScore === undefined || user.creditScore === 0) {
      await users.doc(user._id).update({
        data: {
          creditScore: INITIAL_CREDIT_SCORE,
          creditLevelName: '可信任旅客',
          helpCount: user.helpCount || 0,
          topicCount: user.topicCount || 0,
          thankCount: user.thankCount || 0,
          trainBinding: user.trainBinding || null,
          updatedAt: db.serverDate()
        }
      });
      user.creditScore = INITIAL_CREDIT_SCORE;
      user.creditLevelName = '可信任旅客';
    }
    return {
      ok: true,
      action: 'login',
      openid,
      user
    };
  }

  const user = {
    openid,
    nickname: '旅者',
    avatarText: '旅',
    avatarUrl: '',
    signature: '',
    themeColor: '#1f6feb',
    wechatId: '',
    allowWechatExchange: false,
    creditScore: INITIAL_CREDIT_SCORE,
    creditLevelName: '可信任旅客',
    isAdmin: false,
    status: 'active',
    helpCount: 0,
    topicCount: 0,
    thankCount: 0,
    monthlyCompletedCount: 0,
    trainBinding: null,
    lastCompletedAt: null,
    createdAt: db.serverDate(),
    updatedAt: db.serverDate()
  };

  const addResult = await users.add({ data: user });

  return {
    ok: true,
    action: 'login',
    openid,
    user: {
      _id: addResult._id,
      ...user
    }
  };
};
