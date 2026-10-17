const STATUS_TEXT = {
  active: '正常',
  admin: '管理员',
  open: '展示中',
  locked: '已锁定',
  pending: '待处理',
  in_progress: '进行中',
  pending_review: '待评价',
  completed: '已完成',
  rejected: '已驳回',
  approved: '已成立',
  removed: '已下架',
  banned: '已封禁',
  sent: '已发送',
  failed: '发送失败'
};

function getAdminStatusText(status = '') {
  return STATUS_TEXT[status] || status || '未知';
}

function buildAdminStats(data = {}) {
  const users = data.users || [];
  const posts = data.posts || [];
  const orders = data.orders || [];
  const reports = data.reports || data.complaints || [];
  const notifications = data.notifications || [];

  return {
    users: users.length,
    posts: posts.length,
    openPosts: posts.filter((item) => item.status === 'open').length,
    orders: orders.length,
    pendingReports: reports.filter((item) => item.status === 'pending').length,
    notifications: notifications.length
  };
}

function normalizeAdminRecord(record = {}) {
  const status = record.status || (record.isAdmin ? 'admin' : 'active');
  const title = record.title || record.nickname || record.reason || record.content || record._id || '未命名记录';
  const subtitle = record.publisherName
    || (record.publisherInfo && record.publisherInfo.nickname)
    || record.openid
    || record.targetOpenid
    || record.relatedTitle
    || record.relatedId
    || '';
  return {
    id: record._id || record.id || '',
    title,
    subtitle,
    status,
    statusText: getAdminStatusText(status),
    createdAt: record.createdAt || ''
  };
}

module.exports = {
  buildAdminStats,
  normalizeAdminRecord,
  getAdminStatusText
};
