// 防守仓行情拉取：SCHD / BRK.B / 黄金(GC=F)
// 主源：Yahoo Finance；输出 assets/defensive-live.js -> window.DEFENSIVE_LIVE
// 黄金规则：纽约黄金期货主连 GC=F；>= $4100/oz 为「偏贵/等待」，< $4100 为「建仓」
// 更新频率：与全站统一，每日 3 次（08:30 / 16:30 / 23:00 北京时间）

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dataPath = path.join(root, 'assets', 'data.js');
const outPath = path.join(root, 'assets', 'defensive-live.js');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

// ---------- 工具 ----------
function beijingTime() {
  const now = new Date();
  const t = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
  const pad = n => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${pad(t.getMonth()+1)}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())} 北京时间`;
}

function curlJson(url) {
  return new Promise((resolve, reject) => {
    execFile('curl', ['-s', '-m', '25', '-H', 'User-Agent: ' + UA, '-H', 'Accept: application/json', url],
      { maxBuffer: 32 * 1024 * 1024 }, (err, stdout) => {
        if (err) return reject(err);
        if (!stdout || !stdout.trim()) return reject(new Error('空响应'));
        try { resolve(JSON.parse(stdout)); } catch (e) { reject(new Error('JSON 解析失败')); }
      });
  });
}

// Yahoo 双域名容灾：query1 会整站不可达（HTTP 000），query2 正常。轮换重试。
const YAHOO_HOSTS = ['query2.finance.yahoo.com', 'query1.finance.yahoo.com'];
async function curlJsonRetry(path) {
  let lastErr;
  for (const host of YAHOO_HOSTS) {
    try { return await curlJson(`https://${host}${path}`); }
    catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('全部 Yahoo 域名失败');
}

async function fetchYahoo(sym) {
  const d = await curlJsonRetry(`/v8/finance/chart/${encodeURIComponent(sym)}?range=5d&interval=1d`);
  const r = d.chart && d.chart.result && d.chart.result[0];
  if (!r) throw new Error('empty result');
  const m = r.meta || {};
  const q = (r.indicators && r.indicators.quote && r.indicators.quote[0]) || {};
  const closes = (q.close || []).filter(c => c != null);
  if (!closes.length) throw new Error('no closes');
  const price = m.regularMarketPrice != null ? m.regularMarketPrice : closes[closes.length - 1];
  return { meta: m, price, closes };
}

function loadConfig() {
  const src = fs.readFileSync(dataPath, 'utf8');
  const sandbox = { window: {} };
  const fn = new Function('window', src + '\n; return window.ORIGISTAR || null;');
  return fn(sandbox.window);
}

function zoneOf(price, cfg) {
  if (price == null) return { zone: '—', coefficient: null, zoneType: 'flat' };
  if (price <= cfg.extreme) return { zone: '极度便宜', coefficient: 2.0, zoneType: 'up' };
  if (price <= cfg.sweet)   return { zone: '甜区', coefficient: 1.5, zoneType: 'acc' };
  if (price <= cfg.fair)    return { zone: '合理', coefficient: 1.0, zoneType: 'flat' };
  if (cfg.expensive != null && price <= cfg.expensive) return { zone: '偏贵 / 等待', coefficient: 0.6, zoneType: 'down' };
  return { zone: '极贵 / 观望', coefficient: 0.3, zoneType: 'down' };
}

function goldZone(price, threshold) {
  if (price == null) return { zone: '—', zoneType: 'flat' };
  if (price < threshold) return { zone: '建仓', zoneType: 'up' };
  return { zone: '偏贵 / 等待', zoneType: 'down' };
}

// ---------- 主流程 ----------
async function main() {
  const data = loadConfig();
  const cfg = (data && data.defensive) || {};
  const goldCfg = (data && data.gold) || {};

  const symbols = [
    { key: 'schd', sym: 'SCHD', display: 'SCHD', cfg: cfg.schd },
    { key: 'brk', sym: 'BRK-B', display: 'BRK.B', cfg: cfg.brk },   // Yahoo 用 BRK-B
    { key: 'gold', sym: 'GC=F', display: 'GC=F', cfg: goldCfg, isGold: true }
  ];

  const out = { items: {}, errors: [] };
  let fetched = 0;

  for (const s of symbols) {
    try {
      const y = await fetchYahoo(s.sym);
      if (s.isGold) {
        const gz = goldZone(y.price, s.cfg.threshold || 4100);
        out.items.gold = { price: y.price, zone: gz.zone, zoneType: gz.zoneType, symbol: s.display, dataSource: 'Yahoo Finance' };
      } else {
        const z = zoneOf(y.price, s.cfg);
        out.items[s.key] = { price: y.price, zone: z.zone, coefficient: z.coefficient, zoneType: z.zoneType, symbol: s.display, dataSource: 'Yahoo Finance' };
      }
      fetched++;
    } catch (e) {
      out.errors.push(`${s.sym}: ${e.message || e}`);
      //  fallback：用静态配置里的 price 兜底
      const fallbackPrice = s.cfg ? s.cfg.price : null;
      if (s.isGold) {
        const gz = goldZone(fallbackPrice, s.cfg.threshold || 4100);
        out.items.gold = { price: fallbackPrice, zone: gz.zone, zoneType: gz.zoneType, symbol: s.display, dataSource: '静态' };
      } else {
        const z = zoneOf(fallbackPrice, s.cfg);
        out.items[s.key] = { price: fallbackPrice, zone: z.zone, coefficient: z.coefficient, zoneType: z.zoneType, symbol: s.display, dataSource: '静态' };
      }
    }
  }

  out.generatedAt = beijingTime();
  out.source = fetched === symbols.length ? 'Yahoo Finance' : (fetched > 0 ? 'Yahoo Finance + 静态' : '静态');
  out.fetchNote = `${fetched}/${symbols.length} 成功` + (out.errors.length ? '；失败：' + out.errors.join(' / ') : '');

  const code = `// 自动生成：防守仓行情快照（SCHD / BRK.B / 黄金 GC=F）\n// 生成时间：${out.generatedAt}\nwindow.DEFENSIVE_LIVE = ${JSON.stringify(out, null, 2)};\n`;
  fs.writeFileSync(outPath, code, 'utf8');
  console.log('生成', outPath);
  console.log('摘要:', out.fetchNote);
  console.log(JSON.stringify(out.items, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
