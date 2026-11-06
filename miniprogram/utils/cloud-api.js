const mockData = require('./mock-data');
const { isPostVisibleInList, sortPostsByStatus, getUrgencyInfo } = require('./order-flow');
const { getCreditBadgeColor, getCreditLevelName } = require('./rank');
const { calcRemainingRatio } = require('./train');

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
// 拉黑名单缓存
// ====================================================================
// 首页每次刷新都去云端拉一次拉黑名单太重（一次刷新多一次云函数调用），
// 所以本地缓存 5 分钟。拉黑 / 取消拉黑后调用 invalidateBlockCache()
// 让缓存立即失效，保证「刚拉黑就看不到对方帖子」是即时生效的。
const BLOCK_CACHE_TTL = 5 * 60 * 1000;
const EMPTY_BLOCK_RELATIONS = { blockedOpenids: [], blockedByOpenids: [], hiddenOpenids: [] };
let blockCache = { relations: EMPTY_BLOCK_RELATIONS, fetchedAt: 0 };

function invalidateBlockCache() {
  blockCache = { relations: EMPTY_BLOCK_RELATIONS, fetchedAt: 0 };
}

async function getBlockRelations(force = false) {
  const now = Date.now();
  if (!force && blockCache.fetchedAt && now - blockCache.fetchedAt < BLOCK_CACHE_TTL) {
    return blockCache.relations;
  }

  if (!getCloudReady()) {
    return blockCache.relations;
  }

  const res = await callFunction('getBlockList');
  const result = res.result || {};

  if (result.ok) {
    blockCache = {
      relations: {
        blockedOpenids: result.blockedOpenids || [],
        blockedByOpenids: result.blockedByOpenids || [],
        hiddenOpenids: result.hiddenOpenids || []
      },
      fetchedAt: now
    };
    return blockCache.relations;
  }

  // 云函数未部署 / 调用失败时不清空已有缓存：
  // 拉黑名单读不到，不该让被拉黑的人重新出现在首页。
  return blockCache.relations;
}

async function getBlockList(force = false) {
  const relations = await getBlockRelations(force);
  return relations.hiddenOpenids;
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

  // 匹配边界：同车次，且只按车次。
  // 互助场景中，同一列车上的旅客走几节车厢就能帮上忙，车厢号只是
  // 「我在哪」的定位信息（方便线下找到人），不构成可见性条件。
  // 因此这里不按车厢过滤，也不按车厢排序——同车次的所有帖子平等展示。
  //
  // 未绑定车次时不展示任何帖子：铁路互助的核心是同车匹配，
  // 未绑定用户若能看到全平台信息，等于绕过了这一核心设计。
  // 此处返回空列表，由 home.wxml 显示"请先绑定车次查看同车信息"。
  if (!currentTrain) {
    return [];
  }

  // 拉黑过滤：被我拉黑的人、以及拉黑我的人，帖子都不出现在首页。
  // 双向隐藏是刻意的——单向隐藏时，被拉黑方仍能看到帖子、点进去私信，
  // 却因为会话被阻断而发不出消息，表现为「点了发送没反应」的困惑。
  const hiddenOpenids = await getBlockList();
  const isHiddenPublisher = (post) => Boolean(post.publisherOpenid)
    && hiddenOpenids.indexOf(post.publisherOpenid) !== -1;

  if (!getCloudReady()) {
    let visiblePosts = mockData.posts.filter(isPostVisibleInList);
    // 只按车次过滤
    if (currentTrain) {
      visiblePosts = visiblePosts.filter((post) => post.trainNo === currentTrain);
    }
    // 类型过滤
    if (type) {
      visiblePosts = visiblePosts.filter((post) => post.type === type);
    }
    // 拉黑过滤
    visiblePosts = visiblePosts.filter((post) => !isHiddenPublisher(post));
    // 排序：open在前，resolved在后
    return sortPostsByStatus(visiblePosts);
  }

  try {
    const db = wx.cloud.database();
    const query = {};
    if (type) query.type = type;
    if (currentTrain) query.trainNo = currentTrain;
    // 不加 carriageNo 条件：同车次不同车厢的用户必须能互相看到
    query.status = db.command.in(['open', 'resolved']);
    // 在数据库查询层就排除被拉黑用户的帖子，而不是取回来再在 JS 里筛：
    // 客户端查询有 20 条上限，先取后筛会让一页只剩十几条，出现"翻不到底"的错觉。
    if (hiddenOpenids.length) {
      query.publisherOpenid = db.command.nin(hiddenOpenids);
    }

    const res = await db.collection('posts')
      .where(query)
      .orderBy('createdAt', 'desc')
      .get();

    const rawPosts = res.data || [];

    const app2 = typeof getApp === 'function' ? getApp() : null;
    const binding = app2 && app2.globalData.trainBinding;
    // 剩余车程比例按当前时间实时计算，避免用绑定时的静态值导致颜色永远不变
    const remainingRatio = binding ? calcRemainingRatio(binding) : 1;

    return rawPosts.map((post) => {
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
        publisherOpenid: post.publisherOpenid || '',
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

// ====================================================================
// 我的参与：查我作为「求助者」或「帮助者」参与的订单
// acceptOrder 写入 publisherOpenid / takerOpenid，没有 _openid 字段，
// 因此只能用这两个字段做 or 查询。集合权限「仅创建者可读写」下，
// 读不到别人代建的记录，所以这里只查自己相关的单子。
// ====================================================================
async function getMyOrders() {
  if (!getCloudReady()) return [];

  const app = typeof getApp === 'function' ? getApp() : null;
  const openid = app && app.globalData ? app.globalData.openid : '';
  if (!openid) return [];

  try {
    const db = wx.cloud.database();
    const _ = db.command;
    const res = await db.collection('orders')
      .where(_.or([
        { takerOpenid: openid },
        { publisherOpenid: openid }
      ]))
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();
    return res.data || [];
  } catch (error) {
    console.error('读取我的参与失败：', error);
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
      publisherOpenid: post.publisherOpenid || '',
      publisherName: (post.publisherInfo && post.publisherInfo.nickname) || '匿名旅客',
      publisherCreditScore: (post.publisherInfo && post.publisherInfo.creditScore) || 60,
      publisherRank: (post.publisherInfo && post.publisherInfo.rankName) || getCreditLevelName(60),
      status: post.status,
      createdAt: formatTime(post.createdAt)
    };
  } catch (error) {
    // 云开发就绪后不回退演示帖子，避免详情页显示与真实数据无关的内容
    console.warn('读取帖子详情失败：', error);
    return null;
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

async function cancelOrder(orderId) {
  const res = await callFunction('cancelOrder', { orderId });
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
    console.warn('getConversationList 返回异常，已返回空会话列表');
    return [];
  } catch (error) {
    // 不再回退到前端直查 conversations 集合：集合权限一旦放开，
    // 直查会绕过 openid 过滤，把全平台会话暴露给任意用户。
    console.warn('读取会话列表失败，已返回空列表：', error);
    return [];
  }
}

async function getMessages(conversationId) {
  return getMessageList(conversationId);
}

async function getMessageList(conversationId) {
  // 没有会话 id 就没有消息，不能回退演示数据：
  // 假消息会带着「30 分钟前」这类固定时间，让用户误以为是真实聊天记录。
  if (!conversationId) {
    return [];
  }
  if (!getCloudReady()) {
    return [];
  }

  try {
    const res = await callFunction('getMessageList', { conversationId });
    if (res.result && res.result.ok) {
      return (res.result.messages || []).map(normalizeMessage);
    }
    console.warn('getMessageList 返回异常，已返回空消息列表');
    return [];
  } catch (error) {
    // 云开发就绪后不再回退演示消息，避免假数据掩盖真实错误
    console.warn('读取消息列表失败，已返回空列表：', error);
    return [];
  }
}

// 把云端返回的消息整理成页面直接可用的结构。
// createdAt 可能是 Date 对象、时间戳或 ISO 字符串，统一转成「HH:mm」或「MM-DD HH:mm」。
function normalizeMessage(item = {}) {
  return {
    id: item._id || item.id || `msg_${Math.random().toString(36).slice(2)}`,
    sender: item.sender || (item.isMine ? 'me' : 'other'),
    content: item.content || '',
    contentType: item.contentType || 'text',
    riskStatus: item.riskStatus || 'safe',
    createdAt: formatMessageTime(item.createdAt)
  };
}

function formatMessageTime(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  const ts = date.getTime();
  if (!Number.isFinite(ts)) return '';
  const pad = (n) => String(n).padStart(2, '0');
  const now = new Date();
  const sameDay = date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return sameDay ? time : `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${time}`;
}

async function markConversationRead(conversationId) {
  const res = await callFunction('markConversationRead', { conversationId });
  return res.result;
}

async function getUnreadCount() {
  const res = await callFunction('getUnreadCount');
  if (res.result && res.result.ok) return res.result.unreadCount || 0;
  // 读不到未读数时按 0 处理，不再用本地演示会话累加
  return 0;
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
      publisherOpenid: order.publisherOpenid || '',
      takerOpenid: order.takerOpenid || '',
      publisherName: order.publisherName || '求助者',
      takerName: order.takerName || '帮助者'
    };
  } catch (error) {
    // 读不到订单时返回 null，由页面显示「订单不存在或无权查看」
    console.warn('读取订单失败：', error);
    return null;
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
    console.warn('读取感谢墙失败，已返回空列表：', error);
    return [];
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
  // 拉黑成功后立即让名单缓存失效，否则 5 分钟内首页还能看到对方帖子
  if (res.result && res.result.ok) {
    invalidateBlockCache();
  }
  return res.result;
}

async function unblockUser(payload = {}) {
  const res = await callFunction('unblockUser', payload);
  if (res.result && res.result.ok) {
    invalidateBlockCache();
  }
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
  getMyOrders,
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
  cancelOrder,
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
  unblockUser,
  getBlockList,
  getBlockRelations,
  invalidateBlockCache,
  getThankWall,
  getAdminDashboard,
  adminUpdateStatus
};
