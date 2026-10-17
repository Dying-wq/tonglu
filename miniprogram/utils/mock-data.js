const { SERVICE_TYPES } = require('./constants');
const { getNextRankProgress, getCreditLevelName, getEarnedBadges } = require('./rank');

const currentUser = {
  id: 'user_demo_001',
  nickname: '旅者',
  avatarText: '旅',
  avatarUrl: '',
  signature: '同路同行，微光互照',
  themeColor: '#1f6feb',
  wechatId: '',
  allowWechatExchange: false,
  creditScore: 60,
  creditLevelName: '可信任旅客',
  isAdmin: true,
  helpCount: 0,
  topicCount: 0,
  thankCount: 0,
  monthlyCompletedCount: 0,
  trainNo: '',
  carriageNo: '',
  seatNo: ''
};

// 铁路互助帖子示例数据
const posts = [
  {
    id: 'post_help_001',
    type: 'help',
    title: '急需一片卫生巾',
    description: '5车厢，突然来了月经，遍寻不着，哪位好心的姐妹能借一片？万分感谢！',
    trainNo: 'K1234',
    carriageNo: '5',
    seatNo: '12A',
    location: 'K1234 · 5车厢',
    publisherName: '匿名旅客',
    avatarText: '匿',
    publisherCreditScore: 65,
    publisherRank: '可信任旅客',
    tagName: '求助',
    tagTone: 'red',
    urgencyLevel: 'urgent',
    urgencyColor: '#ffe6e6',
    views: 8,
    likes: 0,
    comments: 0,
    images: [],
    status: 'open',
    createdAt: '2 分钟前',
    createdAtTs: Date.now() - 2 * 60 * 1000
  },
  {
    id: 'post_offer_001',
    type: 'offer',
    title: '有多余的充电宝，可借20分钟',
    description: '满电20000mAh，4车厢8C座，有需要的旅客过来拿就行。',
    trainNo: 'K1234',
    carriageNo: '4',
    seatNo: '8C',
    location: 'K1234 · 4车厢',
    publisherName: '热心大叔',
    avatarText: '热',
    publisherCreditScore: 85,
    publisherRank: '可信任旅客',
    tagName: '帮助',
    tagTone: 'green',
    urgencyLevel: 'normal',
    urgencyColor: '#ffffff',
    views: 15,
    likes: 3,
    comments: 1,
    images: [],
    status: 'open',
    createdAt: '8 分钟前',
    createdAtTs: Date.now() - 8 * 60 * 1000
  },
  {
    id: 'post_help_002',
    type: 'help',
    title: '手机只剩10%电，求借充电线',
    description: '3车厢15B，Type-C接口，充十分钟就行，到站下车前归还。',
    trainNo: 'K1234',
    carriageNo: '3',
    seatNo: '15B',
    location: 'K1234 · 3车厢',
    publisherName: '小陈',
    avatarText: '陈',
    publisherCreditScore: 58,
    publisherRank: '普通旅客',
    tagName: '求助',
    tagTone: 'red',
    urgencyLevel: 'warning',
    urgencyColor: '#fff0e0',
    views: 12,
    likes: 1,
    comments: 0,
    images: [],
    status: 'open',
    createdAt: '15 分钟前',
    createdAtTs: Date.now() - 15 * 60 * 1000
  },
  {
    id: 'post_offer_002',
    type: 'offer',
    title: '有一包湿巾，谁需要？',
    description: '2车厢5A，拆了一包用不完，有需要的直接来拿。',
    trainNo: 'K1234',
    carriageNo: '2',
    seatNo: '5A',
    location: 'K1234 · 2车厢',
    publisherName: '旅者小李',
    avatarText: '李',
    publisherCreditScore: 70,
    publisherRank: '可信任旅客',
    tagName: '帮助',
    tagTone: 'green',
    urgencyLevel: 'normal',
    urgencyColor: '#ffffff',
    views: 20,
    likes: 5,
    comments: 2,
    images: [],
    status: 'open',
    createdAt: '30 分钟前',
    createdAtTs: Date.now() - 30 * 60 * 1000
  },
  {
    id: 'post_topic_001',
    type: 'topic',
    title: '拍一张窗外的风景',
    description: '这趟车窗外风景真好看，大家来分享呀～4车厢',
    trainNo: 'K1234',
    carriageNo: '4',
    seatNo: '',
    location: 'K1234 · 4车厢',
    publisherName: '风景控',
    avatarText: '风',
    publisherCreditScore: 62,
    publisherRank: '可信任旅客',
    tagName: '话题',
    tagTone: 'purple',
    urgencyLevel: 'normal',
    urgencyColor: '#ffffff',
    views: 25,
    likes: 8,
    comments: 3,
    images: [],
    status: 'open',
    createdAt: '45 分钟前',
    createdAtTs: Date.now() - 45 * 60 * 1000
  },
  {
    id: 'post_help_003',
    type: 'help',
    title: '有没有晕车药？',
    description: '6车厢，晕得不行，谁有晕车药能借一颗吗？谢谢！',
    trainNo: 'K1234',
    carriageNo: '6',
    seatNo: '3D',
    location: 'K1234 · 6车厢',
    publisherName: '晕车星人',
    avatarText: '晕',
    publisherCreditScore: 55,
    publisherRank: '普通旅客',
    tagName: '求助',
    tagTone: 'red',
    urgencyLevel: 'caution',
    urgencyColor: '#fff9e6',
    views: 18,
    likes: 2,
    comments: 1,
    images: [],
    status: 'open',
    createdAt: '1 小时前',
    createdAtTs: Date.now() - 60 * 60 * 1000
  },
  {
    id: 'post_offer_003',
    type: 'offer',
    title: '泡面多泡了一碗，谁要？',
    description: '7车厢2B，泡多了吃不完，热乎的，先到先得。',
    trainNo: 'K1234',
    carriageNo: '7',
    seatNo: '2B',
    location: 'K1234 · 7车厢',
    publisherName: '泡面达人',
    avatarText: '泡',
    publisherCreditScore: 68,
    publisherRank: '可信任旅客',
    tagName: '帮助',
    tagTone: 'green',
    urgencyLevel: 'normal',
    urgencyColor: '#ffffff',
    views: 30,
    likes: 6,
    comments: 4,
    images: [],
    status: 'open',
    createdAt: '1.5 小时前',
    createdAtTs: Date.now() - 90 * 60 * 1000
  },
  {
    id: 'post_topic_002',
    type: 'topic',
    title: '分享一句旅途心情',
    description: '列车飞驰，窗外的田野像翻动的书页，你此刻在想什么？',
    trainNo: 'K1234',
    carriageNo: '',
    seatNo: '',
    location: 'K1234',
    publisherName: '诗意旅者',
    avatarText: '诗',
    publisherCreditScore: 60,
    publisherRank: '可信任旅客',
    tagName: '话题',
    tagTone: 'purple',
    urgencyLevel: 'normal',
    urgencyColor: '#ffffff',
    views: 22,
    likes: 10,
    comments: 5,
    images: [],
    status: 'open',
    createdAt: '2 小时前',
    createdAtTs: Date.now() - 120 * 60 * 1000
  }
];

// 感谢墙数据
const thankWall = [
  { id: 'tw_001', fromName: '匿名旅客', toName: '热心大叔', content: '谢谢大哥借我充电宝，救了急！', createdAt: '10 分钟前' },
  { id: 'tw_002', fromName: '小陈', toName: '旅者小李', content: '感谢小李的湿巾，很贴心～', createdAt: '30 分钟前' },
  { id: 'tw_003', fromName: '匿名旅客', toName: '泡面达人', content: '一碗泡面温暖了我的旅途，谢谢！', createdAt: '1 小时前' },
  { id: 'tw_004', fromName: '晕车星人', toName: '匿名旅客', content: '感谢借我晕车药，终于不晕了', createdAt: '2 小时前' },
  { id: 'tw_005', fromName: '匿名旅客', toName: '风景控', content: '谢谢你发起的话题，旅途不再无聊', createdAt: '3 小时前' }
];

const conversations = [
  {
    id: 'conv_001',
    name: '热心大叔',
    avatarText: '热',
    rankName: '可信任旅客',
    lastMessage: '我就在4车厢8C，你过来拿吧。',
    lastMessageAt: '刚刚',
    unread: 1
  },
  {
    id: 'conv_002',
    name: '旅者小李',
    avatarText: '李',
    rankName: '可信任旅客',
    lastMessage: '湿巾还有，你几车厢？',
    lastMessageAt: '12:30',
    unread: 0
  }
];

const messages = [
  {
    id: 'msg_001',
    sender: 'other',
    content: '你好，我看到你发的求助了，我可以帮你。',
    createdAt: '12:20'
  },
  {
    id: 'msg_002',
    sender: 'me',
    content: '太感谢了！我在5车厢12A，您几车厢？',
    createdAt: '12:21'
  }
];

const demoOrder = {
  id: 'order_001',
  title: '急需一片卫生巾',
  status: 'accepted',
  amount: 0,
  publisherName: '旅者',
  takerName: '热心大叔'
};

// 当前用户的车次绑定状态
const trainBinding = {
  trainNo: 'K1234',
  carriageNo: '5',
  seatNo: '12A',
  boundAt: Date.now() - 30 * 60 * 1000,
  // 模拟：车程剩余比例（0-1）
  remainingRatio: 0.65,
  // 预计到站时间戳
  arrivalTs: Date.now() + 3 * 60 * 60 * 1000
};

module.exports = {
  currentUser: {
    ...currentUser,
    progress: getNextRankProgress(currentUser.creditScore),
    badges: getEarnedBadges(currentUser)
  },
  serviceTypes: SERVICE_TYPES,
  posts,
  thankWall,
  conversations,
  messages,
  demoOrder,
  trainBinding
};
