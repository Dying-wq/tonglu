const { getOrderStatusLabel, getPostStatusLabel, normalizePostStatus } = require('./order-flow');
const { POST_STATUS } = require('./constants');

function pad2(value) {
  return String(value).padStart(2, '0');
}

// createdAt 可能是 Date、时间戳或云数据库 serverDate 序列化后的日期字符串
function formatCreatedAt(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  const ts = date.getTime();
  if (!Number.isFinite(ts)) return '';
  return `${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

// 判断这条订单里我是发起求助的一方，还是接单帮助的一方
function getOrderRoleLabel(order, openid) {
  if (!openid) return '我参与的';
  if (order.publisherOpenid && order.publisherOpenid === openid) return '我发布的';
  if (order.takerOpenid && order.takerOpenid === openid) return '我接的单';
  return '我参与的';
}

function buildProfilePanels({ posts = [], orders = [], user = {} } = {}) {
  const ownPosts = posts.slice(0, 5).map((post) => {
    const status = normalizePostStatus(post.status) || POST_STATUS.OPEN;
    return {
      id: post.id || post._id,
      title: post.title || '未命名帖子',
      meta: `${post.tagName || post.type || '互助'} · ${getPostStatusLabel(status)} · 浏览${post.views || 0}`,
      desc: post.description || post.location || '暂无说明'
    };
  });

  // 「我的参与」用真实订单数据：状态文案取 order-flow 的映射，角色按 openid 判断
  const ownOrders = orders.slice(0, 5).map((order) => {
    const statusLabel = getOrderStatusLabel(order.status);
    const roleLabel = getOrderRoleLabel(order, user.openid);
    const timeText = formatCreatedAt(order.createdAt);
    return {
      id: order.id || order._id,
      title: order.title || '未命名记录',
      meta: `${statusLabel} · ${roleLabel}`,
      desc: [
        `求助者：${order.publisherName || '同车旅客'}`,
        `帮助者：${order.takerName || '同车旅客'}`,
        timeText
      ].filter(Boolean).join(' · ')
    };
  });

  return {
    posts: {
      title: '我的发布',
      empty: '还没有发布内容，去发布一条互助信息吧。',
      items: ownPosts
    },
    orders: {
      title: '我的参与',
      empty: '还没有参与记录，响应求助后会出现在这里。',
      items: ownOrders
    },
    badges: {
      title: '我的徽章',
      empty: '完成帮助或话题打卡即可获得徽章。',
      items: (user.badges || []).map((badge) => ({
        id: badge.key,
        title: badge.name,
        meta: badge.desc,
        desc: ''
      }))
    },
    credit: {
      title: '信用分',
      empty: '',
      items: [{
        id: 'credit_current',
        title: `信用分：${user.creditScore || 60}`,
        meta: `等级：${user.creditLevelName || '可信任旅客'}`,
        desc: `帮助次数：${user.helpCount || 0} · 被感谢：${user.thankCount || 0} · 话题打卡：${user.topicCount || 0}`
      }]
    },
    thanks: {
      title: '感谢墙',
      empty: '暂无感谢记录，帮助他人后被感谢会显示在这里。',
      items: []
    },
    reports: {
      title: '举报与申诉',
      empty: '暂无举报记录，有纠纷可在聊天页提交举报。',
      items: []
    },
    rules: {
      title: '平台规则',
      empty: '',
      items: [{
        id: 'rules',
        title: '互助须知与信用规则',
        meta: '禁止金钱交易 · 物物交换或无偿帮助',
        desc: '点击下方入口查看完整规则。'
      }]
    },
    settings: {
      title: '设置',
      empty: '',
      items: [{
        id: 'settings',
        title: '消息提醒设置',
        meta: '回帖提醒 · 系统通知',
        desc: '可开启或关闭微信订阅消息授权。'
      }]
    }
  };
}

module.exports = {
  buildProfilePanels
};
