/* ============================================================================
   tools/build-www.mjs —— 打包用 www 目录生成器（Capacitor webDir="www"）
   ----------------------------------------------------------------------------
   职责：把运行时需要的网页文件复制到 www/（index.html + css/ + js/ + assets/），
        供 `npx cap sync android` 打进 APK。docs/tools/node_modules 等不进包。
        另生成（阶段十九「更新日志 + 自动更新」）：
          1) js/generated/changelog.js —— 由 CHANGELOG.md 解析，游戏内「更新日志」页数据源
             （写入源码树 js/generated/ 并随 js/ 复制进 www；开发服务器与 APK 同源同版）
          2) www/version.json —— {v, date}，网页自动更新检测端点（LG.Updater 拉取）
          3) www/index.html 资源 ?v=<内容哈希> 冲刷 —— 部署新版后浏览器必然拉新资源
   用法：node tools/build-www.mjs   （package.json: npm run www）
   注意：改完网页源码或 CHANGELOG.md 后必须重新运行本脚本再 sync，否则 APK 里是旧版本。
   ========================================================================== */
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'); // 项目根
const www = join(root, 'www');

/* ---------- 1) 解析 CHANGELOG.md -> { v, date, entries[] }（本文件是版本号唯一来源） ---------- */
function parseChangelog() {
  const src = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
  const entries = [];
  // 按条目头 "## [vX.Y.Z] - 日期" 分段（split 比 lookahead 正则稳：不受 /m 下 $ 提前命中影响）
  for (const seg of src.split(/^## \[/m).slice(1)) {
    const m = seg.match(/^(v[\d.]+)\] - (\S+)/);
    if (!m) continue;
    const items = [];
    for (const raw of seg.split('\n')) {
      const l = raw.trim();
      if (!l || l.startsWith('###')) continue;         // 空行/小节标题不进条目
      if (l.startsWith('- ')) items.push(l.slice(2));  // 新条目
      else if (items.length && !l.startsWith('#'))     // Markdown 折行：并入上一条
        items[items.length - 1] += ' ' + l;
    }
    entries.push({ v: m[1], date: m[2], items });
  }
  if (!entries.length) throw new Error('[www] CHANGELOG.md 无有效条目（格式：## [vX.Y.Z] - 日期）');
  return { v: entries[0].v, date: entries[0].date, entries };
}
const changelog = parseChangelog();

/* ---------- 2) 源码树生成 js/generated/changelog.js（游戏内 LG.CHANGELOG 数据源） ---------- */
const genDir = join(root, 'js', 'generated');
mkdirSync(genDir, { recursive: true });
writeFileSync(join(genDir, 'changelog.js'),
  '/* 本文件由 tools/build-www.mjs 从 CHANGELOG.md 自动生成，请勿手改；更新内容请写 CHANGELOG.md。 */\n' +
  'window.LG = window.LG || {}; LG.CHANGELOG = ' + JSON.stringify(changelog.entries, null, 1) + ';\n');
console.log(`[www] changelog.js 已生成（${changelog.entries.length} 条，当前 ${changelog.v}）`);

/* ---------- 3) 复制运行时文件到 www/ ---------- */
rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });
for (const item of ['index.html', 'css', 'js', 'assets']) {
  cpSync(join(root, item), join(www, item), { recursive: true });
}

/* ---------- 4) version.json —— 自动更新检测端点 ---------- */
const verJson = JSON.stringify({ v: changelog.v, date: changelog.date });
writeFileSync(join(www, 'version.json'), verJson);
// 仓库根同步写一份（gitignore）：开发服务器从根目录起服时与部署环境行为一致，
// 避免 fetch 404 在浏览器控制台产生 error 日志（测试零报错断言依赖）
writeFileSync(join(root, 'version.json'), verJson);
console.log('[www] version.json 已生成（' + changelog.v + '，www/ 与仓库根各一份）');

/* ---------- 5) www/index.html 资源 ?v=<内容哈希> 冲刷 ----------
   哈希覆盖 www 内除 index.html/version.json 外的全部文件内容：
   任何资源变化 -> 全部资源 URL 带新参数 -> 浏览器绕过旧缓存，保证"自动更新"拉到新代码。 */
function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const h = createHash('sha256');
for (const p of walk(www).sort()) {
  const rel = relative(www, p).replaceAll('\\', '/');
  if (rel === 'index.html' || rel === 'version.json') continue;
  h.update(rel); h.update(readFileSync(p));
}
const stamp = h.digest('hex').slice(0, 8);
let html = readFileSync(join(www, 'index.html'), 'utf8');
html = html
  .replace(/(<script src="(?:js\/[^"]+))(")/g, `$1?v=${stamp}$2`)
  .replace(/(<link rel="stylesheet" href="(?:css\/[^"]+))(")/g, `$1?v=${stamp}$2`);
writeFileSync(join(www, 'index.html'), html);
console.log(`[www] 已生成 www/（index.html + css + js + assets，资源版本 ?v=${stamp}）`);
