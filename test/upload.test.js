const test = require('node:test');
const assert = require('node:assert/strict');

const { buildPostImageCloudPath } = require('../miniprogram/utils/upload');

test('builds a cloud path for post images using extension and index', () => {
  const path = buildPostImageCloudPath('/tmp/demo/photo.jpg', 2, 1710000000000);

  assert.equal(path, 'post-images/1710000000000-2.jpg');
});

test('falls back to png when local image has no extension', () => {
  const path = buildPostImageCloudPath('wxfile://tmp_abc', 0, 1710000000000);

  assert.equal(path, 'post-images/1710000000000-0.png');
});
