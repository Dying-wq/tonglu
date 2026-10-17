const {
  getAdminDashboard,
  adminUpdateStatus,
  monthlyRankDecay
} = require('../../utils/cloud-api');
const { buildAdminStats, normalizeAdminRecord } = require('../../utils/admin');

const MODULES = [
  { key: 'users', title: '用户', desc: '头像、昵称、信誉、封禁状态', collection: 'users' },
  { key: 'posts', title: '帖子', desc: '下架违规内容，恢复正常帖子', collection: 'posts' },
  { key: 'orders', title: '订单', desc: '查看接单、完成、纠纷进展', collection: 'orders' },
  { key: 'reviews', title: '评价', desc: '查看互评与信誉加分记录', collection: 'reviews' },
  { key: 'notifications', title: '通知', desc: '订阅消息发送日志', collection: 'notification_logs' },
  { key: 'complaints', title: '投诉', desc: '举报、仲裁、申诉处理', collection: 'complaints', special: 'complaint' },
  { key: 'adminLogs', title: '日志', desc: '管理员操作记录', collection: 'admin_logs' }
];

function formatTime(value) {
  if (!value) return '暂无时间';
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toLocaleString();
  return '刚刚';
}

Page({
  data: {
    modules: MODULES,
    activeKey: 'users',
    activeModule: MODULES[0],
    dashboard: {},
    stats: buildAdminStats(),
    records: [],
    loading: false,
    emptyText: '暂无记录'
  },

  onLoad() {
    this.loadDashboard();
  },

  onPullDownRefresh() {
    this.loadDashboard().finally(() => wx.stopPullDownRefresh());
  },

  async loadDashboard() {
    this.setData({ loading: true });
    try {
      const dashboard = await getAdminDashboard();
      const stats = buildAdminStats(dashboard);
      this.setData({ dashboard, stats });
      this.setRecords(this.data.activeKey);
    } catch (error) {
      console.warn('管理后台加载失败：', error);
      wx.showToast({ title: '后台数据加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  selectModule(event) {
    const key = event.currentTarget.dataset.key;
    this.setRecords(key);
  },

  setRecords(key) {
    const activeModule = MODULES.find((item) => item.key === key) || MODULES[0];
    const source = this.data.dashboard[activeModule.key] || [];
    const records = source.map((record) => ({
      ...normalizeAdminRecord(record),
      avatarText: (record.avatarText || record.title || record.nickname || record.reason || record.content || '管').slice(0, 1),
      createdAtText: formatTime(record.createdAt),
      collection: record.adminCollection || activeModule.collection,
      canSuspend: ['users', 'posts', 'orders', 'reviews', 'complaints'].includes(activeModule.key),
      suspendText: activeModule.key === 'users' ? '封禁' : '下架',
      suspendStatus: activeModule.key === 'users' ? 'banned' : 'removed',
      restoreStatus: activeModule.key === 'posts' ? 'open' : 'active'
    }));

    this.setData({
      activeKey: activeModule.key,
      activeModule,
      records,
      emptyText: `${activeModule.title}暂无记录`
    });
  },

  async updateStatus(event) {
    const { collection, id, status } = event.currentTarget.dataset;
    if (!collection || !id || !status) return;

    wx.showLoading({ title: '处理中' });
    try {
      const result = await adminUpdateStatus({
        targetCollection: collection,
        targetId: id,
        status,
        note: '管理后台快捷处理'
      });
      wx.hideLoading();
      wx.showToast({
        title: result && result.ok ? '已更新' : '已记录演示操作',
        icon: 'none'
      });
      await this.loadDashboard();
    } catch (error) {
      wx.hideLoading();
      console.warn('管理操作失败：', error);
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  async runRankCheck() {
    wx.showLoading({ title: '检查中' });
    const result = await monthlyRankDecay();
    wx.hideLoading();
    wx.showToast({
      title: result && result.ok ? '信用检查完成' : '已本地记录',
      icon: 'none'
    });
  },

  goComplaintAdmin() {
    wx.navigateTo({
      url: '/pages/complaint-admin/complaint-admin'
    });
  }
});
