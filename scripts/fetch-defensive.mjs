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

// ---------- 腾讯行情兜底（Yahoo 被限流时使用） ----------
// usXXX 系列：~ 分隔；字段 3 = 现价
// hf_GC（纽约黄金期货主连）：逗号分隔；字段 0 = 现价 $/oz —— 与 GC=F 口径一致
// 注意：勿用 hf_XAU（伦敦金现货），现货比纽约期货低约 $30–40，会让「$4100 建仓线」判错档
function curlText(url) {
  return new Promise((resolve, reject) => {
    execFile('curl', ['-s', '-m', '20', url], { maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      if (err) return reject(err);
      if (!stdout || !stdout.trim()) return reject(new Error('空响应'));
      resolve(stdout.toString('utf8'));
    });
  });
}

async function fetchTencent(code) {
  const raw = await curlText(`https://qt.gtimg.cn/q=${code}`);
  const m = raw.match(/"([^"]*)"/);
  if (!m || !m[1]) throw new Error('腾讯无数据');
  const body = m[1];
  const parts = body.split(body.includes('~') ? '~' : ',');
  // usXXX：~ 分隔，第 3 段为现价；hf_GC：逗号分隔，第 0 段为现价
  const price = parseFloat(body.includes('~') ? parts[3] : parts[0]);
  if (!isFinite(price) || price <= 0) throw new Error('腾讯价格无效');
  return { price, source: '腾讯财经' };
}

// SCHD：按隐含股息率（TTM ÷ 现价）分档，档位越高投越多
function schdZone(price, cfg) {
  if (price == null) return { zone: '—', coefficient: null, zoneType: 'flat' };
  const ttm = cfg.ttm != null ? cfg.ttm : 1.06;
  const y = ttm / price * 100;              // 隐含股息率 %
  const tiers = cfg.tiers || [];
  for (const t of tiers) {
    if (y >= t.yield) return { zone: t.label, coefficient: t.amt / 1000, zoneType: t.amt >= 9000 ? 'up' : 'acc', yieldPct: y };
  }
  const stopped = y < (cfg.stopYield || 3.00);
  return { zone: stopped ? '停投' : '暂停', coefficient: 0, zoneType: 'down', yieldPct: y };
}

// BRK.B：按 P/B 分档（min ≤ P/B < max 命中该档；分界取更便宜那档）
function brkZone(price, cfg) {
  if (price == null) return { zone: '—', coefficient: null, zoneType: 'flat' };
  const bvps = cfg.bvps || 348.15;
  const pb = price / bvps;
  const tiers = cfg.tiers || [];
  for (const t of tiers) {
    if ((pb < t.max || t.max == null) && pb >= t.min) {
      return { zone: t.label, coefficient: t.amt / 1000, zoneType: t.amt >= 8000 ? 'up' : 'acc', pb };
    }
  }
  return { zone: '不投', coefficient: 0, zoneType: 'down', pb };
}

// 统一分派：gold 用价格阈值，其余按各自分档函数
function zoneOf(price, cfg) {
  if (cfg && cfg.ttm != null) return schdZone(price, cfg);
  if (cfg && cfg.bvps != null) return brkZone(price, cfg);
  // 兼容旧配置（无 tiers/ttm/bvps 字段时回退到价格阈值）
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
    { key: 'schd', sym: 'SCHD', display: 'SCHD', cfg: cfg.schd, tencent: 'usSCHD' },
    { key: 'brk', sym: 'BRK-B', display: 'BRK.B', cfg: cfg.brk, tencent: 'usBRK.B' },   // Yahoo 用 BRK-B
    { key: 'gold', sym: 'GC=F', display: 'GC=F', cfg: goldCfg, isGold: true, tencent: 'hf_GC' }
  ];

  const out = { items: {}, errors: [] };
  let fetched = 0;
  let tencentUsed = 0;

  // 单标的取价：Yahoo → 腾讯 → 静态
  async function priceOf(s) {
    try {
      const y = await fetchYahoo(s.sym);
      return { price: y.price, source: 'Yahoo Finance' };
    } catch (e) {
      out.errors.push(`${s.sym}(Yahoo): ${e.message || e}`);
    }
    if (s.tencent) {
      try {
        const t = await fetchTencent(s.tencent);
        tencentUsed++;
        return { price: t.price, source: '腾讯财经' };
      } catch (e) {
        out.errors.push(`${s.tencent}(腾讯): ${e.message || e}`);
      }
    }
    return { price: s.cfg ? s.cfg.price : null, source: '静态' };
  }

  for (const s of symbols) {
    const got = await priceOf(s);
    if (got.source !== '静态') fetched++;
    if (s.isGold) {
      const gz = goldZone(got.price, s.cfg.threshold || 4100);
      out.items.gold = { price: got.price, zone: gz.zone, zoneType: gz.zoneType, symbol: s.display, dataSource: got.source };
    } else {
      const z = zoneOf(got.price, s.cfg);
      out.items[s.key] = {
        price: got.price, zone: z.zone, coefficient: z.coefficient, zoneType: z.zoneType,
        yieldPct: z.yieldPct != null ? Number(z.yieldPct.toFixed(2)) : undefined,
        pb: z.pb != null ? Number(z.pb.toFixed(3)) : undefined,
        symbol: s.display, dataSource: got.source
      };
    }
  }

  out.generatedAt = beijingTime();
  out.source = tencentUsed === symbols.length ? '腾讯财经'
             : (tencentUsed > 0 ? 'Yahoo Finance + 腾讯财经' : (fetched > 0 ? 'Yahoo Finance' : '静态'));
  out.fetchNote = `${fetched}/${symbols.length} 取价成功` + (out.errors.length ? '；失败：' + out.errors.join(' / ') : '');

  const code = `// 自动生成：防守仓行情快照（SCHD / BRK.B / 黄金）\n// 生成时间：${out.generatedAt}\nwindow.DEFENSIVE_LIVE = ${JSON.stringify(out, null, 2)};\n`;
  fs.writeFileSync(outPath, code, 'utf8');
  console.log('生成', outPath);
  console.log('摘要:', out.fetchNote);
  console.log(JSON.stringify(out.items, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
