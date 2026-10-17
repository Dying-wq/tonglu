const EVENT_CHANNEL_MAP = {
  first_contact: 'chat',
  secondhand_consult: 'chat',
  lost_claim: 'lost',
  order_taken: 'order',
  ball_joined: 'activity',
  ball_starting: 'activity',
  hot_success: 'hot',
  hot_ending: 'hot',
  report_result: 'system',
  chat_message: 'chat'
};

const KEY_SUBSCRIBE_EVENTS = [
  'first_contact',
  'secondhand_consult',
  'lost_claim',
  'order_taken',
  'ball_joined',
  'ball_starting',
  'hot_success',
  'hot_ending',
  'report_result'
];

function buildUnreadMapAfterMessage({ currentUnreadMap = {}, participantIds = [], senderId }) {
  return participantIds.reduce((map, userId) => {
    const current = Number(currentUnreadMap[userId]) || 0;
    map[userId] = userId === senderId ? current : current + 1;
    return map;
  }, {});
}

function clearUnreadForUser({ unreadMap = {}, userId }) {
  return {
    ...unreadMap,
    [userId]: 0
  };
}

function getTotalUnread(unreadMap = {}) {
  return Object.keys(unreadMap).reduce((sum, key) => sum + (Number(unreadMap[key]) || 0), 0);
}

function shouldSendSubscribeNotice({ eventType, settings = {}, auth = {} }) {
  if (!KEY_SUBSCRIBE_EVENTS.includes(eventType)) return false;
  const channel = EVENT_CHANNEL_MAP[eventType] || 'system';
  return Boolean(settings[channel] && auth[channel]);
}

module.exports = {
  EVENT_CHANNEL_MAP,
  KEY_SUBSCRIBE_EVENTS,
  buildUnreadMapAfterMessage,
  clearUnreadForUser,
  getTotalUnread,
  shouldSendSubscribeNotice
};
