// 订单/求助状态流转工具
//
// 状态取值说明（务必与 cloudfunctions 保持一致）：
//   接单申请：acceptOrder           → order.pending_accept + post.open
//   求助者确认：publisherAcceptOrder → order.in_progress   + post.locked
//   确认完成：confirmComplete       → order.completed     + post.resolved
// 早期版本前端曾用 pending/accepted 两值，读取老数据时通过 normalizeOrderStatus 归一化。

const {
  ORDER_STATUS,
  POST_STATUS,
  ORDER_STATUS_LABELS,
  POST_STATUS_LABELS,
  LEGACY_STATUS_MAP
} = require('./constants');

// 帮助者发起接单申请：帖子仍然公开可见（其他同车旅客还能看到，但已有一条待确认申请）
function getInitialOrderState() {
  return {
    orderStatus: ORDER_STATUS.PENDING_ACCEPT,
    postStatus: POST_STATUS.OPEN
  };
}

// 求助者确认某位帮助者：帖子锁定，从公开列表隐藏
function getAcceptedOrderState() {
  return {
    orderStatus: ORDER_STATUS.IN_PROGRESS,
    postStatus: POST_STATUS.LOCKED
  };
}

// 求助者点击「问题已解决」：订单完成，帖子转为已解决并在列表下沉
function getCompletedOrderState() {
  return {
    orderStatus: ORDER_STATUS.COMPLETED,
    postStatus: POST_STATUS.RESOLVED
  };
}

// 归一化历史状态值（pending → pending_accept，accepted → in_progress）
function normalizeOrderStatus(status) {
  const value = String(status || '').trim();
  if (!value) return '';
  return LEGACY_STATUS_MAP[value] || value;
}

function normalizePostStatus(status) {
  const value = String(status || '').trim();
  if (!value) return '';
  return LEGACY_STATUS_MAP[value] || value;
}

function getOrderStatusLabel(status) {
  const normalized = normalizeOrderStatus(status);
  return ORDER_STATUS_LABELS[normalized] || normalized || '未知状态';
}

function getPostStatusLabel(status) {
  const normalized = normalizePostStatus(status);
  return POST_STATUS_LABELS[normalized] || normalized || '未知状态';
}

// 帖子在公开列表中是否可见（open 与 resolved 可见，resolved 下沉底部；locked/closed 不可见）
function isPostVisibleInList(post) {
  if (!post || !post.status) return true;
  const status = normalizePostStatus(post.status);
  return status === POST_STATUS.OPEN || status === POST_STATUS.RESOLVED;
}

// 排序：open 在前，resolved 在后；同状态内按时间倒序
function sortPostsByStatus(posts) {
  const list = Array.isArray(posts) ? posts : [];
  const open = list.filter((p) => !p.status || normalizePostStatus(p.status) === POST_STATUS.OPEN);
  const resolved = list.filter((p) => normalizePostStatus(p.status) === POST_STATUS.RESOLVED);
  const others = list.filter((p) => {
    const status = normalizePostStatus(p.status);
    return status && status !== POST_STATUS.OPEN && status !== POST_STATUS.RESOLVED;
  });

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
  getCompletedOrderState,
  getInitialOrderState,
  normalizeOrderStatus,
  normalizePostStatus,
  getOrderStatusLabel,
  getPostStatusLabel,
  isPostVisibleInList,
  sortPostsByStatus,
  getUrgencyInfo
};
