const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const visibleFiles = [
  'miniprogram/pages/admin/admin.wxml',
  'miniprogram/pages/admin/admin.js',
  'miniprogram/pages/profile/profile.wxml',
  'miniprogram/pages/profile/profile.js',
  'miniprogram/pages/rules/rules.wxml',
  'miniprogram/pages/rules/rules.js',
  'miniprogram/pages/search/search.wxml',
  'miniprogram/pages/map/map.wxml',
  'miniprogram/pages/map/map.js',
  'miniprogram/pages/order-detail/order-detail.wxml',
  'miniprogram/pages/review/review.wxml'
];

const mojibakeMarkers = [
  '\ufffd',
  '\u9231',
  '\u93b4\u612e\u608a',
  '\u9435\u5822',
  '\u9365\u5ae8',
  '\u7481\u44f0',
  '\u95ab\u901a'
];

test('visible page copy does not contain common mojibake markers', () => {
  const offenders = [];
  for (const file of visibleFiles) {
    const content = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
    const markers = mojibakeMarkers.filter((marker) => content.includes(marker));
    if (markers.length) offenders.push({ file, markers });
  }

  assert.deepEqual(offenders, []);
});
