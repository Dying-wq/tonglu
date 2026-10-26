const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

// 历史绑定最多保留 20 条，避免单文档无限增长
const HISTORY_LIMIT = 20;

exports.main = async (event = {}) => {
  const { trainNo, carriageNo, seatNo, arrivalTs, remainingRatio } = event;

  if (!trainNo || !carriageNo) {
    return {
      ok: false,
      code: 'INVALID_BINDING',
      message: '车次绑定需要 trainNo 和 carriageNo。'
    };
  }

  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const now = Date.now();

  // 修复「修改绑定会丢失历史」：先把旧绑定归档进 trainBindingHistory
  // （后续做行程记录 / 同车互助统计需要用到历史车次）
  const userRes = await db.collection('users').where({ openid }).get();
  const previous = userRes.data && userRes.data[0] ? userRes.data[0].trainBinding : null;

  const binding = {
    trainNo: String(trainNo).toUpperCase(),
    carriageNo: String(carriageNo),
    seatNo: seatNo ? String(seatNo) : '',
    boundAt: now,
    arrivalTs: arrivalTs || now + 3 * 60 * 60 * 1000,
    remainingRatio: remainingRatio || 1.0
  };

  const updateData = {
    // 使用 _.set 强制整体替换：默认的 update 对嵌套对象是"合并"语义，
    // 会把对象拆成 trainBinding.xxx 逐字段写入，当原值为 null 时会报
    // "Cannot create field 'xxx' in element {trainBinding: null}"
    trainBinding: _.set(binding),
    updatedAt: db.serverDate()
  };

  if (previous && previous.trainNo) {
    updateData.trainBindingHistory = _.push({
      each: [{
        ...previous,
        endedAt: now,
        endReason: 'rebind'
      }],
      slice: -HISTORY_LIMIT
    });
  }

  // 更新用户的绑定信息
  await db.collection('users').where({ openid }).update({ data: updateData });

  return {
    ok: true,
    action: 'bindTrain',
    binding,
    archivedPrevious: Boolean(previous && previous.trainNo)
  };
};
