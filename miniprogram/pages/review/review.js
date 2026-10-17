const { getReviewScoreChange } = require('../../utils/rank');
const { submitReview } = require('../../utils/cloud-api');

Page({
  data: {
    rating: 'good',
    score: getReviewScoreChange('good'),
    content: ''
  },

  selectRating(event) {
    const rating = event.currentTarget.dataset.rating;
    this.setData({
      rating,
      score: getReviewScoreChange(rating)
    });
  },

  updateContent(event) {
    this.setData({
      content: event.detail.value
    });
  },

  async submitReview() {
    await submitReview({
      orderId: 'demo_order',
      revieweeOpenid: 'demo_user',
      rating: this.data.rating,
      currentScore: 260
    });
    wx.showToast({
      title: `本次信誉 +${this.data.score.total}`,
      icon: 'none'
    });
  }
});
