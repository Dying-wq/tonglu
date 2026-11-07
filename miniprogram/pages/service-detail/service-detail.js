const { serviceTypes } = require('../../utils/mock-data');
const {
  acceptOrder,
  addComment,
  ensureLogin,
  formatTime,
  getComments,
  getPostById,
  removeComment: removeCommentApi,
  saveSubscribeAuth
} = require('../../utils/cloud-api');
const { isActionOk, actionFailure, orderDetailUrl } = require('../../utils/action-result');
const { requestSubscribe } = require('../../utils/subscribe');

Page({
  data: {
    post: null,
    postId: '',
    actionText: '我来帮',
    contactText: '私信联系',
    canOrder: false,
    riskText: '平台禁止金钱交易，建议物物交换或无偿帮助。',
    loading: true,
    loadError: '',
    comments: [],
    commentInput: '',
    commentsLoading: true,
    commentsError: '',
    commentSubmitting: false,
    myOpenid: ''
  },

  onLoad(options = {}) {
    const postId = options.id || '';
    // 不再先用 mock-data 里的演示帖子渲染一遍：真实 id 拿不到数据时，
    // 假帖子会闪一下，甚至把「我来帮」点到演示帖子上。
    this.setData({ postId, loading: true });
    this.loadPost(postId);
  },

  async loadPost(id) {
    if (!id) {
      this.setData({ post: null, loading: false, loadError: '缺少帖子编号' });
      return;
    }
    const myOpenid = await ensureLogin();
    const post = await getPostById(id);
    if (!post) {
      this.setData({
        post: null,
        canOrder: false,
        loading: false,
        loadError: '帖子不存在或暂时读取失败',
        myOpenid: myOpenid || '',
        commentsLoading: false
      });
      return;
    }

    const service = serviceTypes.find((item) => item.key === post.type);
    this.setData({
      post: { ...post, tagName: service ? service.name : '互助' },
      actionText: service ? service.actionText : '我来帮',
      contactText: this.getContactText(post.type),
      canOrder: this.computeCanOrder(post),
      loading: false,
      loadError: '',
      myOpenid: myOpenid || ''
    });
    this.loadComments(id);
  },

  // 只有帖子仍开放且不是自己发布时，才显示「我来帮/联系TA」
  computeCanOrder(post) {
    if (!post || post.type === 'topic') return false;
    if (post.status && post.status !== 'open') return false;
    const app = typeof getApp === 'function' ? getApp() : null;
    const openid = app && app.globalData ? app.globalData.openid : '';
    if (openid && post.publisherOpenid && post.publisherOpenid === openid) return false;
    return true;
  },

  getContactText(type) {
    if (type === 'help') return '私信帮TA';
    if (type === 'offer') return '联系TA';
    if (type === 'topic') return '参与话题';
    return '私信联系';
  },

  async startOrder() {
    if (!this.data.post) return;
    let result = null;
    try {
      result = await acceptOrder(this.data.post);
    } catch (error) {
      console.error('接单失败：', error);
    }

    // 失败（含云端 ok:false、抛异常、缺订单号）一律停在本页。
    // 旧代码不管结果都 navigateTo，于是跳到 orderId= 的空订单页。
    const url = orderDetailUrl(result);
    if (!url) {
      wx.showModal({
        title: '接单未成功',
        content: actionFailure(result, '接单未成功，请确认已登录、帖子仍开放，且不是自己发布的内容。'),
        showCancel: false,
        confirmText: '我知道了'
      });
      return;
    }

    wx.showToast({ title: '已发起接单申请', icon: 'none' });
    this.requestNoticeAuth(['order', 'chat'], 'accept_order');
    wx.navigateTo({ url });
  },

  goChat() {
    if (!this.data.post || !this.data.post.id) return;
    wx.navigateTo({
      url: `/pages/message/chat?postId=${this.data.post.id}`
    });
  },

  // ---------------- 帖子评论 ----------------
  async loadComments(postId) {
    if (!postId) {
      this.setData({ comments: [], commentsLoading: false });
      return;
    }
    this.setData({ commentsLoading: true, commentsError: '' });
    try {
      const result = await getComments(postId);
      if (!isActionOk(result)) {
        this.setData({
          comments: [],
          commentsLoading: false,
          commentsError: actionFailure(result, '评论加载失败')
        });
        return;
      }
      const myOpenid = this.data.myOpenid || (await ensureLogin());
      this.setData({
        comments: (result.comments || []).map((item) => ({
          ...item,
          timeText: formatTime(item.createdAt),
          isMine: Boolean(myOpenid && item.authorOpenid === myOpenid)
        })),
        commentsLoading: false,
        commentsError: ''
      });
    } catch (error) {
      console.warn('读取评论失败：', error);
      this.setData({ comments: [], commentsLoading: false, commentsError: '评论加载失败，请稍后重试' });
    }
  },

  onCommentInput(event) {
    this.setData({ commentInput: event.detail.value });
  },

  async submitComment() {
    const content = (this.data.commentInput || '').trim();
    if (!content) {
      wx.showToast({ title: '请先写点内容', icon: 'none' });
      return;
    }
    if (this.data.commentSubmitting) return;

    this.setData({ commentSubmitting: true });
    let result = null;
    try {
      result = await addComment(this.data.postId, content);
    } catch (error) {
      console.error('发表评论失败：', error);
    } finally {
      this.setData({ commentSubmitting: false });
    }

    if (!isActionOk(result)) {
      wx.showModal({
        title: '评论未发布',
        content: actionFailure(result, '评论未发布，请稍后重试。'),
        showCancel: false,
        confirmText: '我知道了'
      });
      return;
    }
    this.setData({ commentInput: '' });
    wx.showToast({ title: '评论已发布', icon: 'none' });
    this.loadComments(this.data.postId);
  },

  removeComment(event) {
    const commentId = event.currentTarget.dataset.id;
    if (!commentId) return;
    wx.showModal({
      title: '删除评论',
      content: '确定删除这条评论吗？',
      success: async (res) => {
        if (!res.confirm) return;
        const result = await removeCommentApi(commentId);
        if (!isActionOk(result)) {
          wx.showToast({ title: actionFailure(result, '删除失败'), icon: 'none' });
          return;
        }
        this.loadComments(this.data.postId);
      }
    });
  },

  async requestNoticeAuth(channels, scene) {
    const result = await requestSubscribe(channels);
    if (result.ok) {
      await saveSubscribeAuth({
        channels,
        auth: result.auth,
        scene
      });
    }
  },

  goComplaint() {
    if (!this.data.post || !this.data.post.id) return;
    wx.navigateTo({
      url: `/pages/complaint-submit/complaint-submit?relatedId=${this.data.post.id}&relatedType=post`
    });
  }
});
