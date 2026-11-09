const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const CLOUD_FUNCTIONS = path.join(ROOT, 'cloudfunctions');
const MINIPROGRAM = path.join(ROOT, 'miniprogram');

function readCloudFunction(name) {
  return fs.readFileSync(path.join(CLOUD_FUNCTIONS, name, 'index.js'), 'utf8');
}

function readMini(relative) {
  return fs.readFileSync(path.join(MINIPROGRAM, relative), 'utf8');
}

// ============================================================
// 长按消息：删除（单方）与撤回（双方）
// ============================================================

test('deleteMessage hides the message only for the caller', () => {
  const source = readCloudFunction('deleteMessage');

  assert.equal(
    source.includes('deletedFor'),
    true,
    'deleteMessage 没有按用户记录删除标记'
  );

  // 不能物理删除：对方还要能看到，投诉取证也需要原始内容
  assert.equal(
    source.includes('.remove('),
    false,
    'deleteMessage 物理删除了消息，对方会丢失聊天记录'
  );

  // 必须校验会话参与者，防止知道 messageId 的第三方乱删
  assert.equal(
    source.includes('NOT_PARTICIPANT'),
    true,
    'deleteMessage 没有校验会话参与者'
  );
});

test('recallMessage enforces the two minute window on the server', () => {
  const source = readCloudFunction('recallMessage');

  assert.equal(
    source.includes('RECALL_WINDOW_MS'),
    true,
    'recallMessage 没有撤回时限'
  );
  assert.equal(
    source.includes('2 * 60 * 1000'),
    true,
    '撤回时限不是 2 分钟'
  );

  // 只能撤回自己发的消息
  assert.equal(
    source.includes('NOT_SENDER'),
    true,
    'recallMessage 没有校验发送者'
  );

  // 撤回后正文必须清空，否则还能从数据库或接口读回原文
  assert.equal(
    source.includes("content: ''"),
    true,
    'recallMessage 没有清空正文'
  );

  // 撤回最后一条时，会话列表摘要也要跟着改
  assert.equal(
    source.includes('消息已撤回'),
    true,
    'recallMessage 没有同步会话列表的最后一条消息'
  );
});

test('getMessageList filters deleted messages and reports recalled ones', () => {
  const source = readCloudFunction('getMessageList');

  assert.equal(
    source.includes('deletedFor'),
    true,
    'getMessageList 没有过滤自己删除的消息'
  );
  assert.equal(
    source.includes('recalled'),
    true,
    'getMessageList 没有返回撤回标记，前端无法渲染占位'
  );
});

test('chat page wires long press to recall and delete', () => {
  const wxml = readMini('pages/message/chat.wxml');
  const js = readMini('pages/message/chat.js');

  assert.equal(
    wxml.includes('bindlongpress="onMessageLongPress"'),
    true,
    '消息气泡没有绑定长按事件'
  );
  assert.equal(js.includes('doRecall'), true, '聊天页没有撤回处理');
  assert.equal(js.includes('doDelete'), true, '聊天页没有删除处理');

  // 撤回选项必须一直出现在菜单里，超时时改为「撤回（已超时）」并给出原因。
  // 之前超时后直接不显示这一项，用户看到的是「删除有、撤回没有」，
  // 会判断成功能没做，而不是「超过 2 分钟不能撤回」。
  assert.equal(
    js.includes('撤回（已超时）'),
    true,
    '超时后菜单里没有撤回项，用户会以为撤回功能没实现'
  );

  // 时限必须在长按时用当前时间重算，不能读渲染时算好的 canRecall：
  // 页面开几分钟后那个值还是 true，会给出一个点了必然失败的「撤回」
  assert.equal(
    js.includes('canRecallNow'),
    true,
    '长按时没有按当前时间重新判断撤回时限'
  );
});

// ============================================================
// 拉黑与删除会话解耦
// ============================================================

test('blocked users have an independent management page', () => {
  const appJson = JSON.parse(readMini('app.json'));
  assert.equal(
    appJson.pages.includes('pages/user/blocked-users/blocked-users'),
    true,
    '黑名单页没有注册到 app.json'
  );

  const page = readMini('pages/user/blocked-users/blocked-users.js');
  assert.equal(page.includes('getBlockedUsers'), true, '黑名单页没有读取名单');
  assert.equal(page.includes('unblockUser'), true, '黑名单页不能解除拉黑');

  // 解除后必须让首页的拉黑缓存失效，否则对方帖子要等 5 分钟才回来
  assert.equal(
    page.includes('invalidateBlockCache'),
    true,
    '解除拉黑后没有清除拉黑名单缓存'
  );

  const profile = readMini('pages/profile/profile.wxml');
  assert.equal(
    profile.includes('goBlockedUsers'),
    true,
    '「我的」页面没有黑名单入口'
  );
});

test('deleting a blocked conversation does not block unblocking later', () => {
  const source = readCloudFunction('deleteConversation');

  // 删除逻辑不能因为 status 是 blocked 就拒绝
  assert.equal(
    source.includes("status === 'blocked'"),
    false,
    'deleteConversation 对已拉黑的会话做了限制，拉黑和删除不该互相关联'
  );
});

test('unblockUser can resolve the conversation from targetOpenid alone', () => {
  const source = readCloudFunction('unblockUser');

  // 从黑名单页进来时没有 conversationId，必须能反查会话
  assert.equal(
    source.includes('effectiveConversationId'),
    true,
    'unblockUser 没有从 targetOpenid 反查会话，黑名单页解除后会话状态仍是 blocked'
  );

  // 解除拉黑要清掉删除标记，否则列表里仍然看不到对方
  assert.equal(
    source.includes('hiddenMap'),
    true,
    'unblockUser 没有清除删除会话的隐藏标记'
  );
});

test('getBlockList returns display info for the block list page', () => {
  const source = readCloudFunction('getBlockList');

  assert.equal(
    source.includes('blockedUsers'),
    true,
    'getBlockList 没有返回带昵称头像的名单'
  );
  assert.equal(
    source.includes("collection('users')"),
    true,
    'getBlockList 没有查 users 表补昵称头像'
  );
});

// ============================================================
// 老帖子过期兜底
// ============================================================

test('legacy posts without expireAt still expire after 24 hours', () => {
  const source = readMini('utils/cloud-api.js');
  const start = source.indexOf('async function getPosts');
  const body = source.slice(start, source.indexOf('async function getPostById'));

  assert.equal(
    body.includes('LEGACY_POST_TTL_MS'),
    true,
    '老帖子没有过期兜底，第三批之前发的帖子会永远挂在首页'
  );
  assert.equal(
    body.includes('createdAt: cmd.gt'),
    true,
    '老帖子没有按发布时间判断有效期'
  );
});
