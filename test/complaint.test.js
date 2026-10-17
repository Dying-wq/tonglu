const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildComplaintDecision,
  getComplaintCreditPenalty
} = require('../miniprogram/utils/complaint');

test('applies credit penalty when complaint is approved', () => {
  assert.equal(getComplaintCreditPenalty('approve'), -20);
});

test('does not apply credit penalty when complaint is rejected', () => {
  assert.equal(getComplaintCreditPenalty('reject'), 0);
});

test('builds approved complaint decision payload', () => {
  assert.deepEqual(buildComplaintDecision({
    decision: 'approve',
    adminNote: '证据有效',
    targetUserOpenid: 'user_a'
  }), {
    status: 'approved',
    creditPenalty: -20,
    adminNote: '证据有效',
    targetUserOpenid: 'user_a'
  });
});
