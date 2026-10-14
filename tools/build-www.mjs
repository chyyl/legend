/* ============================================================================
   tools/build-www.mjs —— 打包用 www 目录生成器（Capacitor webDir="www"）
   ----------------------------------------------------------------------------
   职责：把运行时需要的网页文件复制到 www/（index.html + css/ + js/ + assets/），
        供 `npx cap sync android` 打进 APK。docs/tools/node_modules 等不进包。
   用法：node tools/build-www.mjs   （package.json: npm run www）
   注意：改完网页源码后必须重新运行本脚本再 sync，否则 APK 里是旧版本。
   ========================================================================== */
import { cpSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'); // 项目根
const www = join(root, 'www');
rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });
for (const item of ['index.html', 'css', 'js', 'assets']) {
  cpSync(join(root, item), join(www, item), { recursive: true });
}
console.log('[www] 已生成 www/（index.html + css + js + assets）');
