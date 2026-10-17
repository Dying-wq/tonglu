const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getRankByScore,
  getReviewScoreChange,
  applyMonthlyRankDecay,
  getNextRankProgress
} = require('../miniprogram/utils/rank');

test('maps credit scores to simplified rank names', () => {
  assert.equal(getRankByScore(0), '青铜');
  assert.equal(getRankByScore(99), '青铜');
  assert.equal(getRankByScore(100), '白银');
  assert.equal(getRankByScore(399), '黄金');
  assert.equal(getRankByScore(700), '钻石');
  assert.equal(getRankByScore(1000), '星耀');
  assert.equal(getRankByScore(1500), '王者');
});

test('calculates doubled completion and review score changes', () => {
  assert.deepEqual(getReviewScoreChange('good'), {
    completionScore: 20,
    reviewBonus: 10,
    total: 30
  });
  assert.deepEqual(getReviewScoreChange('normal'), {
    completionScore: 20,
    reviewBonus: 0,
    total: 20
  });
  assert.deepEqual(getReviewScoreChange('bad'), {
    completionScore: 20,
    reviewBonus: -10,
    total: 10
  });
});

test('decays one rank when user was inactive last month', () => {
  const result = applyMonthlyRankDecay({
    creditScore: 450,
    rankName: '铂金',
    monthlyCompletedCount: 0,
    isAdmin: false
  });

  assert.equal(result.creditScore, 399);
  assert.equal(result.rankName, '黄金');
  assert.equal(result.decayed, true);
});

test('does not decay bronze, active users, or admins', () => {
  assert.equal(applyMonthlyRankDecay({
    creditScore: 60,
    rankName: '青铜',
    monthlyCompletedCount: 0,
    isAdmin: false
  }).rankName, '青铜');

  assert.equal(applyMonthlyRankDecay({
    creditScore: 450,
    rankName: '铂金',
    monthlyCompletedCount: 2,
    isAdmin: false
  }).rankName, '铂金');

  assert.equal(applyMonthlyRankDecay({
    creditScore: 1600,
    rankName: '王者',
    monthlyCompletedCount: 0,
    isAdmin: true
  }).rankName, '王者');
});

test('reports progress to next rank', () => {
  assert.deepEqual(getNextRankProgress(150), {
    currentRank: '白银',
    nextRank: '黄金',
    currentScore: 150,
    nextScore: 200,
    progress: 50
  });

  assert.deepEqual(getNextRankProgress(1600), {
    currentRank: '王者',
    nextRank: null,
    currentScore: 1600,
    nextScore: null,
    progress: 100
  });
});
