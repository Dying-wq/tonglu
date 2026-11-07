const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

// 取对方资料：优先 users 表（最新），其次建会话时存的 participantInfo。
// 不能用会话上的 peerName —— 那是老字段，存的是发布者昵称，
// 发布者本人打开会话会看到自己的名字。
async function resolvePeer(conversation, peerOpenid) {
  if (!peerOpenid) {
    return { openid: '', name: '同车旅客', avatarText: '旅', avatarUrl: '', rankName: '青铜' };
  }
  const stored = (conversation.participantInfo && conversation.participantInfo[peerOpenid]) || {};
  let profile = {};
  try {
    const res = await db.collection('users').where({ openid: peerOpenid }).limit(1).get();
    profile = (res.data && res.data[0]) || {};
  } catch (error) {
    // 查不到就用会话里存的信息兜底
  }
  const name = profile.nickname || stored.name || '同车旅客';
  return {
    openid: peerOpenid,
    name,
    avatarText: profile.avatarText || stored.avatarText || name.slice(0, 1),
    avatarUrl: profile.avatarUrl || stored.avatarUrl || '',
    rankName: profile.creditLevelName || stored.rankName || '青铜'
  };
}

exports.main = async (event = {}) => {
  const conversationId = event.conversationId || '';
  if (!conversationId) {
    return { ok: false, code: 'CONVERSATION_REQUIRED', message: '缺少会话 ID。' };
  }

  const openid = cloud.getWXContext().OPENID;

  let conversation = {};
  try {
    const doc = await db.collection('conversations').doc(conversationId).get();
    conversation = doc.data || {};
  } catch (error) {
    return { ok: false, code: 'CONVERSATION_NOT_FOUND', message: '会话不存在或无权访问。' };
  }

  const participantIds = conversation.participantIds || conversation.participantOpenids || [];
  if (!participantIds.includes(openid)) {
    return { ok: false, code: 'NOT_PARTICIPANT', message: '你不是该会话成员。' };
  }

  const peerOpenid = participantIds.find((id) => id !== openid) || '';
  const peer = await resolvePeer(conversation, peerOpenid);

  // 拉黑状态由服务端算好，前端直接拿来渲染。
  // 之前是前端再调一个 getBlockList 云函数、再拿 URL 里的 peerOpenid 比对，
  // 少了任何一环按钮就不出现——用户看到的就是「取消拉黑没做」。
  let blocked = conversation.status === 'blocked';
  let blockedBy = conversation.blockedBy || '';

  // 会话状态可能是脏的：早期版本只改 status 不写 blocks，
  // 或者 blocks 里还有记录但 status 被改回了 active。
  // 只要状态不明确（没被标记拉黑、或不知道是谁拉黑的）就以 blocks 为准再查一次。
  const needBlockCheck = Boolean(peerOpenid) && (!blocked || !blockedBy);
  if (needBlockCheck) {
    try {
      const blockRes = await db.collection('blocks')
        .where(_.or([
          { blockerId: openid, targetId: peerOpenid, status: 'active' },
          { blockerId: peerOpenid, targetId: openid, status: 'active' }
        ]))
        .limit(1)
        .get();
      const record = (blockRes.data && blockRes.data[0]) || null;
      if (record) {
        blocked = true;
        blockedBy = record.blockerId || record.blockerOpenid || blockedBy;
      }
    } catch (error) {
      // blocks 集合不可读时只能依赖会话状态，不让它把整个会话拖垮
    }
  }

  // blockedBy 为空时按「我拉黑的」处理：按钮一定要出得来，
  // 点下去由 unblockUser 给出准确结论（NO_ACTIVE_BLOCK 会告诉用户是对方拉黑的）。
  const blockedByMe = blocked && (!blockedBy || blockedBy === openid);
  const blockedByPeer = blocked && Boolean(blockedBy) && blockedBy !== openid;

  const res = await db.collection('messages')
    .where({ conversationId })
    .orderBy('createdAt', 'asc')
    .limit(100)
    .get();

  return {
    ok: true,
    conversationId,
    version: '2026-11-07.1',
    participantCount: participantIds.length,
    // 单账号自测时会话里只有自己，页面会显示默认的「同车旅客 / 旅」，
    // 此时拉黑/取消拉黑没有真实对象，明确提示避免误判为功能坏了。
    selfOnly: !peerOpenid,
    peer,
    peerOpenid,
    blocked,
    blockedBy,
    blockedByMe,
    blockedByPeer,
    messages: (res.data || []).map((item) => ({
      id: item._id,
      sender: item.senderId === openid || item.senderOpenid === openid ? 'me' : 'other',
      senderId: item.senderId || item.senderOpenid,
      receiverId: item.receiverId,
      contentType: item.contentType || item.type || 'text',
      content: item.content,
      isRead: Boolean(item.isRead || item.read),
      riskStatus: item.riskStatus || 'safe',
      createdAt: item.createdAt
    }))
  };
};
