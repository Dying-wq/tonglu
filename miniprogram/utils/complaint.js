function getComplaintCreditPenalty(decision) {
  return decision === 'approve' ? -20 : 0;
}

function buildComplaintDecision({ decision, adminNote = '', targetUserOpenid = '' }) {
  return {
    status: decision === 'approve' ? 'approved' : 'rejected',
    creditPenalty: getComplaintCreditPenalty(decision),
    adminNote,
    targetUserOpenid
  };
}

module.exports = {
  buildComplaintDecision,
  getComplaintCreditPenalty
};
