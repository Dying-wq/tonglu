const { SUBSCRIBE_TEMPLATE_IDS } = require('../config');

const CHANNEL_LABELS = {
  chat: '回帖',
  order: '互助',
  activity: '话题',
  system: '系统'
};

function getTemplateIds(channels = []) {
  return channels.map((channel) => SUBSCRIBE_TEMPLATE_IDS[channel]).filter(Boolean);
}

function buildSubscribeAuth(channels = [], result = {}) {
  return channels.reduce((auth, channel) => {
    const templateId = SUBSCRIBE_TEMPLATE_IDS[channel];
    auth[channel] = templateId ? result[templateId] === 'accept' : false;
    return auth;
  }, {});
}

function requestSubscribe(channels = []) {
  const tmplIds = getTemplateIds(channels);
  if (!tmplIds.length || !wx.requestSubscribeMessage) {
    return Promise.resolve({
      ok: false,
      reason: 'NO_TEMPLATE_ID',
      auth: {}
    });
  }

  return new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds,
      success(res) {
        resolve({
          ok: true,
          auth: buildSubscribeAuth(channels, res),
          raw: res
        });
      },
      fail(error) {
        resolve({
          ok: false,
          reason: 'REQUEST_FAILED',
          error,
          auth: {}
        });
      }
    });
  });
}

module.exports = {
  CHANNEL_LABELS,
  buildSubscribeAuth,
  requestSubscribe
};
