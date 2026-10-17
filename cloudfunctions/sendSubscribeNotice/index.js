const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

const EVENT_CHANNEL_MAP = {
  first_contact: 'chat',
  secondhand_consult: 'chat',
  lost_claim: 'lost',
  order_taken: 'order',
  ball_joined: 'activity',
  ball_starting: 'activity',
  hot_success: 'hot',
  hot_ending: 'hot',
  report_result: 'system'
};

exports.main = async (event = {}) => {
  const eventType = event.eventType || '';
  const channel = EVENT_CHANNEL_MAP[eventType];
  if (!channel || !event.targetOpenid) {
    return { ok: false, code: 'NOTICE_NOT_ALLOWED', message: '该事件不发送订阅通知。' };
  }

  const settingsRes = await db.collection('notification_settings').where({ openid: event.targetOpenid }).limit(1).get();
  const settings = settingsRes.data[0] || {};
  const authorized = settings.subscribeAuth && settings.subscribeAuth[channel];
  if (!settings[channel] || !authorized) {
    await db.collection('notification_logs').add({
      data: {
        eventType,
        targetOpenid: event.targetOpenid,
        channel,
        status: 'skipped',
        reason: 'disabled_or_unauthorized',
        createdAt: db.serverDate()
      }
    });
    return { ok: true, skipped: true, reason: 'disabled_or_unauthorized' };
  }

  const templateId = event.templateId || process.env[`TEMPLATE_${channel.toUpperCase()}`] || '';
  if (!templateId) {
    return { ok: false, code: 'TEMPLATE_REQUIRED', message: '缺少订阅消息模板 ID。' };
  }

  const page = event.page || '/pages/message/index';
  const data = event.data || {
    thing1: { value: event.title || '成理生活服务通知' },
    thing2: { value: event.content || '你有新的服务进展' }
  };

  try {
    const sendResult = await cloud.openapi.subscribeMessage.send({
      touser: event.targetOpenid,
      templateId,
      page,
      data,
      miniprogramState: 'developer'
    });
    await db.collection('notification_logs').add({
      data: {
        eventType,
        targetOpenid: event.targetOpenid,
        channel,
        templateId,
        page,
        status: 'sent',
        result: sendResult,
        createdAt: db.serverDate()
      }
    });
    return { ok: true, sendResult };
  } catch (error) {
    await db.collection('notification_logs').add({
      data: {
        eventType,
        targetOpenid: event.targetOpenid,
        channel,
        templateId,
        page,
        status: 'failed',
        error: error.message || error.errMsg || String(error),
        createdAt: db.serverDate()
      }
    });
    return { ok: false, code: 'SEND_FAILED', message: error.message || error.errMsg || '发送失败' };
  }
};
