const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event = {}) => {
  const openid = cloud.getWXContext().OPENID;
  const channels = event.channels || [];
  const auth = event.auth || {};
  const settings = event.settings || {};
  await db.collection('subscribe_records').add({
    data: {
      openid,
      channels,
      auth,
      scene: event.scene || 'manual',
      createdAt: db.serverDate()
    }
  });

  const existing = await db.collection('notification_settings').where({ openid }).limit(1).get();
  const data = {
    openid,
    ...settings,
    subscribeAuth: auth,
    updatedAt: db.serverDate()
  };
  if (existing.data.length) {
    await db.collection('notification_settings').doc(existing.data[0]._id).update({ data });
    return { ok: true, action: 'updateSubscribeAuth', settingsId: existing.data[0]._id };
  }

  const result = await db.collection('notification_settings').add({
    data: {
      chat: true,
      order: true,
      activity: true,
      lost: true,
      hot: true,
      system: true,
      createdAt: db.serverDate(),
      ...data
    }
  });
  return { ok: true, action: 'createSubscribeAuth', settingsId: result._id };
};
