const test = require('node:test');
const assert = require('node:assert/strict');

const { buildProfilePanels } = require('../miniprogram/utils/profile');

test('builds profile panels for every personal center menu action', () => {
  const panels = buildProfilePanels({
    posts: [{ id: 'p1', title: '快递代取', status: 'open', tagName: '快递', views: 8 }],
    orders: [{ id: 'o1', title: '打印资料', status: 'completed', amount: 6 }],
    user: { rankName: '黄金', creditScore: 260, hotQuota: 2, monthlyCompletedCount: 3 }
  });

  assert.deepEqual(Object.keys(panels), [
    'posts',
    'orders',
    'hot',
    'rank',
    'favorites',
    'reports',
    'rules',
    'settings'
  ]);
  assert.equal(panels.posts.items[0].title, '快递代取');
  assert.equal(panels.orders.items[0].meta, 'completed · ¥6');
  assert.equal(panels.rank.items[0].title, '当前段位：黄金');
});
