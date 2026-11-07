const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const { MAX_LENGTH, validateComment, normalizeContent, findRiskWords } = require(
  path.join(ROOT, 'cloudfunctions', 'comments', 'content.js')
);

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

test('空评论和纯空格都被拦住', () => {
  assert.equal(validateComment('').ok, false);
  assert.equal(validateComment('   ').ok, false);
  assert.equal(validateComment(null).ok, false);
  assert.equal(validateComment('').code, 'EMPTY_COMMENT');
});

test('正常评论会去掉首尾空白', () => {
  const result = validateComment('  我在3号车厢，可以帮你  ');
  assert.equal(result.ok, true);
  assert.equal(result.content, '我在3号车厢，可以帮你');
});

test('超长评论被拦住', () => {
  const result = validateComment('好'.repeat(MAX_LENGTH + 1));
  assert.equal(result.ok, false);
  assert.equal(result.code, 'COMMENT_TOO_LONG');
});

test('评论里的金钱交易/诈骗词会被拦住', () => {
  const result = validateComment('加微信付款，先付押金');
  assert.equal(result.ok, false);
  assert.equal(result.code, 'RISK_CONTENT');
  assert.ok(result.riskKeywords.length > 0);
  assert.equal(normalizeContent('  hi  '), 'hi');
  assert.ok(findRiskWords('转账给我').includes('转账'));
});

test('评论云函数文件齐全且声明了 wx-server-sdk', () => {
  ['index.js', 'content.js', 'package.json'].forEach((name) => {
    assert.equal(
      fs.existsSync(path.join(ROOT, 'cloudfunctions', 'comments', name)),
      true,
      `缺少 cloudfunctions/comments/${name}`
    );
  });
  const pkg = JSON.parse(read('cloudfunctions/comments/package.json'));
  assert.equal(Boolean(pkg.dependencies['wx-server-sdk']), true);
  const source = read('cloudfunctions/comments/index.js');
  assert.equal(source.includes('exports.main'), true);
  assert.equal(source.includes("collection('comments')"), true);
  // 作者身份必须取服务端上下文，不能信任前端传来的 openid
  assert.equal(source.includes('cloud.getWXContext().OPENID'), true);
  assert.equal(source.includes('event.authorOpenid'), false);
  assert.equal(source.includes('status: \'removed\''), true, '删除应该是软删除而不是物理删除');
});

test('前端通过云函数访问评论，不直查 comments 集合', () => {
  const api = read('miniprogram/utils/cloud-api.js');
  ['getComments', 'addComment', 'removeComment'].forEach((name) => {
    assert.equal(api.includes(`async function ${name}`), true, `缺少 ${name}`);
    assert.equal(api.includes(`${name},`), true, `${name} 未导出`);
  });
  assert.equal(api.includes("callFunction('comments'"), true);
  assert.equal(api.includes("collection('comments')"), false, '前端不应直查 comments 集合');
});

test('帖子详情页有评论列表、输入框与发布按钮', () => {
  const wxml = read('miniprogram/pages/service-detail/service-detail.wxml');
  const js = read('miniprogram/pages/service-detail/service-detail.js');
  assert.equal(wxml.includes('bindtap="submitComment"'), true);
  assert.equal(wxml.includes('bindinput="onCommentInput"'), true);
  assert.equal(wxml.includes('catchtap="removeComment"'), true);
  assert.equal(js.includes('loadComments('), true);
  assert.equal(js.includes('isActionOk(result)'), true, '评论发布没有判定 result.ok');
});

test('文档说明了 comments 集合属于现有云环境', () => {
  const doc = read('docs/01-数据库集合配置清单.md');
  assert.equal(doc.includes('comments'), true);
  assert.equal(doc.includes('17'), true, '集合总数应更新为 17');
});
