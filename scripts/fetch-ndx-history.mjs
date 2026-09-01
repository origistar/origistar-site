// 纳指定投 v5.1 · 每日历史记录自动更新
// 产物：stable/state.json（追加/回填每日一条，供 stable/ndx-history.html 与决策面板读取）
//
// 算法口径与老站 D:\workbuddy\纳指\qqq-site\generate.py 完全一致：
//   三阶段 DD · DD 乘数 4/5/6 · PE×VIX 矩阵 · 100 分制性价比评分 · 日常池1000/熊市池500
//
// 数据源（与全站其他 fetch 脚本保持同一套封装，避免重复造轮子）：
//   PE / PE分位 / ROE ：蛋卷 danjuanfunds（老站同源）
//   NDX / VIX / 52周高：Yahoo v8 chart（双域名容灾）
//   513100 溢价率     ：腾讯 gtimg 现价 + 东财基金净值 + NDX/汇率双向修正（与 fetch-market 同口径）
//   历史 K 线         ：Yahoo （仅用于缺口回填）
//
// 说明：
//   1) 每日按「北京日期」去重后追加，保留最近 365 条。
//   2) 缺交易日自动回填：用 Yahoo 历史收盘重建 NDX/VIX，PE/PE分位按「与 NDX 同步缩放 + 历史线性回归」估算，
//      溢价率在缺口区间线性插值，重建记录统一打 _est 标记以便审计（页面不渲染该字段）。
//   3) 任何一路数据失败都不写坏文件：PE 取不到则沿用上一条的 PE 并打 _peStale 标记。

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const statePath = path.join(root, 'stable', 'state.json');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const YAHOO_HOSTS = ['query2.finance.yahoo.com', 'query1.finance.yahoo.com'];
const EM_FUND_REF = ['Referer: http://fund.eastmoney.com/'];

// ---------- 基础工具 ----------
function pad(n) { return String(n).padStart(2, '0'); }
function beijingTime() {
  const t = new Date(Date.now() + 8 * 3600 * 1000);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())} 北京时间`;
}
function todayBJ() {
  const t = new Date(Date.now() + 8 * 3600 * 1000);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
function ymd(d) { return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }

function curlJson(url, extraHeaders = []) {
  const args = ['-s', '-m', '25', '-H', 'User-Agent: ' + UA, '-H', 'Accept: application/json'];
  for (const h of extraHeaders) args.push('-H', h);
  args.push(url);
  return new Promise((resolve, reject) => {
    execFile('curl', args, { maxBuffer: 32 * 1024 * 1024 }, (err, stdout) => {
      if (err) return reject(err);
      if (!stdout || !stdout.trim()) return reject(new Error('空响应'));
      try { resolve(JSON.parse(stdout)); } catch (e) { reject(new Error('JSON 解析失败')); }
    });
  });
}
function curlText(url, extraHeaders = []) {
  const args = ['-s', '-m', '25', '-H', 'User-Agent: ' + UA];
  for (const h of extraHeaders) args.push('-H', h);
  args.push(url);
  return new Promise((resolve, reject) => {
    execFile('curl', args, { maxBuffer: 32 * 1024 * 1024 }, (err, stdout) => {
      if (err) return reject(err);
      if (!stdout || !stdout.trim()) return reject(new Error('空响应'));
      resolve(stdout);
    });
  });
}
async function curlJsonRetry(p) {
  let lastErr;
  for (const host of YAHOO_HOSTS) {
    try { return await curlJson(`https://${host}${p}`); } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('全部 Yahoo 域名失败');
}
async function fetchYahooChart(sym, range = '1y', interval = '1d') {
  const p = `/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=${interval}`;
  const d = await curlJsonRetry(p);
  const r = d.chart && d.chart.result && d.chart.result[0];
  if (!r) throw new Error('empty result');
  const m = r.meta || {};
  const q = (r.indicators && r.indicators.quote && r.indicators.quote[0]) || {};
  const ts = r.timestamp || [];
  const series = [];
  for (let i = 0; i < ts.length; i++) {
    const c = q.close && q.close[i];
    if (c != null) series.push({ date: ymd(new Date(ts[i] * 1000)), close: c });
  }
  const closes = series.map(s => s.close);
  const price = m.regularMarketPrice != null ? m.regularMarketPrice : (closes.length ? closes[closes.length - 1] : null);
  return { meta: m, closes, series, price };
}
function closeOnOrBefore(series, dateStr) {
  let best = null;
  for (const p of series) { if (p.date <= dateStr) best = p; else break; }
  return best ? best.close : null;
}

// ---------- v5.1 核心算法（与老站 generate.py 逐行对齐） ----------
const BM = {
  'low,greed': 1, 'low,calm': 2, 'low,fear': 3, 'low,extreme': 4,
  'mid_low,greed': 0.5, 'mid_low,calm': 1.5, 'mid_low,fear': 2, 'mid_low,extreme': 3,
  'mid,greed': 0.5, 'mid,calm': 1, 'mid,fear': 1.5, 'mid,extreme': 2,
  'high,greed': 0, 'high,calm': 0.5, 'high,fear': 1, 'high,extreme': 1.5,
  'sell,greed': 0, 'sell,calm': 0, 'sell,fear': 0, 'sell,extreme': 0
};

function tierOf(pe) {
  return pe < 28 ? 'low' : pe <= 33 ? 'mid_low' : pe <= 36 ? 'mid' : pe <= 38 ? 'high' : 'sell';
}
function vixBand(vix) {
  return vix < 13 ? 'greed' : vix <= 18 ? 'calm' : vix <= 30 ? 'fear' : 'extreme';
}
function ddMult(ddAbs) {
  if (ddAbs < 0.06) return 1.0;
  if (ddAbs < 0.10) return 1.5;
  if (ddAbs < 0.15) return 2.0;
  if (ddAbs < 0.20) return 3.0;
  if (ddAbs < 0.25) return 4.0;   // v5.1 熊市区
  if (ddAbs < 0.30) return 5.0;
  return 6.0;
}
function scoreOf(pePct, ddAbs, vix, roe) {
  const peS = Math.max(0, 100 - pePct) * 0.35;
  const ddS = Math.min(100, ddAbs * 400) * 0.25;
  const vixS = Math.min(100, Math.max(0, (vix - 10) * 5)) * 0.20;
  const roeS = Math.min(100, (roe - 10) * 5) * 0.10;
  const maS = Math.max(0, 100 - ddAbs * 500) * 0.10;
  return Math.round(peS + ddS + vixS + roeS + maS);
}

function computeRow(inp, state) {
  const { pe, pePct, roe, vix, ndx, ndx52, premium } = inp;
  const ddPct = +(((ndx - ndx52) / ndx52) * 100).toFixed(2);
  const ddAbs = Math.abs((ndx - ndx52) / ndx52);
  const tier = tierOf(pe);
  const band = vixBand(vix);
  const base = BM[`${tier},${band}`] ?? 0;
  const mult = ddMult(ddAbs);
  const units = tier === 'sell' ? 0 : base * mult;
  const D = ddAbs < 0.20 ? 1000 : 500;   // 日常池 1000 / 熊市池 500
  const daily = units > 0 ? Math.floor(units * D) : 0;

  // 阶段：① 日常 / ② 熊市反转窗口 / ③ 长熊（依赖熊市起点的持续月数）
  const isBear = ddAbs >= 0.20;
  let phase = '①';
  if (isBear) {
    if (!state.bear_start_date) { state.bear_start_date = inp.date; phase = '②'; }
    else {
      const days = (new Date(inp.date) - new Date(state.bear_start_date)) / 86400000;
      phase = Math.floor(days / 30) === 0 ? '②' : '③';
    }
  } else {
    state.bear_start_date = null;
  }

  return {
    date: inp.date,
    pe: +pe.toFixed(2),
    pe_pct: +pePct.toFixed(1),
    vix: +vix.toFixed(2),
    ndx: Math.round(ndx),
    dd_pct: ddPct,
    tier: tier,
    phase: phase,
    score: scoreOf(pePct, ddAbs, vix, roe),
    daily: daily,
    premium: premium == null ? null : +premium.toFixed(1)
  };
}

// ---------- 数据抓取 ----------
async function fetchPE() {
  // 蛋卷与老站同源：PE / PE百分位 / ROE
  const d = await curlJson('https://danjuanfunds.com/djapi/index_eva/dj');
  const items = (d && d.data && d.data.items) || [];
  const it = items.find(x => x.index_code === 'NDX');
  if (!it || it.pe == null) throw new Error('NDX 估值缺失');
  let pct = it.pe_percentile;
  if (pct != null && pct <= 1) pct = pct * 100;   // 兼容小数/百分数两种返回
  let roe = it.roe;
  if (roe != null && roe <= 1) roe = roe * 100;
  return { pe: +it.pe, pePct: pct == null ? null : +pct, roe: roe == null ? null : +roe };
}

async function fetchPremium513100(ndxChart, ndxNow) {
  // 与 fetch-market.mjs 同口径：gtimg 现价 /（东财净值 × 指数修正 × 汇率修正）
  const gtRaw = await curlText('https://qt.gtimg.cn/q=sh513100');
  const gm = gtRaw.match(/="([^"]*)"/);
  const gf = gm ? gm[1].split('~') : [];
  const price = gf[3] ? parseFloat(gf[3]) : null;
  if (!price) throw new Error('513100 现价缺失');
  const jzRaw = await curlJson('https://api.fund.eastmoney.com/f10/lsjz?fundCode=513100&pageIndex=1&pageSize=1', EM_FUND_REF);
  const jz = jzRaw && jzRaw.Data && jzRaw.Data.LSJZList && jzRaw.Data.LSJZList[0];
  if (!jz || !jz.DWJZ) throw new Error('513100 净值缺失');
  const nav = parseFloat(jz.DWJZ);
  const navDate = new Date(jz.FSRQ + 'T23:59:59Z');

  let fxNow = null, fxSeries = [];
  try {
    const fx = await fetchYahooChart('CNY=X');
    fxNow = fx.price; fxSeries = fx.series;
  } catch (e) { /* 汇率不可用时退回单向修正 */ }

  const ndxThen = ndxChart ? closeOnOrBefore(ndxChart.series, ymd(navDate)) : null;
  const fxThen = fxSeries.length ? closeOnOrBefore(fxSeries, ymd(navDate)) : null;
  let adjNav = nav;
  if (ndxNow && ndxThen) {
    const idxRatio = ndxNow / ndxThen;
    const fxRatio = (fxNow && fxThen) ? (fxThen / fxNow) : 1;
    adjNav = nav * idxRatio * fxRatio;
  }
  return +(((price - adjNav) / adjNav) * 100).toFixed(1);
}

// ---------- 缺口回填（用历史 K 线重建，PE 按 NDX 同步缩放估算） ----------
function missingWeekdays(history, today) {
  const have = new Set(history.map(h => h.date));
  const start = history.length ? history[history.length - 1].date : today;
  const out = [];
  const cur = new Date(start + 'T00:00:00Z');
  const end = new Date(today + 'T00:00:00Z');
  while (cur <= end && out.length < 15) {
    const s = ymd(cur);
    const wd = cur.getUTCDay();
    if (s !== start && wd >= 1 && wd <= 5 && !have.has(s)) out.push(s);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}
// 用历史 pe→pe_pct 做线性回归，估算给定 PE 对应的分位
function pePctSlope(history) {
  const pts = history.filter(h => h.pe != null && h.pe_pct != null).slice(-60);
  if (pts.length < 2) return 4.3;   // 老数据实测斜率（PE 每 +1，分位约 +4.3）
  const n = pts.length;
  const sx = pts.reduce((a, b) => a + b.pe, 0);
  const sy = pts.reduce((a, b) => a + b.pe_pct, 0);
  const sxy = pts.reduce((a, b) => a + b.pe * b.pe_pct, 0);
  const sxx = pts.reduce((a, b) => a + b.pe * b.pe, 0);
  const den = n * sxx - sx * sx;
  if (!den) return 4.3;
  return (n * sxy - sx * sy) / den;
}

async function main() {
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const history = Array.isArray(state.history) ? state.history : [];
  const notes = [];

  // 1) 实时行情
  let ndxChart = null, ndxNow = null, ndx52 = null, vixNow = null;
  try {
    ndxChart = await fetchYahooChart('^NDX');
    ndxNow = ndxChart.price;
    ndx52 = ndxChart.meta.fiftyTwoWeekHigh;
    if (ndxNow == null || ndx52 == null) throw new Error('NDX 行情/52周高缺失');
  } catch (e) { notes.push('NDX: ' + (e.message || e)); }
  try { vixNow = (await fetchYahooChart('^VIX')).price; } catch (e) { notes.push('VIX: ' + (e.message || e)); }

  // 2) 估值（PE / 分位 / ROE）
  let pe = null, pePct = null, roe = null, peStale = false;
  try {
    const ev = await fetchPE();
    pe = ev.pe; pePct = ev.pePct; roe = ev.roe;
  } catch (e) {
    notes.push('PE(蛋卷): ' + (e.message || e));
    peStale = true;
  }
  if (pe == null && history.length) {
    const last = history[history.length - 1];
    pe = last.pe; pePct = last.pe_pct; roe = history.length ? (history[history.length - 1].pe_pct != null ? last.pe_pct : null) : null;
    roe = 29.98;   // 蛋卷不可用时用最近一次已知 ROE（慢变量，影响极小）
  }
  if (pe == null) { console.log('跳过：PE 与历史均无可用值'); return; }
  if (roe == null) roe = 29.98;

  // 3) 溢价率
  let premium = null;
  try { premium = await fetchPremium513100(ndxChart, ndxNow); }
  catch (e) { notes.push('溢价率: ' + (e.message || e)); }

  if (ndxNow == null || vixNow == null) {
    console.log('跳过：NDX/VIX 不可用 ——', notes.join(' / '));
    state.lastNote = notes.join(' / ');
    state.generatedAt = beijingTime();
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
    return;
  }

  // 4) 回填缺失交易日（例如 08-31），再追加今日
  const today = todayBJ();
  const gaps = missingWeekdays(history, today);
  if (gaps.length) {
    const anchor = history[history.length - 1];
    const slope = pePctSlope(history);
    let ndxHist = null, vixHist = null;
    try { ndxHist = await fetchYahooChart('^NDX', '3mo'); } catch (e) { notes.push('NDX历史: ' + (e.message || e)); }
    try { vixHist = await fetchYahooChart('^VIX', '3mo'); } catch (e) { notes.push('VIX历史: ' + (e.message || e)); }
    for (let i = 0; i < gaps.length; i++) {
      const d = gaps[i];
      const nmap = ndxHist ? ndxHist.series.find(s => s.date === d) : null;
      const vmap = vixHist ? vixHist.series.find(s => s.date === d) : null;
      if (!nmap || !vmap) { notes.push(`回填 ${d}: 无历史K线，跳过`); continue; }
      // PE 与 NDX 同步缩放（EPS 短周期内近似不变）
      const peEst = anchor.pe * (nmap.close / anchor.ndx);
      const pctEst = anchor.pe_pct + (peEst - anchor.pe) * slope;
      // 溢价率在缺口区间线性插值
      let premEst = null;
      if (anchor.premium != null && premium != null) {
        const t = (i + 1) / (gaps.length + 1);
        premEst = anchor.premium + (premium - anchor.premium) * t;
      }
      const row = computeRow({
        date: d, pe: peEst, pePct: Math.min(100, Math.max(0, pctEst)), roe: roe,
        vix: vmap.close, ndx: nmap.close, ndx52: ndx52, premium: premEst
      }, state);
      row._est = 'reconstructed';   // 审计标记：该条为历史 K 线重建，非当日实采
      history.push(row);
      notes.push(`回填 ${d}（重建）`);
    }
  }

  // 5) 追加/覆盖今日
  const todayRow = computeRow({
    date: today, pe: pe, pePct: pePct, roe: roe,
    vix: vixNow, ndx: ndxNow, ndx52: ndx52, premium: premium
  }, state);
  if (peStale) todayRow._peStale = true;
  const idx = history.findIndex(h => h.date === today);
  if (idx >= 0) history[idx] = todayRow; else history.push(todayRow);

  history.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  state.history = history.slice(-365);
  state.last_data_hash = `${(+pe).toFixed(2)}|${(+vixNow).toFixed(2)}|${Math.round(ndxNow)}`;
  state.generatedAt = beijingTime();
  state.dataSource = '蛋卷 PE/分位/ROE + Yahoo NDX/VIX/52周高 + 腾讯gtimg现价 + 东财513100净值（指数·汇率修正）';
  state.lastNote = notes.length ? notes.join(' / ') : '全部成功';

  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
  console.log('已更新', statePath);
  console.log('今日', today, JSON.stringify(todayRow));
  console.log('回填', gaps.length ? gaps.join(',') : '无');
  console.log('备注', state.lastNote);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
