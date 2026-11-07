const cloud = require('wx-server-sdk');
const { validateComment } = require('./content');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const VERSION = '2026-11-08.1';

// 评论统一走云函数读写，前端不直查 comments 集合：
// 作者身份以 getWXContext().OPENID 为准，不接受前端传来的昵称或 openid。
async function resolveAuthor(openid) {
  try {
    const res = await db.collection('users').where({ openid }).limit(1).get();
    const profile = (res.data && res.data[0]) || {};
    const name = profile.nickname || '同车旅客';
    return {
      authorName: name,
      authorAvatarText: profile.avatarText || name.slice(0, 1),
      authorAvatarUrl: profile.avatarUrl || ''
    };
  } catch (error) {
    return { authorName: '同车旅客', authorAvatarText: '旅', authorAvatarUrl: '' };
  }
}

function toClient(item) {
  return {
    id: item._id,
    postId: item.postId,
    content: item.content,
    authorOpenid: item.authorOpenid || '',
    authorName: item.authorName || '同车旅客',
    authorAvatarText: item.authorAvatarText || '旅',
    authorAvatarUrl: item.authorAvatarUrl || '',
    createdAt: item.createdAt,
    status: item.status || 'active'
  };
}

exports.main = async (event = {}) => {
  const openid = cloud.getWXContext().OPENID;
  const action = event.action || 'list';

  if (action === 'list') {
    const postId = event.postId || '';
    if (!postId) {
      return { ok: false, code: 'POST_REQUIRED', version: VERSION, message: '缺少帖子编号。', comments: [] };
    }
    try {
      const res = await db.collection('comments')
        .where({ postId, status: 'active' })
        .orderBy('createdAt', 'asc')
        .limit(100)
        .get();
      return { ok: true, version: VERSION, comments: (res.data || []).map(toClient) };
    } catch (error) {
      return {
        ok: false,
        code: 'COMMENTS_COLLECTION_ERROR',
        version: VERSION,
        message: '评论读取失败，请确认当前云环境已创建 comments 集合。',
        comments: []
      };
    }
  }

  if (action === 'add') {
    const postId = event.postId || '';
    if (!postId) {
      return { ok: false, code: 'POST_REQUIRED', version: VERSION, message: '缺少帖子编号。' };
    }
    const check = validateComment(event.content);
    if (!check.ok) return { ...check, version: VERSION };

    try {
      await db.collection('posts').doc(postId).get();
    } catch (error) {
      return { ok: false, code: 'POST_NOT_FOUND', version: VERSION, message: '帖子不存在，无法评论。' };
    }

    const author = await resolveAuthor(openid);
    try {
      const result = await db.collection('comments').add({
        data: {
          postId,
          content: check.content,
          authorOpenid: openid,
          ...author,
          status: 'active',
          createdAt: db.serverDate(),
          updatedAt: db.serverDate()
        }
      });
      return { ok: true, version: VERSION, commentId: result._id };
    } catch (error) {
      return {
        ok: false,
        code: 'COMMENTS_WRITE_ERROR',
        version: VERSION,
        message: '评论写入失败，请确认当前云环境已创建 comments 集合。'
      };
    }
  }

  if (action === 'remove') {
    const commentId = event.commentId || '';
    if (!commentId) {
      return { ok: false, code: 'COMMENT_REQUIRED', version: VERSION, message: '缺少评论编号。' };
    }
    let comment = null;
    try {
      const res = await db.collection('comments').doc(commentId).get();
      comment = res.data;
    } catch (error) {
      return { ok: false, code: 'COMMENT_NOT_FOUND', version: VERSION, message: '评论不存在。' };
    }

    // 只删自己的；帖子发布者也可以清理自己帖子下的评论。
    let isPostPublisher = false;
    try {
      const post = await db.collection('posts').doc(comment.postId).get();
      isPostPublisher = Boolean(post.data && post.data.publisherOpenid === openid);
    } catch (error) {
      isPostPublisher = false;
    }
    if (comment.authorOpenid !== openid && !isPostPublisher) {
      return { ok: false, code: 'NO_PERMISSION', version: VERSION, message: '只能删除自己的评论。' };
    }

    await db.collection('comments').doc(commentId).update({
      data: { status: 'removed', removedAt: db.serverDate(), updatedAt: db.serverDate() }
    });
    // 软删除，保留记录便于风控追溯
    return { ok: true, version: VERSION };
  }

  return { ok: false, code: 'UNKNOWN_ACTION', version: VERSION, message: '不支持的评论操作。' };
};
