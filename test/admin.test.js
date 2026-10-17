const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAdminStats,
  normalizeAdminRecord,
  getAdminStatusText
} = require('../miniprogram/utils/admin');

test('builds admin stats from dashboard lists', () => {
  const stats = buildAdminStats({
    users: [{}, {}],
    posts: [{ status: 'open' }, { status: 'removed' }],
    orders: [{ status: 'completed' }],
    reports: [{ status: 'pending' }],
    notifications: [{ status: 'sent' }]
  });

  assert.deepEqual(stats, {
    users: 2,
    posts: 2,
    openPosts: 1,
    orders: 1,
    pendingReports: 1,
    notifications: 1
  });
});

test('maps backend status values to readable admin labels', () => {
  assert.equal(getAdminStatusText('open'), '展示中');
  assert.equal(getAdminStatusText('removed'), '已下架');
  assert.equal(getAdminStatusText('banned'), '已封禁');
  assert.equal(getAdminStatusText('unknown_status'), 'unknown_status');
});

test('normalizes records for compact admin cards', () => {
  assert.deepEqual(normalizeAdminRecord({
    _id: 'abc',
    title: '测试帖子',
    status: 'open',
    publisherInfo: { nickname: '李同学' },
    createdAt: 'now'
  }), {
    id: 'abc',
    title: '测试帖子',
    subtitle: '李同学',
    status: 'open',
    statusText: '展示中',
    createdAt: 'now'
  });
});
