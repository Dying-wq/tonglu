'use strict';

// 从会话记录里尽可能找出「对方」的 openid。
//
// 背景：单账号自测时，用户对自己的帖子点「联系发布人」，
// createOrGetConversation 会用 Set([publisherOpenid, openid]) 建会话，
// 两个值相同 → participantIds 只有一个人。早期版本只从 participantIds 里
// find(id => id !== openid)，推不出对方，取消拉黑就直接报
// 「无法确定要取消拉黑的用户。」
//
// 这里把会话里所有可能记录对方身份的字段都作为线索，
// 返回空字符串表示「会话里确实只有自己」，由调用方决定恢复脏状态还是报错。
function resolveTargetOpenid(options = {}) {
  const {
    conversation = {},
    openid = '',
    hint = '',
    messages = [],
    blocks = []
  } = options;

  const ids = [];
  const push = (value) => {
    if (typeof value === 'string' && value && value !== openid) ids.push(value);
  };
  const pushAll = (list) => {
    if (Array.isArray(list)) list.forEach(push);
  };

  // 1. 会话参与者（最权威）
  pushAll(conversation.participantIds);
  pushAll(conversation.participantOpenids);
  pushAll(Object.keys(conversation.participantInfo || {}));
  pushAll(Object.keys(conversation.unreadMap || {}));

  // 2. 会话上其它记录对方身份的字段
  push(conversation.peerOpenid);
  push(conversation.targetOpenid);
  push(conversation.publisherOpenid);
  push(conversation.blockedBy);

  // 3. 历史消息里的收/发件人（会话字段被改坏时兜底）
  (Array.isArray(messages) ? messages : []).forEach((message) => {
    push(message.senderId);
    push(message.senderOpenid);
    push(message.receiverId);
    push(message.receiverOpenid);
  });

  // 4. 拉黑记录：我拉黑的 → 取 target；拉黑我的 → 取 blocker
  (Array.isArray(blocks) ? blocks : []).forEach((record) => {
    const blocker = record.blockerId || record.blockerOpenid;
    const target = record.targetId || record.targetOpenid;
    if (blocker === openid) push(target);
    if (target === openid) push(blocker);
  });

  const unique = Array.from(new Set(ids));

  // 前端传来的 peerOpenid 只作为「优先选谁」的提示。
  // 必须是服务端记录里出现过的 id，否则不接受，防止前端传错解除错人。
  if (hint && unique.includes(hint)) return hint;
  return unique[0] || '';
}

module.exports = { resolveTargetOpenid };
