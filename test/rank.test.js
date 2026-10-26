const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getCreditLevel,
  getCreditLevelName,
  getCreditBadgeColor,
  applyCreditChange,
  getHelpCompletedScoreChange,
  getReviewScoreChange,
  applyMonthlyRankDecay,
  getNextRankProgress,
  getRankByScore,
  getRankIndex,
  getEarnedBadges,
  getLatestBadge
} = require('../miniprogram/utils/rank');

// 取值依据：《同路·微光》项目报告书 2.2.1 信用分规则 + 附件1《信用分规则手册》
//   初始 60 分；完成帮助 +5；举报属实 +3；虚假/广告 -10；被 3 人举报骚扰 -20；爽约 -5
//   ≥60 全部功能 / 40-59 仅浏览私信 / <40 仅浏览 / ≤0 封禁

test('maps credit scores to level names', () => {
  assert.equal(getCreditLevelName(100), '可信任旅客');
  assert.equal(getCreditLevelName(60), '可信任旅客');
  assert.equal(getCreditLevelName(59), '普通旅客');
  assert.equal(getCreditLevelName(40), '普通旅客');
  assert.equal(getCreditLevelName(39), '受限旅客');
  assert.equal(getCreditLevelName(1), '受限旅客');
  assert.equal(getCreditLevelName(0), '已封禁');
  assert.equal(getCreditLevelName(-20), '已封禁');
});

test('exposes credit level permissions required by the rule book', () => {
  assert.equal(getCreditLevel(60).canPost, true);
  assert.equal(getCreditLevel(50).canPost, false);
  assert.equal(getCreditLevel(50).canChat, true);
  assert.equal(getCreditLevel(30).canChat, false);
  assert.equal(getCreditLevel(0).canBrowse, false);
});

test('colors credit badges by score band', () => {
  assert.equal(getCreditBadgeColor(60), '#27AE60');
  assert.equal(getCreditBadgeColor(40), '#F2994A');
  assert.equal(getCreditBadgeColor(39), '#EB5757');
});

test('grants five points for a completed help', () => {
  assert.deepEqual(getHelpCompletedScoreChange(), {
    completionScore: 5,
    reviewBonus: 0,
    total: 5
  });
});

test('applies review bonus on top of completion score', () => {
  assert.deepEqual(getReviewScoreChange('good'), {
    completionScore: 5,
    reviewBonus: 5,
    total: 10
  });
  assert.deepEqual(getReviewScoreChange('normal'), {
    completionScore: 5,
    reviewBonus: 0,
    total: 5
  });
  assert.deepEqual(getReviewScoreChange('bad'), {
    completionScore: 5,
    reviewBonus: -5,
    total: 0
  });
});

test('applies credit rule deltas and refreshes level name', () => {
  const rewarded = applyCreditChange({ creditScore: 60 }, 'HELP_COMPLETED');
  assert.equal(rewarded.creditScore, 65);
  assert.equal(rewarded.creditDelta, 5);
  assert.equal(rewarded.creditLevelName, '可信任旅客');

  const penalized = applyCreditChange({ creditScore: 60 }, 'FAKE_OR_AD');
  assert.equal(penalized.creditScore, 50);
  assert.equal(penalized.creditLevelName, '普通旅客');

  // 没有信用分字段时按初始 60 分计算
  assert.equal(applyCreditChange({}, 'HELP_COMPLETED').creditScore, 65);

  // 下限锁定在 -100
  assert.equal(applyCreditChange({ creditScore: -100 }, 'FAKE_OR_AD').creditScore, -100);
});

test('decays inactive users back to the initial score', () => {
  const result = applyMonthlyRankDecay({
    creditScore: 80,
    monthlyCompletedCount: 0,
    isAdmin: false
  });

  assert.equal(result.creditScore, 60);
  assert.equal(result.decayed, true);
});

test('does not decay new users, active users, or admins', () => {
  assert.equal(applyMonthlyRankDecay({
    creditScore: 60,
    monthlyCompletedCount: 0,
    isAdmin: false
  }).decayed, false);

  assert.equal(applyMonthlyRankDecay({
    creditScore: 80,
    monthlyCompletedCount: 2,
    isAdmin: false
  }).decayed, false);

  assert.equal(applyMonthlyRankDecay({
    creditScore: 80,
    monthlyCompletedCount: 0,
    isAdmin: true
  }).decayed, false);
});

test('reports level progress for credit score', () => {
  assert.deepEqual(getNextRankProgress(65), {
    currentRank: '可信任旅客',
    nextRank: null,
    currentScore: 65,
    nextScore: null,
    progress: 100
  });

  assert.equal(getRankByScore(30), '受限旅客');
  assert.equal(getRankIndex('已封禁'), 0);
  assert.equal(getRankIndex('可信任旅客'), 3);
  assert.equal(getRankIndex('不存在的等级'), 0);
});

test('earns badges by help count and topic count', () => {
  assert.deepEqual(getEarnedBadges({ helpCount: 0 }).length, 0);

  const first = getEarnedBadges({ helpCount: 1 }).map((badge) => badge.key);
  assert.deepEqual(first, ['first_help']);

  const three = getEarnedBadges({ helpCount: 3 }).map((badge) => badge.key);
  assert.deepEqual(three, ['first_help', 'pioneer']);

  const ten = getEarnedBadges({ helpCount: 10 }).map((badge) => badge.key);
  assert.deepEqual(ten, ['first_help', 'pioneer', 'light_bearer']);

  const topic = getEarnedBadges({ helpCount: 0, topicCount: 1 }).map((badge) => badge.key);
  assert.deepEqual(topic, ['topic_record']);

  assert.equal(getLatestBadge({ helpCount: 3 }).key, 'pioneer');
  assert.equal(getLatestBadge({ helpCount: 0 }), null);
});
