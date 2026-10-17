const HOT_DURATION_HOURS = 3;

function getHotEndTime(start = new Date()) {
  return new Date(start.getTime() + HOT_DURATION_HOURS * 60 * 60 * 1000);
}

function isExpired(post, now = new Date()) {
  if (!post || !post.expireAt) return false;
  return new Date(post.expireAt).getTime() <= now.getTime();
}

function isPostHotEligible(post, now = new Date()) {
  if (!post) return false;
  const visibleStatus = post.status === 'open' || post.status === 'displaying';
  const approved = !post.auditStatus || post.auditStatus === 'approved';
  return visibleStatus && approved && !post.isHot && !isExpired(post, now);
}

function canJoinHot({ user, post, now = new Date() }) {
  const hotQuota = Number(user && user.hotQuota) || 0;
  if (hotQuota <= 0) {
    return {
      allowed: false,
      reason: 'NO_HOT_QUOTA'
    };
  }

  if (!isPostHotEligible(post, now)) {
    return {
      allowed: false,
      reason: 'POST_NOT_ELIGIBLE'
    };
  }

  return {
    allowed: true,
    remainingQuota: hotQuota - 1
  };
}

module.exports = {
  HOT_DURATION_HOURS,
  canJoinHot,
  getHotEndTime,
  isPostHotEligible
};
