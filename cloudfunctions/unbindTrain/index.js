const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

// 历史绑定最多保留 20 条
const HISTORY_LIMIT = 20;

exports.main = async () => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const now = Date.now();

  // 解绑前把当前绑定归档，保证「行程记录」不因解绑而丢失
  const userRes = await db.collection('users').where({ openid }).get();
  const current = userRes.data && userRes.data[0] ? userRes.data[0].trainBinding : null;

  const updateData = {
    // 使用 _.remove() 删除字段，而不是置为 null。
    // 若置为 null，后续 bindTrain 往嵌套对象写入时会报
    // "Cannot create field 'xxx' in element {trainBinding: null}"
    trainBinding: _.remove(),
    updatedAt: db.serverDate()
  };

  if (current && current.trainNo) {
    updateData.trainBindingHistory = _.push({
      each: [{
        ...current,
        endedAt: now,
        endReason: 'unbind'
      }],
      slice: -HISTORY_LIMIT
    });
  }

  await db.collection('users').where({ openid }).update({ data: updateData });

  return {
    ok: true,
    action: 'unbindTrain',
    archivedPrevious: Boolean(current && current.trainNo)
  };
};
