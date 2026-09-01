// 回写站点统一更新时间（仅改 assets/data.js 顶部 updated 字段，不动其他数据）
// 由 .github/workflows/update-all.yml 在每次抓取后、提交前调用。
// 目的：让所有加载 data.js 的页面（策略库 / 研习录 / 个人策略页等低频页）
//       的「更新于」与每日自动抓取时间保持一致，避免停留在人工静态旧值。
import { readFileSync, writeFileSync } from 'fs';

const p = 'assets/data.js';
const s0 = readFileSync(p, 'utf8');

// 北京时间戳：YYYY-MM-DD HH:MM 北京时间（与全站 live 快照口径一致）
const stamp = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 16).replace('T', ' ') + ' 北京时间';

// 仅替换 ORIGISTAR 顶层 updated（2 空格缩进），不动 config.updated（4 空格）
const s1 = s0.replace(/\n  updated: "[^"]*",/, `\n  updated: "${stamp}",`);
if (s1 === s0) {
  console.error('[stamp-data] 未找到可替换的 updated 字段，跳过');
  process.exit(0);
}
writeFileSync(p, s1);
console.log('[stamp-data] data.js.updated ->', stamp);
