const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

async function assertAdmin(openid) {
  const adminRes = await db.collection('users').where({ openid, isAdmin: true }).limit(1).get();
  return Boolean(adminRes.data.length);
}

async function safeList(collection, limit = 20) {
  try {
    const res = await db.collection(collection).orderBy('createdAt', 'desc').limit(limit).get();
    return res.data;
  } catch (error) {
    return [];
  }
}

exports.main = async () => {
  const wxContext = cloud.getWXContext();
  const isAdmin = await assertAdmin(wxContext.OPENID);
  if (!isAdmin) {
    return {
      ok: false,
      code: 'NOT_ADMIN',
      message: '当前用户不是管理员。'
    };
  }

  const [users, posts, orders, reviews, notifications, complaints, reports, adminLogs] = await Promise.all([
    safeList('users'),
    safeList('posts'),
    safeList('orders'),
    safeList('reviews'),
    safeList('notification_logs'),
    safeList('complaints'),
    safeList('reports'),
    safeList('admin_logs')
  ]);

  return {
    ok: true,
    data: {
      users,
      posts,
      orders,
      reviews,
      notifications,
      complaints: complaints
        .map((item) => ({ ...item, adminCollection: 'complaints' }))
        .concat(reports.map((item) => ({ ...item, adminCollection: 'reports' }))),
      adminLogs
    }
  };
};
