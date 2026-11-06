const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

// 拉黑名单查询。
//
// 为什么必须走云函数：blocks 集合权限是「仅创建者可读写」，而 blockUser
// 是云函数写入的记录，没有 _openid 字段，前端直接查 blocks 会拿到空结果。
//
// 返回两个方向的名单：
//   blockedOpenids   —— 我拉黑的人（他们的帖子不该出现在我的首页）
//   blockedByOpenids —— 拉黑我的人（我同样看不到他们的帖子，避免
//                       「能看到帖子但发不出消息」的困惑）
//   hiddenOpenids    —— 两者的并集，前端过滤时直接用这个
exports.main = async () => {
  const openid = cloud.getWXContext().OPENID;

  if (!openid) {
    return { ok: false, code: 'NO_OPENID', message: '未获取到用户身份。' };
  }

  let records = [];
  try {
    const res = await db.collection('blocks')
      .where(_.or([
        { blockerId: openid, status: 'active' },
        { targetId: openid, status: 'active' }
      ]))
      .limit(200)
      .get();
    records = res.data || [];
  } catch (error) {
    // 集合不存在时返回空名单而不是报错：
    // 拉黑名单读不到，不应该连带让首页帖子列表整体失败。
    return {
      ok: true,
      blockedOpenids: [],
      blockedByOpenids: [],
      hiddenOpenids: [],
      warning: 'blocks 集合不可读，已按无拉黑记录处理。'
    };
  }

  const blockedOpenids = [];
  const blockedByOpenids = [];

  records.forEach((item) => {
    const blocker = item.blockerId || item.blockerOpenid || '';
    const target = item.targetId || item.targetOpenid || '';
    if (blocker === openid && target) {
      blockedOpenids.push(target);
    } else if (target === openid && blocker) {
      blockedByOpenids.push(blocker);
    }
  });

  const hiddenOpenids = Array.from(new Set(blockedOpenids.concat(blockedByOpenids)));

  return { ok: true, blockedOpenids, blockedByOpenids, hiddenOpenids };
};
