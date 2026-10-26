const test = require('node:test');
const assert = require('node:assert/strict');

const { buildProfilePanels } = require('../miniprogram/utils/profile');

test('builds profile panels for every personal center menu action', () => {
  const panels = buildProfilePanels({
    posts: [{ id: 'p1', title: '快递代取', status: 'open', tagName: '快递', views: 8 }],
    orders: [{
      id: 'o1',
      title: '打印资料',
      status: 'completed',
      publisherOpenid: 'u1',
      takerOpenid: 'u2',
      publisherName: '小A',
      takerName: '小B'
    }],
    user: { openid: 'u1', creditScore: 65, helpCount: 2, thankCount: 1, topicCount: 0 }
  });

  assert.deepEqual(Object.keys(panels), [
    'posts',
    'orders',
    'badges',
    'credit',
    'thanks',
    'reports',
    'rules',
    'settings'
  ]);

  assert.equal(panels.posts.items[0].title, '快递代取');
  assert.equal(panels.posts.items[0].meta, '快递 · 进行中 · 浏览8');
  assert.equal(panels.orders.items[0].meta, '已完成 · 我发布的');
  assert.equal(panels.credit.items[0].title, '信用分：65');
  assert.equal(panels.credit.items[0].meta, '等级：可信任旅客');
});

test('marks the order as taken when current user is the helper', () => {
  const panels = buildProfilePanels({
    orders: [{ id: 'o2', title: '借充电宝', status: 'in_progress', publisherOpenid: 'u2', takerOpenid: 'u1' }],
    user: { openid: 'u1' }
  });

  assert.equal(panels.orders.items[0].meta, '进行中 · 我接的单');
  // 旧版状态值也要显示成正确文案
  assert.equal(panels.orders.items[0].desc, '求助者：同车旅客 · 帮助者：同车旅客');
});

test('renders legacy accepted status as in progress', () => {
  const panels = buildProfilePanels({
    orders: [{ id: 'o3', title: '雨伞借用', status: 'accepted', takerOpenid: 'u1' }],
    user: { openid: 'u1' }
  });

  assert.equal(panels.orders.items[0].meta, '进行中 · 我接的单');
});

test('shows empty copy when there is nothing to display', () => {
  const panels = buildProfilePanels({});

  assert.deepEqual(panels.posts.items, []);
  assert.deepEqual(panels.orders.items, []);
  assert.equal(panels.posts.empty.length > 0, true);
  assert.equal(panels.orders.title, '我的参与');
  assert.equal(panels.badges.title, '我的徽章');
});

test('maps earned badges into panel items', () => {
  const panels = buildProfilePanels({
    user: {
      badges: [{ key: 'first_help', name: '热心旅客', desc: '完成第一次帮助' }]
    }
  });

  assert.deepEqual(panels.badges.items, [{
    id: 'first_help',
    title: '热心旅客',
    meta: '完成第一次帮助',
    desc: ''
  }]);
});
