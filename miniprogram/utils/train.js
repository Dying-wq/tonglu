// 车次行程时间工具
//
// 解决的问题：早期版本车次绑定写死「绑定后 3 小时到站」（train-binding.js 里的
// Date.now() + 3 * 60 * 60 * 1000），不管实际车程多长都按 3 小时失效，
// 长途车次会在半路被解绑，短途车次则到站了还显示「剩 1 小时」。
//
// 现在的策略（优先级从高到低）：
//   1. 用户手动填写的到达时间（最准，绑定页提供日期+时间选择）
//   2. 按车次首字母估算的行程时长（G/D 高铁、Z/T 直达特快、K 快速……）
//   3. 兜底 3 小时
// 估算值都会夹在 [30 分钟, 24 小时] 区间内，避免用户误填导致负数或超长绑定。

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

const MIN_DURATION_MS = 30 * MINUTE_MS;       // 最短按 30 分钟算
const MAX_DURATION_MS = 24 * HOUR_MS;         // 最长按 24 小时算
const DEFAULT_DURATION_MS = 3 * HOUR_MS;      // 无车次信息时的兜底

// 车次首字母 → 估算行程时长（小时）
// 说明：这是粗略经验值，只用于「用户没填到达时间」时给出一个合理默认值，
// 不替代真实时刻表；接入时刻表 API 后应优先使用真实数据。
const DURATION_HOURS_BY_PREFIX = {
  G: 4,   // 高铁
  D: 4,   // 动车
  C: 2.5, // 城际
  Z: 9,   // 直达特快
  T: 8,   // 特快
  K: 9,   // 快速
  Y: 6,   // 旅游列车
  S: 5,   // 市郊
  L: 5    // 临时旅客列车
};

function clampDuration(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_DURATION_MS;
  if (value < MIN_DURATION_MS) return MIN_DURATION_MS;
  if (value > MAX_DURATION_MS) return MAX_DURATION_MS;
  return value;
}

// 取车次首字母，如 "G5678" → "G"
function getTrainPrefix(trainNo) {
  const match = String(trainNo || '').trim().toUpperCase().match(/^([A-Z])/);
  return match ? match[1] : '';
}

// 按车次估算行程时长（毫秒）
function estimateDurationMs(trainNo) {
  const prefix = getTrainPrefix(trainNo);
  const hours = DURATION_HOURS_BY_PREFIX[prefix];
  if (!hours) return DEFAULT_DURATION_MS;
  return clampDuration(hours * HOUR_MS);
}

// 把「日期 + 时间」两个 picker 的值拼成时间戳
// dateStr: '2026-10-26'，timeStr: '18:30'
function parseArrivalInput(dateStr, timeStr) {
  const date = String(dateStr || '').trim();
  const time = String(timeStr || '').trim();
  if (!date || !time) return 0;

  const dateParts = date.split('-').map((item) => Number(item));
  const timeParts = time.split(':').map((item) => Number(item));
  if (dateParts.length !== 3 || timeParts.length !== 2) return 0;
  if (dateParts.some((item) => !Number.isFinite(item))) return 0;
  if (timeParts.some((item) => !Number.isFinite(item))) return 0;

  const [year, month, day] = dateParts;
  const [hour, minute] = timeParts;
  const ts = new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

// 解析最终使用的到达时间戳
// 用户填的到达时间如果早于发车时间（或格式无效），退回到估算时长
function resolveArrivalTs({ trainNo, departTs = Date.now(), arrivalTs = 0 } = {}) {
  const depart = Number(departTs) || Date.now();
  const manual = Number(arrivalTs) || 0;

  if (manual > depart) {
    return depart + clampDuration(manual - depart);
  }

  return depart + estimateDurationMs(trainNo);
}

// 剩余车程比例：1 = 刚发车，0 = 已到站
function calcRemainingRatio(binding, now = Date.now()) {
  const arrival = Number(binding && binding.arrivalTs) || 0;
  const bound = Number(binding && binding.boundAt) || 0;
  if (!arrival) return 1;

  const current = Number(now) || Date.now();
  const total = arrival - bound;
  if (total <= 0) return current >= arrival ? 0 : 1;

  const ratio = (arrival - current) / total;
  if (ratio <= 0) return 0;
  if (ratio >= 1) return 1;
  return ratio;
}

// 绑定是否已过期（到站后自动解除）
function isBindingExpired(binding, now = Date.now()) {
  const arrival = Number(binding && binding.arrivalTs) || 0;
  if (!arrival) return false;
  return (Number(now) || Date.now()) >= arrival;
}

function formatDuration(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return '已到站';

  const totalMinutes = Math.floor(value / MINUTE_MS);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) return `${minutes}分钟`;
  if (minutes === 0) return `${hours}小时`;
  return `${hours}小时${minutes}分`;
}

// 剩余车程文案：用于绑定页卡片和首页提示
function formatRemaining(binding, now = Date.now()) {
  const arrival = Number(binding && binding.arrivalTs) || 0;
  if (!arrival) return '';
  const left = arrival - (Number(now) || Date.now());
  if (left <= 0) return '已到站';
  return `剩余 ${formatDuration(left)}`;
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

// 时间戳 → '2026-10-26 18:30'
function formatDateTime(ts) {
  const value = Number(ts);
  if (!Number.isFinite(value) || value <= 0) return '';
  const date = new Date(value);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

// 时间戳 → 日期 picker 需要的 'YYYY-MM-DD'
function formatDate(ts) {
  const value = Number(ts);
  if (!Number.isFinite(value) || value <= 0) return '';
  const date = new Date(value);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

// 时间戳 → 时间 picker 需要的 'HH:mm'
function formatTime(ts) {
  const value = Number(ts);
  if (!Number.isFinite(value) || value <= 0) return '';
  const date = new Date(value);
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

// 生成待提交的绑定对象（云函数 bindTrain 与本地兜底都用这个结构）
function buildTrainBinding({
  trainNo,
  carriageNo,
  seatNo = '',
  arrivalTs = 0,
  departTs = Date.now(),
  now = Date.now()
} = {}) {
  const depart = Number(departTs) || Date.now();
  const resolvedArrival = resolveArrivalTs({ trainNo, departTs: depart, arrivalTs });
  const binding = {
    trainNo: String(trainNo || '').trim().toUpperCase(),
    carriageNo: String(carriageNo || '').trim(),
    seatNo: String(seatNo || '').trim(),
    boundAt: depart,
    arrivalTs: resolvedArrival,
    remainingRatio: 1
  };
  binding.remainingRatio = calcRemainingRatio(binding, now);
  return binding;
}

module.exports = {
  HOUR_MS,
  MINUTE_MS,
  MIN_DURATION_MS,
  MAX_DURATION_MS,
  DEFAULT_DURATION_MS,
  DURATION_HOURS_BY_PREFIX,
  getTrainPrefix,
  estimateDurationMs,
  parseArrivalInput,
  resolveArrivalTs,
  calcRemainingRatio,
  isBindingExpired,
  formatDuration,
  formatRemaining,
  formatDateTime,
  formatDate,
  formatTime,
  buildTrainBinding
};
