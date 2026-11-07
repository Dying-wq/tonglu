const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseDateValue,
  formatMessageTime,
  formatTime
} = require('../miniprogram/utils/cloud-api');

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

test('parseDateValue accepts Date objects, timestamps and ISO strings', () => {
  const now = new Date(2026, 10, 6, 12, 0, 0);
  const expected = now.getTime();

  assert.equal(parseDateValue(now), expected);
  assert.equal(parseDateValue(expected), expected);
  assert.equal(parseDateValue('2026-11-06T12:00:00'), expected);
  assert.equal(parseDateValue('2026-11-06T04:00:00.000Z'), expected);
});

test('parseDateValue falls back for space-separated local strings', () => {
  // iOS JavaScriptCore 的 Date.parse 不认「YYYY-MM-DD HH:mm:ss」，
  // 旧实现会直接得到 NaN，界面显示「NaN 天前」
  const expected = new Date(2026, 10, 6, 15, 30, 0).getTime();
  assert.equal(parseDateValue('2026-11-06 15:30:00'), expected);
});

test('parseDateValue handles serialized serverDate objects', () => {
  const expected = new Date(2026, 10, 6, 9, 5, 0).getTime();
  assert.equal(parseDateValue({ $date: expected }), expected);
  assert.equal(parseDateValue({ T: expected }), expected);
});

test('parseDateValue returns null for unusable values', () => {
  assert.equal(parseDateValue(null), null);
  assert.equal(parseDateValue(''), null);
  assert.equal(parseDateValue('not a date'), null);
  assert.equal(parseDateValue({ random: 1 }), null);
  assert.equal(parseDateValue(Number.NaN), null);
});

test('formatTime never renders NaN', () => {
  // 旧实现：Date.parse(对象) → NaN → Math.floor(NaN) → 「NaN 天前」
  assert.equal(formatTime({ $date: Date.now() }), '刚刚');
  assert.equal(formatTime(new Date(Date.now() - 2 * HOUR_MS)), '2 小时前');
  assert.equal(formatTime(Date.now() - 2 * DAY_MS), '2 天前');
  assert.equal(formatTime(new Date(Date.now() - 5 * DAY_MS)), '5 天前');
});

test('formatMessageTime renders same-day and cross-day formats', () => {
  const now = new Date();
  const sameDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 5, 0);

  assert.equal(formatMessageTime(sameDay), '09:05');

  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 20, 8, 30, 0);
  const pad = (n) => String(n).padStart(2, '0');
  assert.equal(
    formatMessageTime(lastMonth),
    `${pad(lastMonth.getMonth() + 1)}-${pad(lastMonth.getDate())} 08:30`
  );

  // 无法解析的时间不再显示乱码，而是留空
  assert.equal(formatMessageTime('not a date'), '');
});
