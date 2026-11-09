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

function readPage(relative) {
  return fs.readFileSync(path.join(MINIPROGRAM, relative), 'utf8');
}

// ============================================================
// 会话不该在「只点开、没发消息」时就出现在对方列表
// ============================================================

test('createOrGetConversation leaves new conversations inactive', () => {
  const source = readCloudFunction('createOrGetConversation');

  // 曾经这里写了一条系统文案当 lastMessage，
  // 结果发起方一个字都没发，对方列表里就已经有这条会话了。
  // 现在 lastMessage 必须是空字符串，真正的最后一条消息由 sendMessage 写入。
  assert.equal(
    /lastMessage:\s*''/.test(source),
    true,
    'createOrGetConversation 的 lastMessage 不是空字符串，空会话会带一条假消息'
  );

  assert.equal(
    source.includes('hasMessages: false'),
    true,
    'createOrGetConversation 没有标记会话为「未开始」'
  );

  // 双方未读都必须是 0。给对方记 1 条未读，就是对方看到红点的直接原因
  assert.equal(
    /map\[id\]\s*=\s*0/.test(source),
    true,
    'createOrGetConversation 仍然给对方记了未读'
  );

  // 没发消息不该推订阅消息打扰对方
  assert.equal(
    source.includes('sendSubscribeNotice'),
    false,
    'createOrGetConversation 仍在建会话时推送订阅消息'
  );
});

test('sendMessage activates the conversation on the first message', () => {
  const source = readCloudFunction('sendMessage');

  assert.equal(
    source.includes('hasMessages: true'),
    true,
    'sendMessage 没有把会话标记为已开始，对方列表永远看不到'
  );

  // 首次消息才推订阅提醒
  assert.equal(
    source.includes('isFirstMessage'),
    true,
    'sendMessage 没有区分「第一条消息」，会每条都推订阅通知'
  );
});

test('sendMessage clears the hidden flag so a deleted conversation comes back', () => {
  const source = readCloudFunction('sendMessage');
  assert.equal(
    source.includes('hiddenMap'),
    true,
    'sendMessage 没有清除 hiddenMap，对方删除会话后永远收不到新消息'
  );
});

test('getConversationList hides inactive and deleted conversations', () => {
  const source = readCloudFunction('getConversationList');

  // 未开始的会话不能出现在列表里
  assert.equal(
    source.includes('hasMessages'),
    true,
    'getConversationList 没有过滤未开始的会话'
  );

  // 老数据没有 hasMessages 字段，必须兜住，否则历史会话整批消失
  assert.equal(
    source.includes('exists(false)'),
    true,
    'getConversationList 没有兼容缺少 hasMessages 字段的老会话'
  );

  // 左滑删除只删自己这边
  assert.equal(
    source.includes('hiddenMap'),
    true,
    'getConversationList 没有过滤用户删除掉的会话'
  );

  // 列表和角标一次返回，避免两次读数对不上
  assert.equal(
    source.includes('unreadTotal'),
    true,
    'getConversationList 没有返回总未读数'
  );
});

// ============================================================
// 左滑：删除 / 标为未读
// ============================================================

test('deleteConversation only hides the conversation for the caller', () => {
  const source = readCloudFunction('deleteConversation');

  assert.equal(
    source.includes('hiddenMap[openid] = true'),
    true,
    'deleteConversation 没有按当前用户打隐藏标记'
  );

  // 不能物理删除：对方还要能看到聊天记录，投诉取证也需要
  assert.equal(
    source.includes('.remove('),
    false,
    'deleteConversation 物理删除了记录，对方会丢失聊天记录'
  );

  // 点路径更新会静默失效，必须整体重写对象
  assert.equal(
    source.includes('...(conversation.hiddenMap'),
    true,
    'deleteConversation 用了点路径更新，可能静默不生效'
  );
});

test('markConversationUnread pins a reminder without counting history', () => {
  const source = readCloudFunction('markConversationUnread');

  assert.equal(
    source.includes('Math.max(1'),
    true,
    'markConversationUnread 没有把未读置为至少 1'
  );

  // 标为未读时要取消删除标记，否则列表里看不到这条会话
  assert.equal(
    source.includes('hiddenMap[openid] = false'),
    true,
    'markConversationUnread 没有取消删除标记'
  );
});

test('message page implements left-swipe actions', () => {
  const js = readPage('pages/message/index.js');
  const wxml = readPage('pages/message/index.wxml');

  assert.equal(js.includes('onTouchStart'), true, '消息页没有左滑手势');
  assert.equal(js.includes('doDelete'), true, '消息页没有删除会话的处理');
  assert.equal(js.includes('doMarkUnread'), true, '消息页没有标为未读的处理');
  assert.equal(wxml.includes('catchtap="doDelete"'), true, '删除按钮没有阻止冒泡');
  assert.equal(wxml.includes('catchtap="doMarkUnread"'), true, '标为未读按钮没有阻止冒泡');
});

// ============================================================
// 未读角标实时刷新
// ============================================================

test('message page polls while visible', () => {
  const js = readPage('pages/message/index.js');

  assert.equal(js.includes('setInterval'), true, '消息页没有轮询，停在列表页收不到新消息');
  assert.equal(js.includes('onHide'), true, '消息页没有在隐藏时停止轮询');
  assert.equal(js.includes('clearInterval'), true, '消息页没有清理定时器');
});

test('app polls the tabBar badge globally', () => {
  const source = readPage('app.js');

  assert.equal(
    source.includes('startBadgePolling'),
    true,
    'app.js 没有全局角标轮询，不在消息页时红点不会更新'
  );
  assert.equal(
    source.includes('stopBadgePolling'),
    true,
    'app.js 没有在退到后台时停止轮询'
  );
});

// ============================================================
// 到站后帖子不再展示
// ============================================================

test('createPost stamps an expiry from the bound itinerary', () => {
  const source = readCloudFunction('createPost');

  assert.equal(
    source.includes('expireAt'),
    true,
    'createPost 没有记录帖子过期时间，下车后帖子仍会挂在首页'
  );
  assert.equal(
    source.includes('trainBinding'),
    true,
    'createPost 没有读取车次绑定里的到达时间'
  );
});

test('getPosts filters expired posts at query level', () => {
  const source = fs.readFileSync(path.join(MINIPROGRAM, 'utils', 'cloud-api.js'), 'utf8');
  const start = source.indexOf('async function getPosts');
  const body = source.slice(start, source.indexOf('async function getPostById'));

  assert.equal(
    body.includes('expireAt'),
    true,
    'getPosts 没有过滤过期帖子'
  );
  // 老帖子没有 expireAt 字段，必须兜住，否则会整批消失
  assert.equal(
    body.includes('exists(false)'),
    true,
    'getPosts 没有兼容缺少 expireAt 字段的老帖子'
  );
});
