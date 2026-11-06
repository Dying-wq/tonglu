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

  // 老数据没有 blockedBy 字段，查一次 blocks 补上
  if (blocked && !blockedBy && peerOpenid) {
    try {
      const blockRes = await db.collection('blocks')
        .where(_.or([
          { blockerId: openid, targetId: peerOpenid, status: 'active' },
          { blockerId: peerOpenid, targetId: openid, status: 'active' }
        ]))
        .limit(1)
        .get();
      if (blockRes.data && blockRes.data.length) {
        blockedBy = blockRes.data[0].blockerId || blockRes.data[0].blockerOpenid || '';
      }
    } catch (error) {
      // blocks 集合不可读时保持 blockedBy 为空，下面会按「可能是我拉黑的」处理
    }
  }

  // 会话状态已恢复、但 blocks 里仍有对方拉黑我的记录（互相拉黑后单方取消）
  if (!blocked && peerOpenid) {
    try {
      const blockRes = await db.collection('blocks')
        .where({ blockerId: peerOpenid, targetId: openid, status: 'active' })
        .limit(1)
        .get();
      if (blockRes.data && blockRes.data.length) {
        blocked = true;
        blockedBy = peerOpenid;
      }
    } catch (error) {
      // 忽略
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
