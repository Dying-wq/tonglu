// 弱网 / 断网下的发布兜底
//
// 背景：报告书 6.1.1「列车隧道、偏远路段网络差」的应对方案是——
// 发布失败时把内容暂存本地，网络恢复后自动重试，不让用户白写一遍。
// 这里把「暂存队列」的纯逻辑抽出来，方便单测；wx.storage 只做薄封装。

const PENDING_KEY = 'pendingPosts';
const MAX_PENDING = 10;              // 最多暂存 10 条，超出丢弃最旧的
const RETRY_INTERVAL_MS = 60 * 1000; // 同一条 60 秒内不重复重试

function nowTs() {
  return Date.now();
}

// 生成一条待发布记录
function createPendingPost(payload, createdAtTs = nowTs()) {
  const ts = Number(createdAtTs) || nowTs();
  return {
    id: `pending_${ts}_${Math.floor(Math.random() * 1000)}`,
    payload,
    createdAtTs: ts,
    retryCount: 0,
    lastRetryTs: 0
  };
}

// 入队：同 id 覆盖，超出上限丢最旧的
function pushPendingPost(list, item, limit = MAX_PENDING) {
  const queue = Array.isArray(list) ? list.slice() : [];
  if (!item || !item.id) return queue;

  const rest = queue.filter((entry) => entry.id !== item.id);
  rest.push(item);
  rest.sort((a, b) => (a.createdAtTs || 0) - (b.createdAtTs || 0));

  if (rest.length > limit) {
    return rest.slice(rest.length - limit);
  }
  return rest;
}

function removePendingPost(list, id) {
  const queue = Array.isArray(list) ? list : [];
  return queue.filter((entry) => entry.id !== id);
}

// 是否到了可以重试的时间（避免弱网时疯狂重试打爆云函数）
function canRetry(item, now = nowTs(), intervalMs = RETRY_INTERVAL_MS) {
  if (!item) return false;
  const last = Number(item.lastRetryTs) || 0;
  return (Number(now) || nowTs()) - last >= intervalMs;
}

// 依次重试队列：send 是异步发送函数，返回 true 表示成功
// 返回 { sent: [成功的条目], failed: [失败的条目] }
async function flushPendingPosts(list, send, now = nowTs()) {
  const queue = Array.isArray(list) ? list : [];
  const sent = [];
  const failed = [];

  for (let i = 0; i < queue.length; i += 1) {
    const item = queue[i];
    if (!canRetry(item, now)) {
      failed.push(item);
      continue;
    }

    try {
      // eslint-disable-next-line no-await-in-loop
      const ok = await send(item.payload, item);
      if (ok) {
        sent.push(item);
      } else {
        failed.push({ ...item, lastRetryTs: now, retryCount: (item.retryCount || 0) + 1 });
      }
    } catch (error) {
      failed.push({ ...item, lastRetryTs: now, retryCount: (item.retryCount || 0) + 1 });
    }
  }

  return { sent, failed };
}

// --------------------------------------------------------------------
// wx.storage 薄封装（小程序运行时才可用，单测不覆盖这一层）
// --------------------------------------------------------------------
function readPendingPosts() {
  try {
    const list = wx.getStorageSync(PENDING_KEY);
    return Array.isArray(list) ? list : [];
  } catch (error) {
    return [];
  }
}

function writePendingPosts(list) {
  try {
    wx.setStorageSync(PENDING_KEY, Array.isArray(list) ? list : []);
  } catch (error) {
    console.error('暂存发布失败：', error);
  }
}

function savePendingPost(payload, createdAtTs) {
  const next = pushPendingPost(readPendingPosts(), createPendingPost(payload, createdAtTs));
  writePendingPosts(next);
  return next;
}

function dropPendingPost(id) {
  const next = removePendingPost(readPendingPosts(), id);
  writePendingPosts(next);
  return next;
}

module.exports = {
  PENDING_KEY,
  MAX_PENDING,
  RETRY_INTERVAL_MS,
  createPendingPost,
  pushPendingPost,
  removePendingPost,
  canRetry,
  flushPendingPosts,
  readPendingPosts,
  writePendingPosts,
  savePendingPost,
  dropPendingPost
};
