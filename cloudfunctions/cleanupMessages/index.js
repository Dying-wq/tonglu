const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

// 报告书要求：私信内容仅保留 7 天，过期后自动清理
const RETENTION_DAYS = 7;

exports.main = async () => {
  const deadline = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const result = await db.collection('messages')
    .where({ createdAt: _.lt(deadline) })
    .remove();

  const removed = result && result.stats ? result.stats.removed : 0;
  console.log(`消息清理完成：删除 ${removed} 条，截止 ${deadline.toISOString()}`);

  return {
    ok: true,
    action: 'cleanupMessages',
    removed,
    deadline: deadline.toISOString()
  };
};
