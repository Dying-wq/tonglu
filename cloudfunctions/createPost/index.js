const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

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
      creditScore: creditScore,
      rankName: user.creditLevelName || '可信任旅客'
    },
    status: 'open',
    resolved: false,
    createdAt: db.serverDate(),
    updatedAt: db.serverDate()
  };

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
