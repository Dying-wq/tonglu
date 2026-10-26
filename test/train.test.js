const test = require('node:test');
const assert = require('node:assert/strict');

const {
  HOUR_MS,
  MINUTE_MS,
  DEFAULT_DURATION_MS,
  MAX_DURATION_MS,
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
} = require('../miniprogram/utils/train');

test('reads the train prefix from the train number', () => {
  assert.equal(getTrainPrefix('g5678'), 'G');
  assert.equal(getTrainPrefix('K1234'), 'K');
  assert.equal(getTrainPrefix('  d22 '), 'D');
  assert.equal(getTrainPrefix(''), '');
  assert.equal(getTrainPrefix('1234'), '');
});

test('estimates trip duration by train type', () => {
  assert.equal(estimateDurationMs('G1'), 4 * HOUR_MS);
  assert.equal(estimateDurationMs('D22'), 4 * HOUR_MS);
  assert.equal(estimateDurationMs('K1234'), 9 * HOUR_MS);
  // 无法识别车次类型时用 3 小时兜底
  assert.equal(estimateDurationMs(''), DEFAULT_DURATION_MS);
});

test('parses the date and time pickers into a timestamp', () => {
  const expected = new Date(2026, 9, 26, 18, 30, 0, 0).getTime();
  assert.equal(parseArrivalInput('2026-10-26', '18:30'), expected);

  assert.equal(parseArrivalInput('', '18:30'), 0);
  assert.equal(parseArrivalInput('2026-10-26', ''), 0);
  assert.equal(parseArrivalInput('2026/10/26', '18:30'), 0);
  assert.equal(parseArrivalInput('2026-10-26', '1830'), 0);
});

test('uses the manual arrival time when it is valid', () => {
  const departTs = new Date(2026, 9, 26, 8, 0, 0, 0).getTime();
  const manual = departTs + 5 * HOUR_MS;

  assert.equal(resolveArrivalTs({ trainNo: 'G1', departTs, arrivalTs: manual }), manual);
});

test('falls back to the train estimate when manual arrival is invalid', () => {
  const departTs = new Date(2026, 9, 26, 8, 0, 0, 0).getTime();

  // 早于发车时间 → 用估算
  assert.equal(
    resolveArrivalTs({ trainNo: 'G1', departTs, arrivalTs: departTs - HOUR_MS }),
    departTs + 4 * HOUR_MS
  );
  // 未填 → 用估算
  assert.equal(
    resolveArrivalTs({ trainNo: 'K1234', departTs }),
    departTs + 9 * HOUR_MS
  );
});

test('clamps manual arrival times into the allowed window', () => {
  const departTs = new Date(2026, 9, 26, 8, 0, 0, 0).getTime();

  // 超过 24 小时按 24 小时算
  assert.equal(
    resolveArrivalTs({ trainNo: 'G1', departTs, arrivalTs: departTs + 40 * HOUR_MS }),
    departTs + MAX_DURATION_MS
  );
  // 不足 30 分钟按 30 分钟算
  assert.equal(
    resolveArrivalTs({ trainNo: 'G1', departTs, arrivalTs: departTs + 5 * MINUTE_MS }),
    departTs + 30 * MINUTE_MS
  );
});

test('calculates remaining trip ratio from bind time and arrival time', () => {
  const boundAt = new Date(2026, 9, 26, 8, 0, 0, 0).getTime();
  const arrivalTs = boundAt + 2 * HOUR_MS;
  const binding = { boundAt, arrivalTs };

  assert.equal(calcRemainingRatio(binding, boundAt), 1);
  assert.equal(calcRemainingRatio(binding, boundAt + HOUR_MS), 0.5);
  assert.equal(calcRemainingRatio(binding, arrivalTs), 0);
  // 超过到达时间后不再返回负数
  assert.equal(calcRemainingRatio(binding, arrivalTs + HOUR_MS), 0);
  // 没有到达时间时按满程处理
  assert.equal(calcRemainingRatio({ boundAt }, boundAt), 1);
});

test('detects expired bindings', () => {
  const boundAt = 1000;
  const arrivalTs = boundAt + HOUR_MS;
  const binding = { boundAt, arrivalTs };

  assert.equal(isBindingExpired(binding, boundAt), false);
  assert.equal(isBindingExpired(binding, arrivalTs), true);
  assert.equal(isBindingExpired(binding, arrivalTs + 1), true);
  assert.equal(isBindingExpired({ boundAt }, arrivalTs), false);
});

test('formats durations for display', () => {
  assert.equal(formatDuration(90 * MINUTE_MS), '1小时30分');
  assert.equal(formatDuration(30 * MINUTE_MS), '30分钟');
  assert.equal(formatDuration(2 * HOUR_MS), '2小时');
  assert.equal(formatDuration(0), '已到站');
  assert.equal(formatDuration(-1000), '已到站');
});

test('formats the remaining trip text for the binding card', () => {
  const now = new Date(2026, 9, 26, 8, 0, 0, 0).getTime();
  const binding = { boundAt: now, arrivalTs: now + 90 * MINUTE_MS };

  assert.equal(formatRemaining(binding, now), '剩余 1小时30分');
  assert.equal(formatRemaining({ arrivalTs: now }, now), '已到站');
  assert.equal(formatRemaining({}, now), '');
});

test('formats timestamps for pickers and cards', () => {
  const ts = new Date(2026, 9, 26, 18, 30, 0, 0).getTime();

  assert.equal(formatDate(ts), '2026-10-26');
  assert.equal(formatTime(ts), '18:30');
  assert.equal(formatDateTime(ts), '2026-10-26 18:30');
  assert.equal(formatDate(0), '');
  assert.equal(formatTime(0), '');
  assert.equal(formatDateTime(0), '');
});

test('builds a binding that carries arrival time and remaining ratio', () => {
  const departTs = new Date(2026, 9, 26, 8, 0, 0, 0).getTime();

  const binding = buildTrainBinding({
    trainNo: 'g1',
    carriageNo: '05',
    seatNo: '12A',
    departTs,
    now: departTs
  });

  assert.equal(binding.trainNo, 'G1');
  assert.equal(binding.carriageNo, '05');
  assert.equal(binding.seatNo, '12A');
  assert.equal(binding.boundAt, departTs);
  // 没填到达时间 → 按 G 字头估算 4 小时
  assert.equal(binding.arrivalTs, departTs + 4 * HOUR_MS);
  assert.equal(binding.remainingRatio, 1);

  const manual = buildTrainBinding({
    trainNo: 'K1234',
    carriageNo: '5',
    departTs,
    arrivalTs: departTs + 6 * HOUR_MS,
    now: departTs + 3 * HOUR_MS
  });
  assert.equal(manual.arrivalTs, departTs + 6 * HOUR_MS);
  assert.equal(manual.remainingRatio, 0.5);
});
