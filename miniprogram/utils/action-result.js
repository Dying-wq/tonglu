'use strict';

// 云端操作结果的统一判定。
//
// 之前发帖和「我来帮」都只判断「有没有抛异常」，不看 result.ok：
// 云函数返回 { ok:false, message:'信用分不足' } 时，页面照样弹成功提示、
// 照样 navigateTo，用户看到的是一个空订单页。所有会跳转到详情页的操作
// 都必须先过这里，避免「假成功」再次出现。
function isActionOk(result) {
  return Boolean(result && result.ok === true);
}

function actionFailure(result, fallback) {
  const message = result && typeof result.message === 'string' ? result.message.trim() : '';
  return message || fallback || '操作未成功，请稍后重试。';
}

// 只有云端明确返回 ok:true 且带 orderId，才生成订单详情页地址。
// 失败或缺少订单号时返回空字符串，调用方必须据此中止跳转。
function orderDetailUrl(result) {
  if (!isActionOk(result)) return '';
  const orderId = result.orderId || '';
  if (!orderId) return '';
  const conversationId = result.conversationId || '';
  return '/pages/order-detail/order-detail?orderId='
    + encodeURIComponent(orderId)
    + '&conversationId=' + encodeURIComponent(conversationId);
}

module.exports = { isActionOk, actionFailure, orderDetailUrl };
