const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

exports.main = async () => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  // 使用 _.remove() 删除字段，而不是置为 null。
  // 若置为 null，后续 bindTrain 往嵌套对象写入时会报
  // "Cannot create field 'xxx' in element {trainBinding: null}"
  await db.collection('users').where({ openid }).update({
    data: {
      trainBinding: _.remove(),
      updatedAt: db.serverDate()
    }
  });

  return {
    ok: true,
    action: 'unbindTrain'
  };
};
