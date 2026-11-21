const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

// 版本号写进返回值：部署后可在 Console 里确认云端跑的是不是新代码
const VERSION = '2026-11-21.1';
const MAX_CONTENT_LENGTH = 60;

function fail(code, message) {
  return { ok: false, code, message, version: VERSION };
}

exports.main = async (event = {}) => {
  const openid = cloud.getWXContext().OPENID;
  const orderId = event.orderId || '';
  const content = String(event.content || '').trim();

  if (!orderId) return fail('ORDER_REQUIRED', '请选择要感谢的订单。');
  if (!content) return fail('CONTENT_REQUIRED', '请写一句感谢的话。');
  if (content.length > MAX_CONTENT_LENGTH) {
    return fail('CONTENT_TOO_LONG', `感谢内容不超过 ${MAX_CONTENT_LENGTH} 字。`);
  }

  let order = null;
  try {
    const orderRes = await db.collection('orders').doc(orderId).get();
    order = orderRes.data;
  } catch (error) {
    order = null;
  }
  if (!order) return fail('ORDER_NOT_FOUND', '订单不存在。');
  if (order.status !== 'completed') return fail('ORDER_NOT_COMPLETED', '只有已完成的互助才能写感谢。');
  if (order.publisherOpenid !== openid) return fail('ONLY_PUBLISHER', '只有被帮助的一方可以写感谢。');

  const [takerRes, publisherRes] = await Promise.all([
    order.takerOpenid
      ? db.collection('users').where({ openid: order.takerOpenid }).limit(1).get()
      : Promise.resolve({ data: [] }),
    db.collection('users').where({ openid }).limit(1).get()
  ]);
  const taker = takerRes.data[0] || {};
  const publisher = publisherRes.data[0] || {};

  // 一单一感谢：确认完成时已经自动生成过一条，这里直接更新内容，
  // 避免同一笔互助在感谢墙上出现两条。
  const existing = await db.collection('thank_wall').where({ orderId }).limit(1).get();
  if (existing.data.length) {
    await db.collection('thank_wall').doc(existing.data[0]._id).update({
      data: {
        content,
        updatedAt: db.serverDate()
      }
    });
    return { ok: true, updated: true, thankId: existing.data[0]._id, version: VERSION };
  }

  const result = await db.collection('thank_wall').add({
    data: {
      fromOpenid: openid,
      fromName: publisher.nickname || '匿名旅客',
      toOpenid: order.takerOpenid || '',
      toName: taker.nickname || '匿名旅客',
      content,
      orderId,
      createdAt: db.serverDate()
    }
  });

  return { ok: true, updated: false, thankId: result._id, version: VERSION };
};
