// 订单/求助状态流转工具

function getInitialOrderState() {
  return {
    orderStatus: 'pending',
    postStatus: 'open'
  };
}

function getAcceptedOrderState() {
  return {
    orderStatus: 'accepted',
    postStatus: 'open'  // 帖子仍公开可见，直到求助者确认解决
  };
}

function getCompletedOrderState() {
  return {
    orderStatus: 'completed',
    postStatus: 'resolved'
  };
}

// 帖子在列表中是否可见（open 和 resolved 都可见，但 resolved 下沉底部）
function isPostVisibleInList(post) {
  if (!post || !post.status) return true;
  return post.status === 'open' || post.status === 'resolved';
}

// 排序：open 在前，resolved 在后；同状态内按时间倒序
function sortPostsByStatus(posts) {
  const open = posts.filter((p) => !p.status || p.status === 'open');
  const resolved = posts.filter((p) => p.status === 'resolved');
  const others = posts.filter((p) => p.status && p.status !== 'open' && p.status !== 'resolved');

  const sortByTime = (a, b) => {
    const ta = a.createdAtTs || 0;
    const tb = b.createdAtTs || 0;
    return tb - ta;
  };

  return [...open.sort(sortByTime), ...resolved.sort(sortByTime), ...others];
}

// 计算剩余车程比例对应的紧急程度和颜色
function getUrgencyInfo(remainingRatio, createdAtTs) {
  const { URGENCY_COLORS } = require('./constants');

  // 发布时间 ≤5分钟 → 绿色底色（新鲜）
  const ageMs = Date.now() - (createdAtTs || Date.now());
  if (ageMs <= 5 * 60 * 1000) {
    return { level: 'fresh', color: URGENCY_COLORS.FRESH };
  }

  const ratio = Number(remainingRatio) || 1;
  if (ratio > 0.5) return { level: 'normal', color: URGENCY_COLORS.NORMAL };
  if (ratio > 0.25) return { level: 'caution', color: URGENCY_COLORS.CAUTION };
  if (ratio > 0.1) return { level: 'warning', color: URGENCY_COLORS.WARNING };
  return { level: 'urgent', color: URGENCY_COLORS.URGENT };
}

module.exports = {
  getAcceptedOrderState,
  getInitialOrderState,
  getCompletedOrderState,
  isPostVisibleInList,
  sortPostsByStatus,
  getUrgencyInfo
};
