const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

function cleanText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext();
  const nickname = cleanText(event.nickname, 20);
  if (!nickname) {
    return {
      ok: false,
      code: 'NICKNAME_REQUIRED',
      message: '请填写姓名。'
    };
  }

  const data = {
    nickname,
    avatarText: cleanText(event.avatarText || nickname.slice(0, 1), 2),
    avatarUrl: cleanText(event.avatarUrl, 300),
    school: cleanText(event.school, 30),
    college: cleanText(event.college, 30),
    bio: cleanText(event.bio, 80),
    updatedAt: db.serverDate()
  };

  const userRes = await db.collection('users').where({ openid: wxContext.OPENID }).limit(1).get();
  if (!userRes.data.length) {
    const result = await db.collection('users').add({
      data: {
        openid: wxContext.OPENID,
        creditScore: 0,
        rankName: '青铜',
        status: 'active',
        monthlyCompletedCount: 0,
        createdAt: db.serverDate(),
        ...data
      }
    });
    return {
      ok: true,
      action: 'createProfile',
      userId: result._id,
      user: data
    };
  }

  await db.collection('users').doc(userRes.data[0]._id).update({ data });
  return {
    ok: true,
    action: 'updateProfile',
    userId: userRes.data[0]._id,
    user: data
  };
};
