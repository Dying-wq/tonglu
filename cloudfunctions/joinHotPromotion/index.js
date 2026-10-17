const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

function getHotEndTime(start = new Date()) {
  return new Date(start.getTime() + 3 * 60 * 60 * 1000);
}

function isPostEligible(post, now = new Date()) {
  if (!post) return false;
  const visibleStatus = post.status === 'open' || post.status === 'displaying';
  const approved = !post.auditStatus || post.auditStatus === 'approved';
  const expired = post.expireAt && new Date(post.expireAt).getTime() <= now.getTime();
  return visibleStatus && approved && !post.isHot && !expired;
}

exports.main = async (event = {}) => {
  if (!event.postId) {
    return {
      ok: false,
      code: 'POST_REQUIRED',
      message: '请选择要加入热门的帖子。'
    };
  }

  const wxContext = cloud.getWXContext();
  const userRes = await db.collection('users').where({ openid: wxContext.OPENID }).limit(1).get();
  const user = userRes.data[0];
  const hotQuota = Number(user && user.hotQuota) || 0;

  if (!user || hotQuota <= 0) {
    return {
      ok: false,
      code: 'NO_HOT_QUOTA',
      message: '热门次数不足。'
    };
  }

  const postRes = await db.collection('posts').doc(event.postId).get();
  const post = postRes.data;
  if (!post || post.publisherOpenid !== wxContext.OPENID || !isPostEligible(post)) {
    return {
      ok: false,
      code: 'POST_NOT_ALLOWED',
      message: '只能推广自己发布且展示中的合规内容。'
    };
  }

  const existing = await db.collection('promotions')
    .where({ postId: event.postId, status: 'active' })
    .limit(1)
    .get();
  if (existing.data.length) {
    return {
      ok: false,
      code: 'PROMOTION_EXISTS',
      message: '该帖子已经在热门中。'
    };
  }

  const startedAt = new Date();
  const endedAt = getHotEndTime(startedAt);
  const result = await db.collection('promotions').add({
    data: {
      postId: event.postId,
      postType: post.type,
      publisherOpenid: wxContext.OPENID,
      source: 'hot_quota',
      status: 'active',
      title: post.title,
      description: post.description,
      price: post.price,
      location: post.location,
      images: post.images || [],
      publisherName: post.publisherInfo && post.publisherInfo.nickname ? post.publisherInfo.nickname : user.nickname,
      publisherRank: post.publisherInfo && post.publisherInfo.rankName ? post.publisherInfo.rankName : user.rankName,
      startedAt,
      endedAt,
      createdAt: db.serverDate()
    }
  });

  await db.collection('users').doc(user._id).update({
    data: {
      hotQuota: _.inc(-1),
      updatedAt: db.serverDate()
    }
  });

  await db.collection('posts').doc(event.postId).update({
    data: {
      isHot: true,
      hotUntil: endedAt,
      updatedAt: db.serverDate()
    }
  });

  try {
    await cloud.callFunction({
      name: 'sendSubscribeNotice',
      data: {
        eventType: 'hot_success',
        targetOpenid: wxContext.OPENID,
        page: `/pages/service-detail/service-detail?id=${event.postId}`,
        title: post.title,
        content: '你的内容已加入热门，置顶 3 小时。'
      }
    });
  } catch (error) {
    await db.collection('notification_logs').add({
      data: {
        eventType: 'hot_success',
        targetOpenid: wxContext.OPENID,
        status: 'pending',
        error: error.message || error.errMsg || String(error),
        createdAt: db.serverDate()
      }
    });
  }

  return {
    ok: true,
    promotionId: result._id,
    endedAt,
    message: '已加入热门，置顶 3 小时。'
  };
};
