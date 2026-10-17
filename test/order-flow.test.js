const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getAcceptedOrderState,
  getInitialOrderState,
  isPostVisibleInList
} = require('../miniprogram/utils/order-flow');

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

test('only open posts are visible in public list', () => {
  assert.equal(isPostVisibleInList({ status: 'open' }), true);
  assert.equal(isPostVisibleInList({ status: 'locked' }), false);
  assert.equal(isPostVisibleInList({ status: 'completed' }), false);
});
