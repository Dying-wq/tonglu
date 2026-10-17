const test = require('node:test');
const assert = require('node:assert/strict');

const { detectRiskKeywords } = require('../miniprogram/utils/risk');

test('detects transfer and deposit risk words in chat text', () => {
  const result = detectRiskKeywords('先转账给我，另外要交一点押金');

  assert.equal(result.hasRisk, true);
  assert.deepEqual(result.keywords, ['先转账', '押金']);
});

test('returns no risk for ordinary campus chat', () => {
  const result = detectRiskKeywords('我在东门等你，拿到后发消息');

  assert.deepEqual(result, {
    hasRisk: false,
    keywords: []
  });
});

test('deduplicates repeated risk words', () => {
  const result = detectRiskKeywords('保证金保证金，不走平台');

  assert.deepEqual(result.keywords, ['保证金', '不走平台']);
});
