const {
  getBlockedUsers,
  unblockUser,
  invalidateBlockCache
} = require('../../../utils/cloud-api');

// 黑名单管理页。
//
// 存在的理由：拉黑之后，取消拉黑的入口原本只有「那条会话」。
// 用户把会话左滑删掉，就再也找不到这个人，拉黑也就永远解不开了。
// 拉黑和删除会话本来就是两件事，不该互相绑定，所以给黑名单一个独立入口。
Page({
  data: {
    list: [],
    loading: true
  },

  onShow() {
    this.load();
  },

  async load() {
    const list = await getBlockedUsers();
    this.setData({ list, loading: false });
  },

  unblock(event) {
    const index = event.currentTarget.dataset.index;
    const item = this.data.list[index];
    if (!item) return;

    // 回调式确认，不用 await wx.showModal：部分基础库不返回 { confirm }，
    // 会导致弹窗关掉但什么都没发生。
    wx.showModal({
      title: '解除拉黑',
      content: `解除后你和「${item.name}」可以重新互相发送消息，对方发布的帖子也会重新出现在首页。`,
      confirmText: '解除',
      success: async (res) => {
        if (!res || !res.confirm) return;

        const result = await unblockUser({ targetOpenid: item.openid });
        if (!result || !result.ok) {
          wx.showModal({
            title: '解除失败',
            content: (result && result.message) || '请稍后重试',
            showCancel: false,
            confirmText: '知道了'
          });
          return;
        }

        // 首页的拉黑名单有 5 分钟缓存，不清掉的话对方帖子要等一会儿才回来
        invalidateBlockCache();
        this.setData({
          list: this.data.list.filter((_, i) => i !== index)
        });
        wx.showToast({ title: '已解除拉黑', icon: 'none' });
      },
      fail: () => {}
    });
  }
});
