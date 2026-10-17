const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildUnreadMapAfterMessage,
  clearUnreadForUser,
  getTotalUnread,
  shouldSendSubscribeNotice
} = require('../miniprogram/utils/notification');

test('increments unread count for every receiver except sender', () => {
  const result = buildUnreadMapAfterMessage({
    currentUnreadMap: { user_a: 1, user_b: 0 },
    participantIds: ['user_a', 'user_b', 'user_c'],
    senderId: 'user_b'
  });

  assert.deepEqual(result, {
    user_a: 2,
    user_b: 0,
    user_c: 1
  });
});

test('clears unread count for user entering chat', () => {
  assert.deepEqual(clearUnreadForUser({
    unreadMap: { user_a: 3, user_b: 2 },
    userId: 'user_a'
  }), {
    user_a: 0,
    user_b: 2
  });
});

test('sums unread counts safely', () => {
  assert.equal(getTotalUnread({ a: 1, b: 4, c: '2', d: null }), 7);
});

test('allows subscribe notice for key service events only when enabled and authorized', () => {
  const settings = { chat: true, order: true, hot: false };
  const auth = { chat: true, order: true, hot: true };

  assert.equal(shouldSendSubscribeNotice({ eventType: 'first_contact', settings, auth }), true);
  assert.equal(shouldSendSubscribeNotice({ eventType: 'order_taken', settings, auth }), true);
  assert.equal(shouldSendSubscribeNotice({ eventType: 'hot_success', settings, auth }), false);
  assert.equal(shouldSendSubscribeNotice({ eventType: 'chat_message', settings, auth }), false);
});
