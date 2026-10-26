const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getAcceptedOrderState,
  getCompletedOrderState,
  getInitialOrderState,
  getOrderStatusLabel,
  getPostStatusLabel,
  normalizeOrderStatus,
  isPostVisibleInList,
  sortPostsByStatus
} = require('../miniprogram/utils/order-flow');

// 这些断言与 cloudfunctions 中实际写入数据库的值一一对应：
//   acceptOrder          → pending_accept + open
//   publisherAcceptOrder → in_progress   + locked
//   confirmComplete      → completed     + resolved

test('keeps post visible after a user applies to take the order', () => {
  assert.deepEqual(getInitialOrderState(), {
    orderStatus: 'pending_accept',
    postStatus: 'open'
  });
});

test('hides post only after publisher accepts applicant', () => {
  assert.deepEqual(getAcceptedOrderState(), {
    orderStatus: 'in_progress',
    postStatus: 'locked'
  });
});

test('marks post resolved after publisher confirms completion', () => {
  assert.deepEqual(getCompletedOrderState(), {
    orderStatus: 'completed',
    postStatus: 'resolved'
  });
});

test('only open and resolved posts are visible in public list', () => {
  assert.equal(isPostVisibleInList({ status: 'open' }), true);
  assert.equal(isPostVisibleInList({ status: 'resolved' }), true);
  assert.equal(isPostVisibleInList({ status: 'locked' }), false);
  assert.equal(isPostVisibleInList({ status: 'completed' }), false);
  assert.equal(isPostVisibleInList({ status: 'closed' }), false);
  // 没有 status 字段的历史数据默认可见
  assert.equal(isPostVisibleInList({}), true);
});

test('normalizes legacy pending and accepted status values', () => {
  assert.equal(normalizeOrderStatus('pending'), 'pending_accept');
  assert.equal(normalizeOrderStatus('accepted'), 'in_progress');
  assert.equal(normalizeOrderStatus('completed'), 'completed');
  assert.equal(normalizeOrderStatus(''), '');
});

test('maps status codes to readable labels', () => {
  assert.equal(getOrderStatusLabel('pending_accept'), '待确认');
  assert.equal(getOrderStatusLabel('in_progress'), '进行中');
  assert.equal(getOrderStatusLabel('completed'), '已完成');
  // 旧数据也能显示成正确文案
  assert.equal(getOrderStatusLabel('accepted'), '进行中');
  assert.equal(getOrderStatusLabel('unknown_status'), 'unknown_status');

  assert.equal(getPostStatusLabel('open'), '进行中');
  assert.equal(getPostStatusLabel('locked'), '已锁定');
  assert.equal(getPostStatusLabel('resolved'), '已解决');
});

test('sorts open posts before resolved ones by time desc', () => {
  const sorted = sortPostsByStatus([
    { id: 'resolved_old', status: 'resolved', createdAtTs: 100 },
    { id: 'open_new', status: 'open', createdAtTs: 300 },
    { id: 'open_old', status: 'open', createdAtTs: 200 },
    { id: 'resolved_new', status: 'resolved', createdAtTs: 400 }
  ]);

  assert.deepEqual(sorted.map((post) => post.id), [
    'open_new',
    'open_old',
    'resolved_new',
    'resolved_old'
  ]);
});
