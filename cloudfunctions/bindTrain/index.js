const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

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

  const binding = {
    trainNo: String(trainNo).toUpperCase(),
    carriageNo: String(carriageNo),
    seatNo: seatNo ? String(seatNo) : '',
    boundAt: Date.now(),
    arrivalTs: arrivalTs || Date.now() + 3 * 60 * 60 * 1000,
    remainingRatio: remainingRatio || 1.0
  };

  // 更新用户的绑定信息
  // 使用 _.set 强制整体替换：默认的 update 对嵌套对象是"合并"语义，
  // 会把对象拆成 trainBinding.xxx 逐字段写入，当原值为 null 时会报
  // "Cannot create field 'xxx' in element {trainBinding: null}"
  await db.collection('users').where({ openid }).update({
    data: {
      trainBinding: _.set(binding),
      updatedAt: db.serverDate()
    }
  });

  return {
    ok: true,
    action: 'bindTrain',
    binding
  };
};
