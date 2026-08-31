// 进取仓行情拉取 + 5 阶段趋势止盈计算
// 主源：Yahoo Finance（美股/港股/Ａ股通吃，免 key）
// 兜底：东方财富 push2（中国大陆可达；本工作流跑在美区 runner，东财可能不稳，故仅作 best-effort 兜底）
// 输出：assets/aggressive-live.js  ->  window.AGGRESSIVE_LIVE
//
// 计算口径（与页面"计算口径"说明保持一致）：
//   MA20 / MA50：日线简单移动平均
//   ATR(20)：真实波幅 20 日均值；ATR% = ATR / 最新价
//   周线 MA10：由日线近似（每 5 交易日取一点），取末值
//   峰值：max(52周最高, 近一年收盘最高)
//   距高点回撤(ATR 数) = 距高点回撤% / ATR%
//   5 阶段判定（取最严重已触发项）：
//     ④ 清仓    : 距高点回撤 ≥ 3×ATR
//     ③ 趋势破坏: 收盘 < MA50 且 周线收盘 < MA10
//     ② 波动落袋: ATR% 分位 > 75%  或 单日涨幅 > 2×ATR%
//     ① 预警    : 连续 2 日收盘 < MA20  或 距高点回撤 ≥ 2×ATR
//     0 持有/正常: 以上均未触发
//   ⑤ 负成本（并行保护位）：盈利 ≥ 1R(=2×ATR%) 时止损可上移至成本；需录入 entry 成本

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dataPath = path.join(root, 'assets', 'data.js');
const outPath = path.join(root, 'assets', 'aggressive-live.js');
const prevPath = outPath;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const ATR_N = 20;
const MA_FAST = 20;
const MA_SLOW = 50;
const WEEK_STEP = 5; // 交易日近似一周

// ---------- 工具 ----------
function sma(arr, n) {
  if (arr.length < n) return null;
  let s = 0;
  for (let i = arr.length - n; i < arr.length; i++) s += arr[i];
  return s / n;
}
function atrSeries(highs, lows, closes, n) {
  const tr = [];
  for (let i = 0; i < closes.length; i++) {
    const h = highs[i], l = lows[i], pc = i > 0 ? closes[i - 1] : closes[i];
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const atr = [];
  let sum = 0;
  for (let i = 0; i < tr.length; i++) {
    if (i < n - 1) { atr.push(null); sum += tr[i]; }
    else if (i === n - 1) { sum += tr[i]; atr.push(sum / n); }
    else { atr.push((atr[i - 1] * (n - 1) + tr[i]) / n); }
  }
  return atr;
}
function normSymbol(s) {
  if (!s) return s;
  let x = String(s).trim();
  // Yahoo 港股：去掉一个前导零（03330 -> 3330, 01712 -> 1712, 00340 -> 0340）
  if (x.toUpperCase().endsWith('.HK') && x.startsWith('0')) x = x.slice(1);
  return x;
}
function yahooToEmSecid(s) {
  const u = String(s).toUpperCase();
  if (u.endsWith('.HK')) return '116.' + u.replace('.HK', '');
  if (u.endsWith('.SS')) return '1.' + u.replace('.SS', '');
  if (u.endsWith('.SZ')) return '0.' + u.replace('.SZ', '');
  return '107.' + u; // 美股
}

// ---------- 读取静态配置（data.js 是纯数据，挂到 window.ORIGISTAR）----------
function loadConfig() {
  const src = fs.readFileSync(dataPath, 'utf8');
  const sandbox = { window: {} };
  const fn = new Function('window', src + '\n; return window.ORIGISTAR || null;');
  const data = fn(sandbox.window);
  if (!data || !data.aggressive) throw new Error('data.js 未找到 ORIGISTAR.aggressive');
  return data.aggressive;
}

// ---------- 行情源（用 curl 取数，避免 Node undici 在部分环境被反代拦截）----------
function curlJson(url) {
  return new Promise((resolve, reject) => {
    execFile('curl', ['-s', '-m', '25', '-H', 'User-Agent: ' + UA, '-H', 'Accept: application/json', url],
      { maxBuffer: 32 * 1024 * 1024 }, (err, stdout) => {
        if (err) return reject(err);
        try { resolve(JSON.parse(stdout)); } catch (e) { reject(new Error('JSON 解析失败')); }
      });
  });
}

async function fetchYahoo(sym) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1y&interval=1d`;
  const d = await curlJson(url);
  const r = d.chart && d.chart.result && d.chart.result[0];
  if (!r) throw new Error('empty result');
  const m = r.meta || {};
  const q = (r.indicators && r.indicators.quote && r.indicators.quote[0]) || {};
  const closes = (q.close || []).filter(c => c != null);
  const highs = (q.high || []).filter(h => h != null);
  const lows = (q.low || []).filter(l => l != null);
  if (!closes.length) throw new Error('no closes');
  return { meta: m, closes, highs, lows };
}

// 东财兜底（best-effort，价格缩放以 A/港为准；东财为大陆可达，美区 runner 可能不稳，故仅兜底）
async function fetchEastmoney(sym) {
  const secid = yahooToEmSecid(sym);
  const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f43,f57,f58,f167,f164,f168`;
  const d = await curlJson(url);
  const dt = d && d.data;
  if (!dt || dt.f43 == null) throw new Error('empty');
  // 东财 f43 单位：A/港股通常为 ×1000，美股 ×100（此处按 A/港假定，美股可能需 ×1）
  const isUS = secid.startsWith('107.');
  const scale = isUS ? 1 : 1000;
  const price = dt.f43 / scale;
  return { meta: { regularMarketPrice: price, currency: isUS ? 'USD' : (secid.startsWith('116.') ? 'HKD' : 'CNY'), fiftyTwoWeekHigh: dt.f169 != null ? dt.f169 / scale : null }, closes: [price], highs: [price], lows: [price] };
}

async function fetchWithFallback(cfg) {
  const sym = normSymbol(cfg.code);
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const y = await fetchYahoo(sym);
      return { ...y, source: 'Yahoo', sym };
    } catch (e) {
      lastErr = e;
      if (e.message && e.message.includes('429')) await sleep(1200 * attempt);
      else break; // 404 / 结构错误不再重试
    }
  }
  // Yahoo 失败 -> 东财兜底
  try {
    const em = await fetchEastmoney(sym);
    return { ...em, source: '东财', sym };
  } catch (e2) {
    lastErr = e2;
  }
  return { error: String(lastErr && lastErr.message || lastErr), source: '失败', sym };
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ---------- 指标 + 5 阶段 ----------
function computeMetrics(live, cfg) {
  if (live.error || !live.closes || live.closes.length < MA_SLOW) {
    return { ok: false, error: live.error || '数据不足' };
  }
  const closes = live.closes, highs = live.highs, lows = live.lows;
  const price = live.meta.regularMarketPrice != null ? live.meta.regularMarketPrice : closes[closes.length - 1];
  const ma20 = sma(closes, MA_FAST);
  const ma50 = sma(closes, MA_SLOW);
  const atrArr = atrSeries(highs, lows, closes, ATR_N);
  const atr = atrArr[atrArr.length - 1];
  const atrPct = atr / price;

  // 周线近似
  const weekly = [];
  for (let i = closes.length - 1; i >= 0; i -= WEEK_STEP) weekly.unshift(closes[i]);
  const ma10w = sma(weekly, 10);
  const closeWeekly = weekly[weekly.length - 1];

  // 峰值
  const maxClose = Math.max(...closes);
  const peak = Math.max(live.meta.fiftyTwoWeekHigh || 0, maxClose);

  // 距高点回撤
  const ddPk = (peak - price) / peak;
  const ddPkAtr = ddPk / atrPct;

  // 连续低于 MA20 天数
  let consec = 0;
  for (let i = closes.length - 1; i >= 0; i--) { if (closes[i] < ma20) consec++; else break; }

  // 单日涨幅
  const dailyRet = (price - closes[closes.length - 2]) / closes[closes.length - 2];

  // ATR% 分位
  const apS = [];
  for (let i = 0; i < atrArr.length; i++) apS.push(atrArr[i] == null ? null : atrArr[i] / closes[i]);
  const win = apS.filter(x => x != null).slice(-60);
  const cur = apS[apS.length - 1];
  const pct = win.length ? win.filter(x => x <= cur).length / win.length : 0.5;

  const m = { price, ma20, ma50, ma10w, closeWeekly, atr, atrPct, peak, ddPk, ddPkAtr, consec, dailyRet, atrPctPercentile: pct };
  m.stage = stageOf(m);
  return { ok: true, m };
}

function stageOf(m) {
  if (m.ddPkAtr >= 3) return 4;
  if (m.price < m.ma50 && m.closeWeekly < m.ma10w) return 3;
  if (m.atrPctPercentile > 0.75 || m.dailyRet > 2 * m.atrPct) return 2;
  if (m.consec >= 2 || m.ddPk >= 2 * m.atrPct) return 1;
  return 0;
}
const STAGE_LABEL = ['持有/正常', '①预警', '②波动落袋', '③趋势破坏', '④清仓'];

// ---------- 构建单条 ----------
function buildItem(cfg, prev, live) {
  const base = {
    name: cfg.name, code: cfg.code || '', market: cfg.market, currency: cfg.currency,
    status: cfg.status, weight: cfg.weight || null,
    presetSell: cfg.userSellWarn != null ? cfg.userSellWarn : null,
  };
  const ySym = (live && live.sym) || null;
  // 无代码 / 停牌 / 拉取失败 -> 静态降级
  if (!cfg.code || cfg.status === '停牌') {
    return {
      ...base, yahooSymbol: ySym, price: cfg.lastPrice, ma20: null, ma50: null, atr: null, atrPct: cfg.atrPct,
      stage: 0, stageLabel: cfg.status === '停牌' ? '停牌·不评' : '静态(代码待补)',
      trendStop: cfg.lastPrice != null && cfg.atrPct != null ? cfg.lastPrice * (1 - 3 * cfg.atrPct) : null,
      dataSource: cfg.code ? (cfg.status === '停牌' ? '停牌' : '静态') : '静态(代码待补)',
      note: cfg.note || '', error: cfg.code ? '停牌标的，沿用静态价' : '代码缺失，沿用静态价'
    };
  }
  const cm = computeMetrics(live, cfg);
  if (!cm.ok) {
    // 沿用上一次成功数据
    if (prev && prev.price != null) {
      return { ...base, yahooSymbol: ySym, ...prev, dataSource: '沿用上次(' + (prev.dataSource || '?') + ')', error: cm.error, note: (cfg.note || '') + ' ｜ 本次拉取失败，沿用上次' };
    }
    return {
      ...base, yahooSymbol: ySym, price: cfg.lastPrice, atrPct: cfg.atrPct, stage: 0, stageLabel: '静态(拉取失败)',
      trendStop: cfg.lastPrice != null && cfg.atrPct != null ? cfg.lastPrice * (1 - 3 * cfg.atrPct) : null,
      dataSource: '静态(拉取失败)', error: cm.error, note: cfg.note || ''
    };
  }
  const m = cm.m;
  return {
    ...base, yahooSymbol: ySym,
    price: m.price, ma20: m.ma20, ma50: m.ma50, ma10w: m.ma10w, atr: m.atr, atrPct: m.atrPct,
    peak: m.peak, ddPk: m.ddPk, ddPkAtr: m.ddPkAtr, consec: m.consec, dailyRet: m.dailyRet, atrPctPercentile: m.atrPctPercentile,
    stage: m.stage, stageLabel: STAGE_LABEL[m.stage],
    trendStop: m.price * (1 - 3 * m.atrPct),
    dataSource: live.source || '?', error: null, note: cfg.note || ''
  };
}

function buildWatchItem(cfg, prev, live) {
  const base = { name: cfg.name, code: cfg.code || '', market: cfg.market, currency: cfg.currency, status: cfg.status, weight: null, presetSell: null };
  const ySym = (live && live.sym) || null;
  if (!cfg.code) {
    return { ...base, yahooSymbol: null, price: cfg.lastPrice, atrPct: cfg.atrPct, buyPoint: null, stage: 0, stageLabel: '静态(代码待补)', dataSource: '静态(代码待补)', note: cfg.note || '', error: '代码缺失' };
  }
  const cm = computeMetrics(live, cfg);
  if (!cm.ok) {
    if (prev && prev.price != null) return { ...base, yahooSymbol: ySym, ...prev, dataSource: '沿用上次(' + (prev.dataSource || '?') + ')', error: cm.error };
    return { ...base, yahooSymbol: ySym, price: cfg.lastPrice, atrPct: cfg.atrPct, buyPoint: cfg.lastPrice != null && cfg.atrPct != null ? cfg.lastPrice * (1 - 2 * cfg.atrPct) : null, stage: 0, stageLabel: '静态(拉取失败)', dataSource: '静态(拉取失败)', error: cm.error };
  }
  const m = cm.m;
  // 观察仓为买侧，不参与 5 阶段卖出判定；仅给回踩买点与距买点
  return { ...base, yahooSymbol: ySym, price: m.price, atrPct: m.atrPct, buyPoint: m.price * (1 - 2 * m.atrPct), stage: 0, stageLabel: '—', dataSource: live.source || '?', error: null, note: cfg.note || '' };
}

// ---------- 主流程 ----------
function nowBJ() {
  // 北京时间 = UTC+8
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return d.toISOString().replace('T', ' ').slice(0, 19) + ' (北京)';
}

async function main() {
  const agg = loadConfig();
  let prev = { items: {}, watchItems: {} };
  if (fs.existsSync(prevPath)) {
    try {
      const src = fs.readFileSync(prevPath, 'utf8');
      const w = {};
      const fn = new Function('window', src + '\n; return window.AGGRESSIVE_LIVE || null;');
      const p = fn(w);
      if (p) prev = p;
    } catch (e) { /* 忽略旧文件错误 */ }
  }

  const items = {};
  const watchItems = {};
  const notes = [];
  for (const cfg of (agg.holdings || [])) {
    const live = cfg.code ? await fetchWithFallback(cfg) : { error: '代码缺失', source: '静态' };
    items[cfg.name] = buildItem(cfg, prev.items && prev.items[cfg.name], live);
    if (live.source === '失败') notes.push(cfg.name + ' 拉取失败');
  }
  for (const cfg of (agg.watch || [])) {
    const live = cfg.code ? await fetchWithFallback(cfg) : { error: '代码缺失', source: '静态' };
    watchItems[cfg.name] = buildWatchItem(cfg, prev.watchItems && prev.watchItems[cfg.name], live);
    if (live.source === '失败') notes.push('(观察)' + cfg.name + ' 拉取失败');
  }

  const out = {
    generatedAt: nowBJ(),
    updateFreq: '每日 3 次（08:30 / 16:30 / 23:00 北京时间）',
    source: 'Yahoo Finance 主力 + 东方财富 push2 兜底',
    fetchNote: notes.length ? ('部分标的拉取失败：' + notes.join('；')) : '全部标的已更新',
    items, watchItems
  };
  const js = 'window.AGGRESSIVE_LIVE = ' + JSON.stringify(out, null, 2) + ';\n';
  fs.writeFileSync(outPath, js, 'utf8');
  console.log('[ok] 写入 ' + outPath);
  console.log('     生成时间: ' + out.generatedAt);
  console.log('     摘要: ' + out.fetchNote);
  for (const k of Object.keys(items)) {
    const it = items[k];
    console.log(`     [持仓] ${k}: 价=${it.price} 阶段=${it.stageLabel} 趋势止盈价=${it.trendStop != null ? it.trendStop.toFixed(2) : '-'} 源=${it.dataSource}`);
  }
  for (const k of Object.keys(watchItems)) {
    const it = watchItems[k];
    console.log(`     [观察] ${k}: 价=${it.price} 回踩买点=${it.buyPoint != null ? it.buyPoint.toFixed(2) : '-'} 源=${it.dataSource}`);
  }
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
