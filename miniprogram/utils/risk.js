const { RISK_KEYWORDS } = require('./constants');

function detectRiskKeywords(text) {
  const content = String(text || '');
  const keywords = [];

  RISK_KEYWORDS.forEach((keyword) => {
    if (content.includes(keyword) && !keywords.includes(keyword)) {
      keywords.push(keyword);
    }
  });

  return {
    hasRisk: keywords.length > 0,
    keywords
  };
}

module.exports = {
  detectRiskKeywords
};
