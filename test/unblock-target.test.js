const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const { resolveTargetOpenid } = require(path.join(ROOT, 'cloudfunctions', 'unblockUser', 'target.js'));

const ME = 'openid_me';
const PEER = 'openid_peer';

test('正常双账号会话：从 participantIds 推出对方', () => {
  const target = resolveTargetOpenid({
    conversation: { participantIds: [ME, PEER] },
    openid: ME
  });
  assert.equal(target, PEER);
});

test('前端提示 peerOpenid 有效时优先采用', () => {
  const target = resolveTargetOpenid({
    conversation: { participantIds: [ME, PEER, 'openid_third'] },
    openid: ME,
    hint: PEER
  });
  assert.equal(target, PEER);
});

test('前端提示是服务端记录里没有的 id 时拒绝，避免解除错人', () => {
  const target = resolveTargetOpenid({
    conversation: { participantIds: [ME, PEER] },
    openid: ME,
    hint: 'openid_forged'
  });
  assert.equal(target, PEER);
});

test('participantIds 只有自己时，participantInfo 仍能推出对方', () => {
  const target = resolveTargetOpenid({
    conversation: {
      participantIds: [ME],
      participantInfo: { [ME]: { name: '我' }, [PEER]: { name: '对方' } }
    },
    openid: ME
  });
  assert.equal(target, PEER);
});

test('blockedBy 指向对方时可以作为线索（对方拉黑我的场景）', () => {
  const target = resolveTargetOpenid({
    conversation: { participantIds: [ME], status: 'blocked', blockedBy: PEER },
    openid: ME
  });
  assert.equal(target, PEER);
});

test('会话字段缺失时从历史消息里找收/发件人', () => {
  const target = resolveTargetOpenid({
    conversation: { participantIds: [ME] },
    openid: ME,
    messages: [{ senderId: PEER, receiverId: ME, content: '你好' }]
  });
  assert.equal(target, PEER);
});

test('会话字段缺失时从 blocks 记录里找拉黑对象', () => {
  const target = resolveTargetOpenid({
    conversation: { participantIds: [ME] },
    openid: ME,
    blocks: [{ blockerId: ME, targetId: PEER, status: 'active' }]
  });
  assert.equal(target, PEER);
});

test('单账号自测会话（只有自己，且 blockedBy 是自己）推不出对方', () => {
  const target = resolveTargetOpenid({
    conversation: {
      participantIds: [ME],
      participantOpenids: [ME],
      participantInfo: { [ME]: { name: '我' } },
      status: 'blocked',
      blockedBy: ME
    },
    openid: ME
  });
  assert.equal(target, '');
});

test('unblockUser 对推不出对象的脏会话会恢复状态，而不是报 TARGET_REQUIRED', () => {
  const source = fs.readFileSync(path.join(ROOT, 'cloudfunctions', 'unblockUser', 'index.js'), 'utf8');
  assert.equal(source.includes('selfOnly: true'), true, '缺少单账号自测会话的恢复分支');
  assert.equal(source.includes("status: 'active'"), true, '恢复分支没有把会话状态改回 active');
  assert.equal(source.includes('resolveTargetOpenid'), true, '没有使用多来源推断');
  assert.equal(source.includes('NO_ACTIVE_BLOCK'), true, '必须保留对方拉黑我的判定');
});

test('blockUser 拒绝往 blocks 写空 targetId 的垃圾记录', () => {
  const source = fs.readFileSync(path.join(ROOT, 'cloudfunctions', 'blockUser', 'index.js'), 'utf8');
  const guard = source.indexOf('if (!targetOpenid)');
  const add = source.indexOf("collection('blocks').add");
  assert.ok(guard > -1 && add > -1 && guard < add, '必须在写库之前拦住空对象');
});

test('云函数返回值带 version，便于确认是否重新部署成功', () => {
  ['unblockUser', 'blockUser', 'getMessageList'].forEach((name) => {
    const source = fs.readFileSync(path.join(ROOT, 'cloudfunctions', name, 'index.js'), 'utf8');
    assert.equal(source.includes('version'), true, `${name} 返回值缺少 version`);
  });
});

test('聊天页会提示「自测会话」，并把 peerOpenid 作为提示传给云端', () => {
  const wxml = fs.readFileSync(path.join(ROOT, 'miniprogram', 'pages', 'message', 'chat.wxml'), 'utf8');
  const js = fs.readFileSync(path.join(ROOT, 'miniprogram', 'pages', 'message', 'chat.js'), 'utf8');
  assert.equal(wxml.includes('selfOnly'), true, '聊天页没有自测会话提示');
  assert.equal(js.includes('peerOpenid: this.data.peerOpenid'), true, '没有把对方 openid 传给云端');
});
