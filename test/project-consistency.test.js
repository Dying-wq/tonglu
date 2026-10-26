const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const MINIPROGRAM = path.join(ROOT, 'miniprogram');
const CLOUD_FUNCTIONS = path.join(ROOT, 'cloudfunctions');

const appJson = JSON.parse(fs.readFileSync(path.join(MINIPROGRAM, 'app.json'), 'utf8'));

function walk(dir, filter, files = []) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, filter, files);
    } else if (filter(full)) {
      files.push(full);
    }
  });
  return files;
}

const pageJsFiles = walk(MINIPROGRAM, (file) => file.endsWith('.js') && !file.includes('utils'));
const cloudFunctionDirs = fs.readdirSync(CLOUD_FUNCTIONS, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

// 报告书与交接文档反复踩的坑：只有 app.json 里注册的页面才会加载，
// 改了废弃目录里的文件会出现「改了完全没反应」。这里做静态守护。

test('every registered page has a js and wxml file', () => {
  appJson.pages.forEach((page) => {
    const base = path.join(MINIPROGRAM, page);
    assert.equal(fs.existsSync(`${base}.js`), true, `缺少页面脚本：${page}.js`);
    assert.equal(fs.existsSync(`${base}.wxml`), true, `缺少页面结构：${page}.wxml`);
  });
});

test('every tabBar page is registered in pages and has icons', () => {
  const { list } = appJson.tabBar;
  assert.equal(list.length > 0, true);

  list.forEach((item) => {
    assert.equal(appJson.pages.includes(item.pagePath), true, `tabBar 页面未注册：${item.pagePath}`);
    assert.equal(
      fs.existsSync(path.join(MINIPROGRAM, item.iconPath)),
      true,
      `缺少 tabBar 图标：${item.iconPath}`
    );
    assert.equal(
      fs.existsSync(path.join(MINIPROGRAM, item.selectedIconPath)),
      true,
      `缺少 tabBar 选中图标：${item.selectedIconPath}`
    );
  });
});

test('every navigate target points to a registered page', () => {
  const urlPattern = /url:\s*['"`](\/pages\/[^'"`?]+)/g;
  const missing = [];

  pageJsFiles.forEach((file) => {
    const source = fs.readFileSync(file, 'utf8');
    let match = urlPattern.exec(source);
    while (match) {
      const pagePath = match[1].replace(/^\//, '');
      if (!appJson.pages.includes(pagePath)) {
        missing.push(`${path.relative(ROOT, file)} → /${pagePath}`);
      }
      match = urlPattern.exec(source);
    }
    urlPattern.lastIndex = 0;
  });

  assert.deepEqual(missing, [], `存在指向未注册页面的跳转：\n${missing.join('\n')}`);
});

test('every cloud function called from the miniprogram exists', () => {
  const callPattern = /callFunction\(\s*'([^']+)'/g;
  const called = new Set();

  pageJsFiles.concat(walk(MINIPROGRAM, (file) => file.includes('utils') && file.endsWith('.js')))
    .forEach((file) => {
      const source = fs.readFileSync(file, 'utf8');
      let match = callPattern.exec(source);
      while (match) {
        called.add(match[1]);
        match = callPattern.exec(source);
      }
      callPattern.lastIndex = 0;
    });

  assert.equal(called.size > 0, true, '没有扫描到任何云函数调用');

  const missing = [...called].filter((name) => !cloudFunctionDirs.includes(name));
  assert.deepEqual(missing, [], `前端调用了不存在的云函数：${missing.join('、')}`);
});

test('every cloud function called from another cloud function exists', () => {
  const callPattern = /name:\s*'([a-zA-Z]+)'/g;
  const missing = [];

  cloudFunctionDirs.forEach((name) => {
    const indexFile = path.join(CLOUD_FUNCTIONS, name, 'index.js');
    if (!fs.existsSync(indexFile)) return;
    const source = fs.readFileSync(indexFile, 'utf8');
    if (!source.includes('cloud.callFunction')) return;

    let match = callPattern.exec(source);
    while (match) {
      if (!cloudFunctionDirs.includes(match[1])) {
        missing.push(`${name} → ${match[1]}`);
      }
      match = callPattern.exec(source);
    }
    callPattern.lastIndex = 0;
  });

  assert.deepEqual(missing, [], `云函数调用了不存在的云函数：${missing.join('、')}`);
});

test('every cloud function ships an index.js and package.json', () => {
  cloudFunctionDirs.forEach((name) => {
    const dir = path.join(CLOUD_FUNCTIONS, name);
    assert.equal(fs.existsSync(path.join(dir, 'index.js')), true, `${name} 缺少 index.js`);
    assert.equal(fs.existsSync(path.join(dir, 'package.json')), true, `${name} 缺少 package.json`);

    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    assert.equal(
      Boolean(pkg.dependencies && pkg.dependencies['wx-server-sdk']),
      true,
      `${name}/package.json 未声明 wx-server-sdk 依赖`
    );

    const source = fs.readFileSync(path.join(dir, 'index.js'), 'utf8');
    assert.equal(
      source.includes('exports.main'),
      true,
      `${name}/index.js 未导出 main 入口`
    );
  });
});

test('sitemap file referenced by app.json exists', () => {
  assert.equal(
    fs.existsSync(path.join(MINIPROGRAM, appJson.sitemapLocation)),
    true,
    `缺少 sitemap：${appJson.sitemapLocation}`
  );
});

test('deprecated page folders are not registered', () => {
  // 交接说明第六节：chat / messages / hot / map 四个目录已废弃
  const deprecated = ['pages/chat/', 'pages/messages/', 'pages/hot/', 'pages/map/'];
  appJson.pages.forEach((page) => {
    deprecated.forEach((prefix) => {
      assert.equal(page.startsWith(prefix), false, `废弃页面仍在 app.json 中：${page}`);
    });
  });
});
