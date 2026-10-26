const test = require('node:test');
const assert = require('node:assert/strict');

const { detectRiskKeywords } = require('../miniprogram/utils/risk');
const { RISK_KEYWORDS } = require('../miniprogram/utils/constants');

// 报告书 2.2.4：发布与私信都走屏蔽词检测，命中即拦截

test('detects transfer and deposit risk words in chat text', () => {
  const result = detectRiskKeywords('先转账给我，另外要交一点押金');

  assert.equal(result.hasRisk, true);
  assert.deepEqual(result.keywords, ['转账', '押金']);
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

test('handles empty or non-string input safely', () => {
  assert.deepEqual(detectRiskKeywords(''), { hasRisk: false, keywords: [] });
  assert.deepEqual(detectRiskKeywords(null), { hasRisk: false, keywords: [] });
  assert.deepEqual(detectRiskKeywords(undefined), { hasRisk: false, keywords: [] });
  assert.deepEqual(detectRiskKeywords(12345), { hasRisk: false, keywords: [] });
});

test('keeps the money-trade keywords required by the rule book', () => {
  const required = ['转账', '押金', '保证金', '不走平台', '私下交易', '有偿服务'];
  required.forEach((keyword) => {
    assert.equal(RISK_KEYWORDS.includes(keyword), true, `缺少敏感词：${keyword}`);
  });
});
