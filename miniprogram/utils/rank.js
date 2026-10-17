const {
  INITIAL_CREDIT_SCORE,
  CREDIT_LEVELS,
  CREDIT_RULES,
  BADGES
} = require('./constants');

// ====================================================================
// 信用分等级判定
// ====================================================================
function getCreditLevel(score) {
  const safeScore = Math.max(0, Number(score) || 0);
  if (safeScore >= CREDIT_LEVELS.TRUSTED.min) return CREDIT_LEVELS.TRUSTED;
  if (safeScore >= CREDIT_LEVELS.NORMAL.min) return CREDIT_LEVELS.NORMAL;
  if (safeScore >= CREDIT_LEVELS.LOW.min) return CREDIT_LEVELS.LOW;
  return CREDIT_LEVELS.BANNED;
}

function getCreditLevelName(score) {
  return getCreditLevel(score).name;
}

function getCreditColor(score) {
  return getCreditLevel(score).color;
}

// 信用分区间颜色（用于列表页展示发布者信用）
function getCreditBadgeColor(score) {
  const safeScore = Number(score) || 0;
  if (safeScore >= 60) return '#27AE60'; // 绿色
  if (safeScore >= 40) return '#F2994A'; // 黄色
  return '#EB5757';                       // 红色
}

// ====================================================================
// 信用分变动计算
// ====================================================================
function applyCreditChange(user, ruleKey, extra = {}) {
  const delta = CREDIT_RULES[ruleKey] || 0;
  const currentScore = Number(user.creditScore) || INITIAL_CREDIT_SCORE;
  const newScore = Math.max(-100, currentScore + delta);

  return {
    ...user,
    creditScore: newScore,
    creditDelta: delta,
    creditLevelName: getCreditLevelName(newScore)
  };
}

// 完成帮助后的信用分变动
function getHelpCompletedScoreChange() {
  return {
    completionScore: CREDIT_RULES.HELP_COMPLETED,
    reviewBonus: 0,
    total: CREDIT_RULES.HELP_COMPLETED
  };
}

// 兼容旧接口：getReviewScoreChange
function getReviewScoreChange(rating) {
  const map = {
    good: CREDIT_RULES.HELP_COMPLETED,
    normal: 0,
    bad: CREDIT_RULES.NO_SHOW
  };
  const reviewBonus = map[rating] || 0;
  return {
    completionScore: CREDIT_RULES.HELP_COMPLETED,
    reviewBonus,
    total: CREDIT_RULES.HELP_COMPLETED + reviewBonus
  };
}

// ====================================================================
// 月度衰减（保留接口但简化：仅在信用分>60且无活动时轻微衰减）
// ====================================================================
function applyMonthlyRankDecay(user) {
  if (user.isAdmin || (user.monthlyCompletedCount || 0) > 0) {
    return { ...user, decayed: false };
  }

  const currentScore = Number(user.creditScore) || INITIAL_CREDIT_SCORE;
  if (currentScore <= INITIAL_CREDIT_SCORE) {
    return { ...user, decayed: false };
  }

  // 超过初始分且无活动，回落到初始分
  return {
    ...user,
    creditScore: INITIAL_CREDIT_SCORE,
    monthlyCompletedCount: 0,
    decayed: true
  };
}

// ====================================================================
// 信用分进度（兼容旧接口，返回等级信息）
// ====================================================================
function getNextRankProgress(score) {
  const safeScore = Math.max(0, Number(score) || 0);
  const level = getCreditLevel(safeScore);

  return {
    currentRank: level.name,
    nextRank: null,
    currentScore: safeScore,
    nextScore: null,
    progress: 100
  };
}

// 兼容旧接口
function getRankByScore(score) {
  return getCreditLevelName(score);
}

function getRankIndex(rankName) {
  const levels = [CREDIT_LEVELS.BANNED, CREDIT_LEVELS.LOW, CREDIT_LEVELS.NORMAL, CREDIT_LEVELS.TRUSTED];
  const index = levels.findIndex((level) => level.name === rankName);
  return index === -1 ? 0 : index;
}

// ====================================================================
// 徽章系统
// ====================================================================
function getEarnedBadges(user) {
  const helpCount = Number(user.helpCount) || 0;
  const topicCount = Number(user.topicCount) || 0;

  return BADGES.filter((badge) => {
    if (badge.condition.helpCount !== undefined) {
      return helpCount >= badge.condition.helpCount;
    }
    if (badge.condition.topicCount !== undefined) {
      return topicCount >= badge.condition.topicCount;
    }
    return false;
  });
}

function getLatestBadge(user) {
  const earned = getEarnedBadges(user);
  return earned.length > 0 ? earned[earned.length - 1] : null;
}

module.exports = {
  getCreditLevel,
  getCreditLevelName,
  getCreditColor,
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
};
