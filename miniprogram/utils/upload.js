function buildPostImageCloudPath(filePath, index, timestamp = Date.now()) {
  const match = String(filePath || '').match(/\.([a-zA-Z0-9]+)(?:\?.*)?$/);
  const ext = match ? match[1].toLowerCase() : 'png';
  return `post-images/${timestamp}-${index}.${ext}`;
}

async function uploadPostImages(localPaths = []) {
  if (!localPaths.length) {
    return [];
  }

  if (!wx.cloud) {
    return localPaths;
  }

  const timestamp = Date.now();
  const tasks = localPaths.map((filePath, index) => wx.cloud.uploadFile({
    cloudPath: buildPostImageCloudPath(filePath, index, timestamp),
    filePath
  }));
  const results = await Promise.all(tasks);
  return results.map((item) => item.fileID);
}

module.exports = {
  buildPostImageCloudPath,
  uploadPostImages
};
