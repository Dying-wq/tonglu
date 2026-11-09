const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

// 批量取用户资料。_.in 单次最多 100 个值，超过要分片。
async function loadProfiles(openids) {
  const unique = Array.from(new Set(openids.filter(Boolean)));
  const profiles = {};
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    try {
      const res = await db.collection('users')
        .where({ openid: _.in(chunk) })
        .limit(100)
        .get();
      (res.data || []).forEach((user) => {
        profiles[user.openid] = user;
      });
    } catch (error) {
      // 查不到资料时退回 openid 兜底显示，不能让整个名单失败
    }
  }
  return profiles;
}

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
//   blockedUsers     —— 我拉黑的人 + 资料，供黑名单管理页直接渲染
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
      blockedUsers: [],
      warning: 'blocks 集合不可读，已按无拉黑记录处理。'
    };
  }

  const blockedOpenids = [];
  const blockedByOpenids = [];
  const blockedAtMap = {};

  records.forEach((item) => {
    const blocker = item.blockerId || item.blockerOpenid || '';
    const target = item.targetId || item.targetOpenid || '';
    if (blocker === openid && target) {
      blockedOpenids.push(target);
      blockedAtMap[target] = item.createdAt || item.blockedAt || null;
    } else if (target === openid && blocker) {
      blockedByOpenids.push(blocker);
    }
  });

  const hiddenOpenids = Array.from(new Set(blockedOpenids.concat(blockedByOpenids)));

  // 黑名单页要显示昵称和头像，否则只有一串 openid 没法辨认
  const profiles = await loadProfiles(blockedOpenids);
  const blockedUsers = blockedOpenids.map((id) => {
    const profile = profiles[id] || {};
    const name = profile.nickname || '未知用户';
    return {
      openid: id,
      name,
      avatarText: profile.avatarText || name.slice(0, 1),
      avatarUrl: profile.avatarUrl || '',
      rankName: profile.creditLevelName || profile.rankName || '青铜',
      blockedAt: blockedAtMap[id] || null
    };
  });

  return { ok: true, blockedOpenids, blockedByOpenids, hiddenOpenids, blockedUsers };
};
