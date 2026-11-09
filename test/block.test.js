const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const CLOUD_API = path.join(ROOT, 'miniprogram', 'utils', 'cloud-api.js');
const CLOUD_FUNCTIONS = path.join(ROOT, 'cloudfunctions');

function readCloudFunction(name) {
  return fs.readFileSync(path.join(CLOUD_FUNCTIONS, name, 'index.js'), 'utf8');
}

// 拉黑 / 取消拉黑这一组功能的四条约束。
// 它们每一条都对应一个真实踩过的坑，用静态检查守住，避免以后重构时被改回去。

test('cloud-api exports the unblock helpers used by the chat page', () => {
  const source = fs.readFileSync(CLOUD_API, 'utf8');
  const exportBlock = source.slice(source.lastIndexOf('module.exports'));
  ['unblockUser', 'getBlockList', 'getBlockRelations', 'blockUser'].forEach((name) => {
    assert.equal(
      exportBlock.includes(`${name},`) || exportBlock.includes(`${name}\n`),
      true,
      `cloud-api 未导出 ${name}`
    );
  });
});

test('getPosts excludes posts from blocked users at query level', () => {
  const source = fs.readFileSync(CLOUD_API, 'utf8');
  const start = source.indexOf('async function getPosts');
  const body = source.slice(start, source.indexOf('async function getPostById'));

  // 拉黑名单必须参与首页过滤
  assert.equal(body.includes('getBlockList'), true, 'getPosts 没有读取拉黑名单');
  // 必须在数据库查询层排除，而不是取回 20 条再在 JS 里筛，
  // 否则一页会只剩十几条，出现「翻不到底」的错觉。
  // 允许 db.command.nin 与 const cmd = db.command 后简写的 cmd.nin 两种形式。
  const usesQueryLevelNin = body.includes('cmd.nin(hiddenOpenids)')
    || body.includes('db.command.nin(hiddenOpenids)');
  assert.equal(usesQueryLevelNin, true, 'getPosts 未在查询层排除被拉黑用户');
});

test('getConversationList keeps blocked conversations so unblock stays reachable', () => {
  const source = readCloudFunction('getConversationList');
  // 曾经这里用 status: _.neq('blocked') 过滤，导致拉黑后会话从列表消失，
  // 用户再也点不进聊天页，也就无法取消拉黑
  assert.equal(
    source.includes("status: _.neq('blocked')"),
    false,
    'getConversationList 又过滤掉了已拉黑的会话，取消拉黑入口会失效'
  );
  assert.equal(source.includes('peerOpenid'), true, 'getConversationList 未返回对方 openid');
});

test('unblockUser reports NO_ACTIVE_BLOCK instead of faking success', () => {
  const source = readCloudFunction('unblockUser');
  assert.equal(
    source.includes('NO_ACTIVE_BLOCK'),
    true,
    'unblockUser 在一条记录都没更新时仍会返回成功，界面会误报「已取消拉黑」'
  );
});

test('sendMessage re-checks blocks so one-sided unblock cannot bypass the other side', () => {
  const source = readCloudFunction('sendMessage');
  assert.equal(
    source.includes("collection('blocks')"),
    true,
    'sendMessage 只依赖 conversations.status，互相拉黑后单方取消会绕过另一方的拉黑'
  );
});
