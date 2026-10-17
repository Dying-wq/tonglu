const test = require('node:test');
const assert = require('node:assert/strict');

const {
  canJoinHot,
  getHotEndTime,
  isPostHotEligible
} = require('../miniprogram/utils/hot');

test('allows user with quota to promote an eligible published post', () => {
  const result = canJoinHot({
    user: { hotQuota: 2 },
    post: { status: 'open', auditStatus: 'approved', isHot: false, expireAt: '2026-06-21T10:00:00.000Z' },
    now: new Date('2026-06-20T08:00:00.000Z')
  });

  assert.equal(result.allowed, true);
  assert.equal(result.remainingQuota, 1);
});

test('blocks hot promotion when quota is empty', () => {
  const result = canJoinHot({
    user: { hotQuota: 0 },
    post: { status: 'open', auditStatus: 'approved', isHot: false },
    now: new Date('2026-06-20T08:00:00.000Z')
  });

  assert.deepEqual(result, {
    allowed: false,
    reason: 'NO_HOT_QUOTA'
  });
});

test('blocks hidden or expired posts from hot promotion', () => {
  assert.equal(isPostHotEligible({
    status: 'open',
    auditStatus: 'pending',
    isHot: false
  }), false);

  assert.equal(isPostHotEligible({
    status: 'open',
    auditStatus: 'approved',
    isHot: false,
    expireAt: '2026-06-20T07:59:59.000Z'
  }, new Date('2026-06-20T08:00:00.000Z')), false);
});

test('calculates hot end time as 3 hours later', () => {
  assert.equal(
    getHotEndTime(new Date('2026-06-20T08:00:00.000Z')).toISOString(),
    '2026-06-20T11:00:00.000Z'
  );
});
