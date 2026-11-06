const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const CLOUD_FUNCTIONS = path.join(ROOT, 'cloudfunctions');

function readCloudFunction(name) {
  return fs.readFileSync(path.join(CLOUD_FUNCTIONS, name, 'index.js'), 'utf8');
}

// 会话列表曾经把「发布者昵称」当成「对方昵称」存成 peerName，
// 结果发布者本人打开会话看到的是自己的名字和头像。
// 未读红点则是因为用了点路径更新 unreadMap 而静默失效。
// 这两条都用静态检查守住。

test('getConversationList resolves the peer from participantIds, not a single stored name', () => {
  const source = readCloudFunction('getConversationList');
  assert.equal(
    source.includes("ids.find((id) => id !== openid)"),
    true,
    'getConversationList 没有按「另一个人」算对方 openid'
  );
  assert.equal(
    source.includes("collection('users')"),
    true,
    'getConversationList 没有查 users 表取对方最新昵称/头像'
  );
});

test('createOrGetConversation stores display info for both participants', () => {
  const source = readCloudFunction('createOrGetConversation');
  assert.equal(
    source.includes('participantInfo'),
    true,
    'createOrGetConversation 没有按参与者分别存显示信息，发布者会看到自己的名字'
  );
});

test('markConversationRead rewrites unreadMap instead of using a dot path', () => {
  const source = readCloudFunction('markConversationRead');
  assert.equal(
    source.includes('[`unreadMap.'),
    false,
    'markConversationRead 又用回了点路径更新，键名异常时会静默失效，红点消不掉'
  );
  assert.equal(
    source.includes('unreadMap[openid] = 0'),
    true,
    'markConversationRead 没有把当前用户未读清零'
  );
});

test('markConversationRead returns the fresh total so the badge can update immediately', () => {
  const source = readCloudFunction('markConversationRead');
  assert.equal(
    source.includes('unreadCount'),
    true,
    'markConversationRead 没有返回新的总未读数，前端只能再查一次或干脆不更新'
  );
});

test('chat page refreshes the tabBar badge after marking messages read', () => {
  const chatJs = fs.readFileSync(
    path.join(ROOT, 'miniprogram', 'pages', 'message', 'chat.js'),
    'utf8'
  );
  assert.equal(
    chatJs.includes('applyUnreadCount'),
    true,
    '聊天页标记已读后没有同步 tabBar 角标，看完消息红点还是原数字'
  );
});

// 「取消拉黑」曾经依赖两个前置条件：getBlockList 云函数已部署、
// 以及从会话列表带过来的 peerOpenid。任缺一个按钮就不出现，
// 表现就是「取消拉黑没做」。现在改为由 getMessageList 一并返回状态。
test('getMessageList returns the block state so the chat page is self-contained', () => {
  const source = readCloudFunction('getMessageList');
  ['blockedByMe', 'blockedByPeer', 'blocked'].forEach((field) => {
    assert.equal(
      source.includes(field),
      true,
      `getMessageList 没有返回 ${field}，聊天页只能靠 URL 参数猜拉黑方向`
    );
  });
  assert.equal(
    source.includes('peer'),
    true,
    'getMessageList 没有返回对方信息，聊天页顶部只能显示占位文字'
  );
});

test('chat page does not depend on getBlockList to decide the unblock button', () => {
  const chatJs = fs.readFileSync(
    path.join(ROOT, 'miniprogram', 'pages', 'message', 'chat.js'),
    'utf8'
  );
  assert.equal(
    chatJs.includes('getBlockRelations'),
    false,
    '聊天页又用回了 getBlockList 查拉黑方向，少部署一个云函数按钮就消失'
  );
  assert.equal(
    chatJs.includes('getChatState'),
    true,
    '聊天页没有从 getMessageList 的返回值里取拉黑状态'
  );
});

test('blockUser records who blocked on the conversation', () => {
  const source = readCloudFunction('blockUser');
  assert.equal(
    source.includes('blockedBy'),
    true,
    'blockUser 没有在会话上记录 blockedBy，聊天页分不清是谁拉黑的'
  );
});

test('unblockUser clears the blockedBy marker', () => {
  const source = readCloudFunction('unblockUser');
  assert.equal(
    source.includes("blockedBy: ''"),
    true,
    'unblockUser 没有清掉 blockedBy，取消拉黑后聊天页仍显示被拉黑'
  );
});
