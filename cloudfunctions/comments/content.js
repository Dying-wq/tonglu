'use strict';

// 评论内容校验。与 createPost / miniprogram/utils/constants.js 保持同一口径，
// 云函数目录是独立上传的，不能跨目录 require，所以这里自带一份词库。
const MAX_LENGTH = 200;
const RISK_WORDS = [
  '转账', '微信付款', '支付宝', '先付', '押金', '保证金', '定金', '手续费',
  '私下交易', '不走平台', '加微信付款', '二维码收款', '收款码', '有偿服务',
  '出售', '倒卖', '代购', '刷单', '中奖', '免费领', '诈骗',
  '违禁品', '管制刀具', '易燃', '易爆', '色情', '低俗', '裸聊', '陪聊',
  '代考', '出售答案', '考试答案'
];

function normalizeContent(value) {
  return String(value == null ? '' : value).trim();
}

function findRiskWords(text) {
  const content = String(text || '');
  return RISK_WORDS.filter((word) => content.includes(word));
}

function validateComment(value) {
  const content = normalizeContent(value);
  if (!content) {
    return { ok: false, code: 'EMPTY_COMMENT', message: '评论内容不能为空。' };
  }
  if (content.length > MAX_LENGTH) {
    return { ok: false, code: 'COMMENT_TOO_LONG', message: `评论最多 ${MAX_LENGTH} 字。` };
  }
  const riskKeywords = findRiskWords(content);
  if (riskKeywords.length) {
    return {
      ok: false,
      code: 'RISK_CONTENT',
      message: `评论包含敏感词（${riskKeywords.join('、')}），请修改后再发布。`,
      riskKeywords
    };
  }
  return { ok: true, content };
}

module.exports = {
  MAX_LENGTH,
  RISK_WORDS,
  normalizeContent,
  findRiskWords,
  validateComment
};
