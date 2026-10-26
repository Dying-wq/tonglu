const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MAX_PENDING,
  RETRY_INTERVAL_MS,
  createPendingPost,
  pushPendingPost,
  removePendingPost,
  canRetry,
  flushPendingPosts
} = require('../miniprogram/utils/draft');

// 报告书 6.1.1：隧道/偏远路段弱网时，发布内容先暂存本地，联网后自动补发

test('creates a pending post with retry bookkeeping', () => {
  const item = createPendingPost({ title: '借充电宝' }, 1000);

  assert.equal(item.payload.title, '借充电宝');
  assert.equal(item.createdAtTs, 1000);
  assert.equal(item.retryCount, 0);
  assert.equal(item.lastRetryTs, 0);
  assert.equal(typeof item.id, 'string');
});

test('keeps the queue ordered by creation time', () => {
  let queue = [];
  queue = pushPendingPost(queue, createPendingPost({ title: 'B' }, 2000));
  queue = pushPendingPost(queue, createPendingPost({ title: 'A' }, 1000));

  assert.deepEqual(queue.map((item) => item.payload.title), ['A', 'B']);
});

test('drops the oldest entry when the queue exceeds the limit', () => {
  let queue = [];
  for (let i = 0; i < MAX_PENDING + 3; i += 1) {
    queue = pushPendingPost(queue, createPendingPost({ title: `第${i}条` }, 1000 + i));
  }

  assert.equal(queue.length, MAX_PENDING);
  // 最旧的 3 条被丢弃
  assert.equal(queue[0].payload.title, '第3条');
  assert.equal(queue[queue.length - 1].payload.title, `第${MAX_PENDING + 2}条`);
});

test('removes a pending post by id', () => {
  const item = createPendingPost({ title: 'A' }, 1000);
  const queue = removePendingPost([item], item.id);

  assert.deepEqual(queue, []);
});

test('throttles retries within the retry interval', () => {
  const item = { id: 'p1', lastRetryTs: 0, payload: {} };
  const now = RETRY_INTERVAL_MS;

  assert.equal(canRetry(item, now), true);
  assert.equal(canRetry({ ...item, lastRetryTs: now }, now + RETRY_INTERVAL_MS - 1), false);
  assert.equal(canRetry({ ...item, lastRetryTs: now }, now + RETRY_INTERVAL_MS), true);
  assert.equal(canRetry(null, now), false);
});

test('flushes the queue and reports sent and failed entries', async () => {
  const now = RETRY_INTERVAL_MS;
  const okItem = { ...createPendingPost({ title: '成功' }, 1000), id: 'ok', lastRetryTs: 0 };
  const failItem = { ...createPendingPost({ title: '失败' }, 2000), id: 'fail', lastRetryTs: 0 };
  const throttled = { ...createPendingPost({ title: '刚试过' }, 3000), id: 'wait', lastRetryTs: now - 1000 };

  const result = await flushPendingPosts([okItem, failItem, throttled], async (payload) => {
    return payload.title === '成功';
  }, now);

  assert.deepEqual(result.sent.map((item) => item.id), ['ok']);
  assert.deepEqual(result.failed.map((item) => item.id), ['fail', 'wait']);
  // 失败的条目记录了本次重试时间与次数
  const failedItem = result.failed.find((item) => item.id === 'fail');
  assert.equal(failedItem.retryCount, 1);
  assert.equal(failedItem.lastRetryTs, now);
});

test('treats thrown errors as failures instead of crashing', async () => {
  const now = RETRY_INTERVAL_MS;
  const item = { ...createPendingPost({ title: '断网' }, 1000), id: 'boom', lastRetryTs: 0 };

  const result = await flushPendingPosts([item], async () => {
    throw new Error('no baseresponse');
  }, now);

  assert.deepEqual(result.sent, []);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0].retryCount, 1);
});
