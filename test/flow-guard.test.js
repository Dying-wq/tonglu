const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const { isActionOk, actionFailure, orderDetailUrl } = require(
  path.join(ROOT, 'miniprogram', 'utils', 'action-result.js')
);

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

test('只有 ok:true 才算成功', () => {
  assert.equal(isActionOk({ ok: true }), true);
  assert.equal(isActionOk({ ok: false, message: '失败' }), false);
  assert.equal(isActionOk(null), false);
  assert.equal(isActionOk({}), false);
  assert.equal(isActionOk({ ok: 'true' }), false);
});

test('失败时优先展示云端给出的具体原因', () => {
  assert.equal(actionFailure({ ok: false, message: '信用分低于40分' }, '兜底'), '信用分低于40分');
  assert.equal(actionFailure({ ok: false }, '兜底文案'), '兜底文案');
  assert.equal(actionFailure(null, ''), '操作未成功，请稍后重试。');
});

test('失败或缺订单号时绝不生成订单页地址', () => {
  assert.equal(orderDetailUrl({ ok: false, orderId: 'order_1' }), '');
  assert.equal(orderDetailUrl({ ok: true }), '');
  assert.equal(orderDetailUrl({ ok: true, orderId: '' }), '');
  assert.equal(
    orderDetailUrl({ ok: true, orderId: 'order 1', conversationId: 'conv/2' }),
    '/pages/order-detail/order-detail?orderId=order%201&conversationId=conv%2F2'
  );
});

test('发帖失败不再提示「已保存，同车旅客可见」，也不再返回上一页', () => {
  const source = read('miniprogram/pages/publish/publish.js');
  assert.equal(source.includes("title: '已保存，同车旅客可见'"), false, '仍保留假成功提示');
  assert.equal(source.includes('isActionOk(result)'), true, '没有判定 result.ok');
  const guard = source.indexOf('if (!isActionOk(result))');
  const successToast = source.indexOf("title: '发布成功，同车旅客可见'");
  assert.ok(guard > -1 && successToast > guard, '成功提示必须在失败拦截之后');
  const auth = source.indexOf('this.requestPublishNoticeAuth()');
  const back = source.indexOf('wx.navigateBack()');
  assert.ok(auth > guard && back > guard, '失败时不能申请订阅授权或返回上一页');
});

test('「我来帮」失败时停在本页，不跳空订单页', () => {
  const source = read('miniprogram/pages/service-detail/service-detail.js');
  assert.equal(source.includes('orderDetailUrl(result)'), true, '没有用统一的结果判定生成跳转地址');
  const guard = source.indexOf('if (!url)');
  const navigate = source.indexOf('wx.navigateTo({ url });');
  assert.ok(guard > -1 && navigate > guard, '跳转必须在成功判定之后');
  assert.equal(source.includes("url: `/pages/order-detail/order-detail?orderId=${orderId}"), false,
    '仍在拼接可能为空的 orderId');
});

test('详情页不再用 mock-data 假帖子初始化，帖子详情/订单详情不再回退演示数据', () => {
  const detail = read('miniprogram/pages/service-detail/service-detail.js');
  assert.equal(detail.includes("require('../../utils/mock-data')"), true); // 分类名称仍复用
  assert.equal(detail.includes('posts.find'), false, 'onLoad 仍在用写死的演示帖子');
  const cloudApi = read('miniprogram/utils/cloud-api.js');
  const orderBody = cloudApi.slice(
    cloudApi.indexOf('async function getOrderById'),
    cloudApi.indexOf('async function getThankWall')
  );
  assert.equal(orderBody.includes('const fallback'), false, '订单详情仍在构造演示订单');
  assert.equal(orderBody.includes('return fallback'), false, '订单详情仍在回退演示订单');
  assert.equal(cloudApi.includes('return mockData.conversations'), false, '会话列表仍在回退演示会话');
});

test('app 启动即登录，订单页加载前确保拿到 openid', () => {
  assert.equal(read('miniprogram/app.js').includes('ensureLogin()'), true, '启动未登录');
  assert.equal(
    read('miniprogram/pages/order-detail/order-detail.js').includes('await ensureLogin()'),
    true,
    '订单详情没有先取 openid，发布者会看不到确认按钮'
  );
});

test('消息页与聊天页都提供订单确认入口', () => {
  const messageWxml = read('miniprogram/pages/message/index.wxml');
  assert.equal(messageWxml.includes('catchtap="goOrder"'), true);
  assert.equal(messageWxml.includes('data-order-id="{{item.orderId}}"'), true);
  assert.equal(messageWxml.includes('data-conversation-id="{{item.id}}"'), true);
  const messageJs = read('miniprogram/pages/message/index.js');
  assert.equal(messageJs.split('goOrder(event)').length - 1, 1, '消息页 goOrder 方法重复定义');
  assert.equal(read('miniprogram/pages/message/chat.wxml').includes('bindtap="goOrder"'), true);
  assert.equal(read('miniprogram/pages/message/chat.js').includes('goOrder()'), true);
});
