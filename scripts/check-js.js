const { execFileSync } = require('node:child_process');
const { readdirSync, statSync } = require('node:fs');
const { join } = require('node:path');

const roots = ['app.js', 'miniprogram', 'cloudfunctions'];

function collectJsFiles(path, files = []) {
  const stat = statSync(path, { throwIfNoEntry: false });
  if (!stat) return files;
  if (stat.isFile() && path.endsWith('.js')) {
    files.push(path);
    return files;
  }
  if (stat.isDirectory()) {
    readdirSync(path).forEach((entry) => collectJsFiles(join(path, entry), files));
  }
  return files;
}

const files = roots.flatMap((root) => collectJsFiles(root));

files.forEach((file) => {
  execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
});

console.log(`Checked ${files.length} JavaScript files.`);
