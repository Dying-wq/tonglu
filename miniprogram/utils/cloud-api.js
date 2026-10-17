const mockData = require('./mock-data');
const { isPostVisibleInList, sortPostsByStatus, getUrgencyInfo } = require('./order-flow');
const { getCreditBadgeColor, getCreditLevelName } = require('./rank');

function getCloudReady() {
  const app = typeof getApp === 'function' ? getApp() : null;
  return Boolean(app && app.globalData && app.globalData.cloudReady && wx.cloud);
}

function callFunction(name, data = {}) {
  if (!getCloudReady()) {
    return Promise.resolve({
      result: {
        ok: false,
        offline: true,
        message: '云开发未初始化，当前使用本地演示数据。'
      }
    });
  }

  return wx.cloud.callFunction({
    name,
    data
  }).catch((error) => {
    console.warn(`云函数 ${name} 调用失败，已回退到演示模式：`, error);
    return {
      result: {
        ok: false,
        offline: true,
        functionName: name,
        errorCode: error && error.errCode,
        message: `云函数 ${name} 未就绪，请确认已上传部署。`
      }
    };
  });
}

// ====================================================================
// 登录
// ====================================================================
async function login() {
  const res = await callFunction('login');
  if (res.result && res.result.openid && typeof getApp === 'function') {
    getApp().globalData.openid = res.result.openid;
  }
  return res.result;
}

// ====================================================================
// 车次绑定
// ====================================================================
async function bindTrain(payload) {
  const res = await callFunction('bindTrain', payload);
  if (res.result && res.result.ok && typeof getApp === 'function') {
    getApp().setTrainBinding(res.result.binding);
  }
  return res.result;
}

async function unbindTrain() {
  const res = await callFunction('unbindTrain');
  if (typeof getApp === 'function') {
    getApp().setTrainBinding(null);
  }
  return res.result;
}

// ====================================================================
// 帖子列表（按同车次过滤）
// ====================================================================
async function getPosts(type, trainNo) {
  const app = typeof getApp === 'function' ? getApp() : null;
  const currentTrain = trainNo || (app && app.globalData.trainBinding && app.globalData.trainBinding.trainNo);

  // 未绑定车次时不展示任何帖子。铁路互助的核心是同车匹配，
  // 未绑定用户若能看到全平台信息，等于绕过了这一核心设计。
  // 此处返回空列表，由 home.wxml 显示"请先绑定车次查看同车信息"。
  if (!currentTrain) {
    return [];
  }

  if (!getCloudReady()) {
    let visiblePosts = mockData.posts.filter(isPostVisibleInList);
    // 同车次过滤
    if (currentTrain) {
      visiblePosts = visiblePosts.filter((post) => post.trainNo === currentTrain);
    }
    // 类型过滤
    if (type) {
      visiblePosts = visiblePosts.filter((post) => post.type === type);
    }
    // 排序：open在前，resolved在后
    return sortPostsByStatus(visiblePosts);
  }

  try {
    const db = wx.cloud.database();
    const query = {};
    if (type) query.type = type;
    if (currentTrain) query.trainNo = currentTrain;
    query.status = db.command.in(['open', 'resolved']);

    const res = await db.collection('posts')
      .where(query)
      .orderBy('createdAt', 'desc')
      .get();

    const app2 = typeof getApp === 'function' ? getApp() : null;
    const binding = app2 && app2.globalData.trainBinding;
    const remainingRatio = binding ? binding.remainingRatio : 1;

    return res.data.map((post) => {
      const urgencyInfo = getUrgencyInfo(remainingRatio, post.createdAt);
      return {
        id: post._id,
        type: post.type,
        title: post.title,
        description: post.description,
        trainNo: post.trainNo,
        carriageNo: post.carriageNo,
        seatNo: post.seatNo,
        images: post.images || [],
        location: post.location || `${post.trainNo} · ${post.carriageNo}车厢`,
        publisherName: (post.publisherInfo && post.publisherInfo.nickname) || '匿名旅客',
        publisherCreditScore: (post.publisherInfo && post.publisherInfo.creditScore) || 60,
        publisherRank: (post.publisherInfo && post.publisherInfo.rankName) || getCreditLevelName(60),
        status: post.status,
        urgencyLevel: urgencyInfo.level,
        urgencyColor: urgencyInfo.color,
        createdAt: formatTime(post.createdAt)
      };
    });
  } catch (error) {
    console.error('读取 posts 集合失败：', error);
    // 云开发已就绪时不再回退演示数据：假数据会掩盖真实的查询错误，
    // 造成"界面有内容、实际没读到"的误判。失败就返回空列表，由页面显示空状态。
    return [];
  }
}

// ====================================================================
// 我的发布：按 publisherOpenid 查询当前用户发布的帖子
// 注意：云函数写入的 posts 记录没有 _openid 字段，
//       创建者标识存放在 publisherOpenid 中，不能按 _openid 查。
// ====================================================================
async function getMyPosts() {
  if (!getCloudReady()) return [];

  const app = typeof getApp === 'function' ? getApp() : null;
  const openid = app && app.globalData ? app.globalData.openid : '';
  if (!openid) return [];

  try {
    const db = wx.cloud.database();
    const res = await db.collection('posts')
      .where({ publisherOpenid: openid })
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();
    return res.data;
  } catch (error) {
    console.error('读取我的发布失败：', error);
    return [];
  }
}

async function getPostById(id) {
  const fallback = mockData.posts.find((post) => post.id === id) || mockData.posts[0];
  if (!getCloudReady()) {
    return fallback;
  }

  try {
    const db = wx.cloud.database();
    const res = await db.collection('posts').doc(id).get();
    const post = res.data;
    return {
      id: post._id,
      type: post.type,
      title: post.title,
      description: post.description,
      trainNo: post.trainNo,
      carriageNo: post.carriageNo,
      seatNo: post.seatNo,
      images: post.images || [],
      location: post.location || `${post.trainNo} · ${post.carriageNo}车厢`,
      publisherName: (post.publisherInfo && post.publisherInfo.nickname) || '匿名旅客',
      publisherCreditScore: (post.publisherInfo && post.publisherInfo.creditScore) || 60,
      publisherRank: (post.publisherInfo && post.publisherInfo.rankName) || getCreditLevelName(60),
      status: post.status,
      createdAt: formatTime(post.createdAt)
    };
  } catch (error) {
    return fallback;
  }
}

// ====================================================================
// 发布帖子
// ====================================================================
async function createPost(form) {
  const res = await callFunction('createPost', form);
  return res.result;
}

// ====================================================================
// 帮助响应流程
// ====================================================================
async function acceptOrder(post) {
  const res = await callFunction('acceptOrder', {
    postId: post.id || post._id,
    postType: post.type
  });
  return res.result;
}

async function ensureConversation(payload = {}) {
  return createOrGetConversation(payload);
}

async function createOrGetConversation(payload = {}) {
  const res = await callFunction('createOrGetConversation', payload);
  if (res.result && res.result.ok) return res.result;
  return {
    ...(res.result || {}),
    ok: false,
    offline: true,
    conversationId: 'demo_conversation'
  };
}

async function publisherAcceptOrder(orderId) {
  const res = await callFunction('publisherAcceptOrder', { orderId });
  return res.result;
}

async function confirmComplete(orderId) {
  const res = await callFunction('confirmComplete', { orderId });
  return res.result;
}

async function submitReview(payload) {
  const res = await callFunction('submitReview', payload);
  return res.result;
}

// ====================================================================
// 消息系统
// ====================================================================
async function sendMessage(message) {
  const res = await callFunction('sendMessage', message);
  return res.result;
}

async function getConversations() {
  return getConversationList();
}

async function getConversationList() {
  if (!getCloudReady()) return mockData.conversations;

  try {
    const res = await callFunction('getConversationList');
    if (res.result && res.result.ok) return res.result.conversations || [];
    const db = wx.cloud.database();
    const dbRes = await db.collection('conversations').orderBy('lastMessageAt', 'desc').limit(50).get();
    return dbRes.data.map((item) => ({
      id: item._id,
      postId: item.postId,
      orderId: item.orderId,
      name: item.peerName || item.postTitle || '同路旅客',
      avatarText: item.peerAvatarText || (item.peerName ? item.peerName.slice(0, 1) : '旅'),
      rankName: item.peerRankName || '可信任旅客',
      lastMessage: item.lastMessage || '暂无消息',
      lastMessageAt: '刚刚',
      unread: item.unread || item.unreadCount || 0,
      relatedTitle: item.relatedTitle || item.postTitle || ''
    }));
  } catch (error) {
    console.warn('读取 conversations 集合失败，已回退到本地会话：', error);
    return mockData.conversations;
  }
}

async function getMessages(conversationId) {
  return getMessageList(conversationId);
}

async function getMessageList(conversationId) {
  if (!getCloudReady() || !conversationId || conversationId === 'demo_conversation') {
    return mockData.messages;
  }

  try {
    const res = await callFunction('getMessageList', { conversationId });
    if (res.result && res.result.ok) return res.result.messages || [];
    return mockData.messages;
  } catch (error) {
    console.warn('读取 messages 集合失败，已回退到本地消息：', error);
    return mockData.messages;
  }
}

async function markConversationRead(conversationId) {
  const res = await callFunction('markConversationRead', { conversationId });
  return res.result;
}

async function getUnreadCount() {
  const res = await callFunction('getUnreadCount');
  if (res.result && res.result.ok) return res.result.unreadCount || 0;
  return mockData.conversations.reduce((sum, item) => sum + (Number(item.unread) || 0), 0);
}

async function getOrderById(orderId) {
  const fallback = {
    ...mockData.demoOrder,
    id: orderId || mockData.demoOrder.id
  };
  if (!getCloudReady() || !orderId) return fallback;

  try {
    const db = wx.cloud.database();
    const res = await db.collection('orders').doc(orderId).get();
    const order = res.data;
    return {
      id: order._id,
      postId: order.postId,
      conversationId: order.conversationId,
      title: order.title,
      status: order.status,
      publisherName: order.publisherName || '求助者',
      takerName: order.takerName || '帮助者'
    };
  } catch (error) {
    console.warn('读取 orders 集合失败，已回退到演示订单：', error);
    return fallback;
  }
}

// ====================================================================
// 感谢墙
// ====================================================================
async function getThankWall() {
  if (!getCloudReady()) {
    return mockData.thankWall;
  }

  try {
    const db = wx.cloud.database();
    const res = await db.collection('thank_wall')
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get();
    return res.data.map((item) => ({
      id: item._id,
      fromName: item.fromName || '匿名旅客',
      toName: item.toName || '匿名旅客',
      content: item.content || '',
      createdAt: formatTime(item.createdAt)
    }));
  } catch (error) {
    console.warn('读取感谢墙失败，已回退到演示数据：', error);
    return mockData.thankWall;
  }
}

// ====================================================================
// 举报与投诉
// ====================================================================
async function requestWechatExchange(conversationId) {
  const res = await callFunction('requestWechatExchange', { conversationId });
  return res.result;
}

async function createComplaint(payload = {}) {
  const res = await callFunction('createComplaint', payload);
  return res.result;
}

async function reviewComplaint(payload = {}) {
  const res = await callFunction('reviewComplaint', payload);
  return res.result;
}

async function reportConversationOrMessage(payload = {}) {
  const res = await callFunction('reportConversationOrMessage', payload);
  return res.result;
}

async function blockUser(payload = {}) {
  const res = await callFunction('blockUser', payload);
  return res.result;
}

// ====================================================================
// 个人资料
// ====================================================================
async function updateProfile(payload = {}) {
  const res = await callFunction('updateProfile', payload);
  return res.result;
}

async function monthlyRankDecay(payload = {}) {
  const res = await callFunction('monthlyRankDecay', payload);
  return res.result;
}

async function saveSubscribeAuth(payload = {}) {
  const res = await callFunction('saveSubscribeAuth', payload);
  return res.result;
}

async function sendSubscribeNotice(payload = {}) {
  const res = await callFunction('sendSubscribeNotice', payload);
  return res.result;
}

// ====================================================================
// 管理后台
// ====================================================================
async function getComplaints() {
  if (!getCloudReady()) {
    return [{
      _id: 'demo_complaint',
      relatedId: 'demo_order',
      relatedType: 'order',
      reason: '骚扰',
      content: '对方在私信中发送不当内容。',
      status: 'pending',
      targetUserOpenid: 'demo_target'
    }];
  }

  try {
    const db = wx.cloud.database();
    const res = await db.collection('complaints')
      .where({ status: 'pending' })
      .orderBy('createdAt', 'desc')
      .get();
    return res.data;
  } catch (error) {
    console.warn('读取 complaints 集合失败：', error);
    return [];
  }
}

async function getAdminDashboard() {
  const fallback = {
    users: [mockData.currentUser],
    posts: mockData.posts,
    orders: [mockData.demoOrder],
    reviews: [],
    notifications: [],
    complaints: [{
      _id: 'demo_complaint',
      relatedId: 'demo_order',
      relatedType: 'order',
      reason: '骚扰',
      content: '演示投诉：建议管理员结合聊天记录处理。',
      status: 'pending',
      targetOpenid: 'demo_target',
      createdAt: '刚刚'
    }],
    adminLogs: []
  };

  if (!getCloudReady()) return fallback;

  const res = await callFunction('getAdminDashboard');
  if (res.result && res.result.ok) return res.result.data || fallback;

  console.warn('读取管理后台数据失败，已回退到演示数据：', res.result);
  return fallback;
}

async function adminUpdateStatus(payload = {}) {
  const res = await callFunction('adminUpdateStatus', payload);
  return res.result;
}

// ====================================================================
// 工具函数
// ====================================================================
function formatTime(ts) {
  if (!ts) return '刚刚';
  const now = Date.now();
  const diff = now - (typeof ts === 'number' ? ts : Date.parse(ts));
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
  return Math.floor(diff / 86400000) + ' 天前';
}

module.exports = {
  login,
  bindTrain,
  unbindTrain,
  getPosts,
  getPostById,
  getMyPosts,
  createPost,
  acceptOrder,
  ensureConversation,
  createOrGetConversation,
  publisherAcceptOrder,
  sendMessage,
  getConversations,
  getConversationList,
  getMessages,
  getMessageList,
  markConversationRead,
  getUnreadCount,
  getOrderById,
  confirmComplete,
  createComplaint,
  submitReview,
  requestWechatExchange,
  monthlyRankDecay,
  reviewComplaint,
  getComplaints,
  updateProfile,
  saveSubscribeAuth,
  sendSubscribeNotice,
  reportConversationOrMessage,
  blockUser,
  getThankWall,
  getAdminDashboard,
  adminUpdateStatus
};
