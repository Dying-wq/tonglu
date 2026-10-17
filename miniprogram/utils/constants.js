// ====================================================================
// 同路·微光 — 铁路旅客互助平台 常量定义
// ====================================================================

// 帖子类型：求助 / 帮助 / 话题打卡
const SERVICE_TYPES = [
  {
    key: 'help',
    name: '求助',
    actionText: '我来帮',
    icon: '求',
    color: '#EB5757'
  },
  {
    key: 'offer',
    name: '帮助',
    actionText: '联系TA',
    icon: '助',
    color: '#27AE60'
  },
  {
    key: 'topic',
    name: '话题打卡',
    actionText: '参与',
    icon: '题',
    color: '#7C3AED'
  }
];

// 帖子状态
const POST_STATUS = {
  OPEN: 'open',          // 进行中
  RESOLVED: 'resolved',  // 已解决（求助者确认）
  CLOSED: 'closed',      // 已关闭（列车到站自动关闭）
  CANCELLED: 'cancelled' // 已取消
};

// 帮助响应状态
const ORDER_STATUS = {
  PENDING: 'pending',        // 有人响应，等待求助者选择
  ACCEPTED: 'accepted',      // 求助者已选定帮助者
  COMPLETED: 'completed',    // 已确认完成
  EXPIRED: 'expired',        // 超时未确认，自动关闭
  CANCELLED: 'cancelled'     // 已取消
};

// ====================================================================
// 信用分体系（初始60分，数值制）
// ====================================================================
const INITIAL_CREDIT_SCORE = 60;

// 信用分变动规则
const CREDIT_RULES = {
  HELP_COMPLETED: 5,       // 完成一次帮助（求助者确认）+5
  REPORT_VERIFIED: 3,      // 举报经核实属实 +3
  FAKE_OR_AD: -10,         // 发布虚假求助/广告 -10
  HARASSMENT_3X: -20,      // 被3个不同用户举报骚扰 -20
  NO_SHOW: -5              // 答应帮助后爽约 -5
};

// 信用分等级与权限
const CREDIT_LEVELS = {
  TRUSTED: { min: 60, max: Infinity, name: '可信任旅客', color: '#27AE60',
    canPost: true, canChat: true, canBrowse: true },
  NORMAL: { min: 40, max: 59, name: '普通旅客', color: '#F2994A',
    canPost: false, canChat: true, canBrowse: true },
  LOW: { min: 1, max: 39, name: '受限旅客', color: '#EB5757',
    canPost: false, canChat: false, canBrowse: true },
  BANNED: { min: -Infinity, max: 0, name: '已封禁', color: '#999999',
    canPost: false, canChat: false, canBrowse: false }
};

// 旧版兼容：保留 REVIEW_SCORE 和 COMPLETION_SCORE 接口
const REVIEW_SCORE = {
  good: CREDIT_RULES.HELP_COMPLETED,
  normal: 0,
  bad: CREDIT_RULES.NO_SHOW
};
const COMPLETION_SCORE = CREDIT_RULES.HELP_COMPLETED;

// ====================================================================
// 徽章与称号系统
// ====================================================================
const BADGES = [
  {
    key: 'first_help',
    name: '热心旅客',
    desc: '完成第一次帮助',
    condition: { helpCount: 1 },
    icon: 'star'
  },
  {
    key: 'pioneer',
    name: '同路先锋',
    desc: '累计帮助3次',
    condition: { helpCount: 3 },
    icon: 'medal'
  },
  {
    key: 'light_bearer',
    name: '微光使者',
    desc: '累计帮助10次（永久称号）',
    condition: { helpCount: 10 },
    icon: 'crown'
  },
  {
    key: 'topic_record',
    name: '旅途记录者',
    desc: '发布第一次话题打卡',
    condition: { topicCount: 1 },
    icon: 'camera'
  }
];

// ====================================================================
// 举报系统
// ====================================================================
const REPORT_REASONS = [
  { key: 'fraud', name: '诈骗/金钱交易' },
  { key: 'harassment', name: '骚扰' },
  { key: 'ad', name: '广告' },
  { key: 'other', name: '其他' }
];

// 同一用户被3个不同人举报且理由一致 → 自动临时封禁24小时
const AUTO_BAN_THRESHOLD = 3;
const AUTO_BAN_HOURS = 24;

// ====================================================================
// 消息保留期限
// ====================================================================
const MESSAGE_RETENTION_DAYS = 7;

// ====================================================================
// 风控敏感词库（铁路场景）
// ====================================================================
const RISK_KEYWORDS = [
  // 金钱交易类
  '转账',
  '微信付款',
  '支付宝',
  '先付',
  '押金',
  '保证金',
  '定金',
  '手续费',
  '私下交易',
  '不走平台',
  '加微信付款',
  '二维码收款',
  '收款码',
  '有偿服务',
  '高价',
  '出售',
  '倒卖',
  '代购',
  // 诈骗类
  '诈骗',
  '骗',
  '刷单',
  '兼职刷',
  '中奖',
  '免费领',
  '薅羊毛',
  // 违禁品类
  '违禁品',
  '管制刀具',
  '易燃',
  '易爆',
  // 骚扰类
  '低俗',
  '色情',
  '骚扰',
  '陪聊',
  '裸聊',
  // 其他
  '代课',
  '代签到',
  '代写作业',
  '代考试',
  '代考',
  '出售答案',
  '考试答案'
];

// ====================================================================
// 剩余车程比例颜色标识
// ====================================================================
const URGENCY_COLORS = {
  FRESH: '#e8f5e9',       // 发布≤5分钟，绿色底色
  NORMAL: '#ffffff',       // >50%，白色
  CAUTION: '#fff9e6',      // 25%-50%，浅黄色
  WARNING: '#fff0e0',      // 10%-25%，橙色
  URGENT: '#ffe6e6'        // <10%，浅红色
};

module.exports = {
  SERVICE_TYPES,
  POST_STATUS,
  ORDER_STATUS,
  INITIAL_CREDIT_SCORE,
  CREDIT_RULES,
  CREDIT_LEVELS,
  REVIEW_SCORE,
  COMPLETION_SCORE,
  BADGES,
  REPORT_REASONS,
  AUTO_BAN_THRESHOLD,
  AUTO_BAN_HOURS,
  MESSAGE_RETENTION_DAYS,
  RISK_KEYWORDS,
  URGENCY_COLORS
};
