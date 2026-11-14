const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

// 只读公开资料：只返回「判断对方靠不靠谱」需要的字段，
// 绝不返回微信号、签名、私信内容、历史发帖等隐私信息。
exports.main = async (event = {}) => {
  const viewerOpenid = cloud.getWXContext().OPENID || '';
  const targetOpenid = event.targetOpenid || '';

  if (!targetOpenid) {
    return { ok: false, code: 'TARGET_REQUIRED', message: '缺少要查看的用户 openid。' };
  }

  // 看自己的主页不走这个接口，前端直接拦截
  if (targetOpenid === viewerOpenid) {
    return { ok: true, isSelf: true, openid: viewerOpenid };
  }

  const userRes = await db.collection('users').where({ openid: targetOpenid }).limit(1).get();
  const target = userRes.data[0] || null;
  if (!target) {
    return { ok: false, code: 'USER_NOT_FOUND', message: '该用户不存在或已注销。' };
  }

  // 拉黑双向状态：决定页面上「发消息 / 拉黑」按钮的可用性。
  // 没有登录态（云端测试）时查不了，一律按未拉黑处理。
  let blockedByMe = false;
  let blockedByThem = false;
  if (viewerOpenid) {
    const [blockedByMeRes, blockedByThemRes] = await Promise.all([
      db.collection('blocks').where({ blockerId: viewerOpenid, targetId: targetOpenid, status: 'active' }).limit(1).get(),
      db.collection('blocks').where({ blockerId: targetOpenid, targetId: viewerOpenid, status: 'active' }).limit(1).get()
    ]);
    blockedByMe = blockedByMeRes.data.length > 0;
    blockedByThem = blockedByThemRes.data.length > 0;
  }

  // 同车次判断：只有双方都在车上、车次号一致才显示车次。
  // 没有登录态时跳过，sameTrain 按 false 返回。
  let sameTrain = false;
  let targetTrainNo = '';
  if (viewerOpenid) {
    const viewerRes = await db.collection('users').where({ openid: viewerOpenid }).limit(1).get();
    const viewer = viewerRes.data[0] || {};
    const viewerTrain = viewer.trainBinding || {};
    const targetTrain = target.trainBinding || {};
    const now = Date.now();
    const viewerOnTrain = viewerTrain.trainNo && Number(viewerTrain.arrivalTs) > now;
    const targetOnTrain = targetTrain.trainNo && Number(targetTrain.arrivalTs) > now;
    sameTrain = Boolean(viewerOnTrain && targetOnTrain && viewerTrain.trainNo === targetTrain.trainNo);
    targetTrainNo = sameTrain ? targetTrain.trainNo : '';
  }

  return {
    ok: true,
    openid: targetOpenid,
    isSelf: false,
    nickname: target.nickname || '匿名旅客',
    avatarUrl: target.avatarUrl || '',
    avatarText: target.avatarText || (target.nickname || '匿').slice(0, 1),
    creditScore: Number(target.creditScore) || 0,
    creditLevelName: target.creditLevelName || '普通旅客',
    helpCount: Number(target.helpCount) || 0,
    thankCount: Number(target.thankCount) || 0,
    monthlyCompletedCount: Number(target.monthlyCompletedCount) || 0,
    createdAt: target.createdAt || null,
    sameTrain,
    targetTrainNo,
    blockedByMe,
    blockedByThem
  };
};
//（注：内容由AI生成）
