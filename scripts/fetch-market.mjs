// 稳健仓市场行情拉取：纳指100(NDX) + 比特币(BTC)
// 主源：Yahoo Finance（curl 取数，免 key，美区 runner 可达）
// 输出：assets/market-live.js -> window.MARKET_LIVE
// 更新频率：与全站统一，每日 3 次（08:30 / 16:30 / 23:00 北京时间）
//
// 计算口径：
//   NDX 点位：Yahoo ^NDX 实时价
//   VIX：Yahoo ^VIX 实时价
//   NDX 回撤(DD)：距 52 周高点 = (52w高 - 现价) / 52w高
//   场内 ETF 溢价率 = (场内现价 - 估算净值) / 估算净值
//     估算净值 = 最新公布净值 × (NDX 现价 / NDX 净值日收盘) × (USDCNY 净值日 / USDCNY 现价)
//     —— QDII 净值 T+2~T+3 滞后，直接用滞后净值会把指数涨跌误算成溢价，故做指数与汇率双向修正
//      ETF 现价：东财 push2（secid 1.513100 / 0.159941 …）
//      最新净值：东财 f10/lsjz（DWJZ 单位净值 + FSRQ 净值日期）
//   BTC 现价：Yahoo BTC-USD
//   BTC 200MA：BTC-USD 近 200 日收盘均值
//   BTC 回撤：距 52 周高点
//   AHR999 = (现价 / 200MA) × (现价 / 2^年数)，年数 = (今 - 2009-01-03) / 365.25
//   MSTR：Yahoo MSTR 现价（华尔街情绪代理）

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outPath = path.join(root, 'assets', 'market-live.js');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

function beijingTime() {
  const t = new Date(Date.now() + 8 * 3600 * 1000);
  const pad = n => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())} 北京时间`;
}

// Yahoo 双域名容灾：实测 query1 会整站不可达（HTTP 000），query2 正常。
// 两域名轮换重试，任一可用即返回 —— 避免单一域名故障导致整站数据停更。
const YAHOO_HOSTS = ['query2.finance.yahoo.com', 'query1.finance.yahoo.com'];
function curlJson(url, extraHeaders = []) {
  const args = ['-s', '-m', '25', '-H', 'User-Agent: ' + UA, '-H', 'Accept: application/json'];
  for (const h of extraHeaders) args.push('-H', h);
  args.push(url);
  return new Promise((resolve, reject) => {
    execFile('curl', args,
      { maxBuffer: 32 * 1024 * 1024 }, (err, stdout) => {
        if (err) return reject(err);
        if (!stdout || !stdout.trim()) return reject(new Error('空响应'));
        try { resolve(JSON.parse(stdout)); } catch (e) { reject(new Error('JSON 解析失败')); }
      });
  });
}
// 东财基金净值接口必须带 Referer，否则返回 HTML 404
const EM_FUND_REF = ['Referer: http://fund.eastmoney.com/'];
async function curlJsonRetry(path) {
  let lastErr;
  for (const host of YAHOO_HOSTS) {
    try { return await curlJson(`https://${host}${path}`); }
    catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('全部 Yahoo 域名失败');
}
async function fetchYahooChart(sym, range = '1y', interval = '1d') {
  const path = `/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=${interval}`;
  const d = await curlJsonRetry(path);
  const r = d.chart && d.chart.result && d.chart.result[0];
  if (!r) throw new Error('empty result');
  const m = r.meta || {};
  const q = (r.indicators && r.indicators.quote && r.indicators.quote[0]) || {};
  const closes = (q.close || []).filter(c => c != null);
  const price = m.regularMarketPrice != null ? m.regularMarketPrice : (closes.length ? closes[closes.length - 1] : null);
  // 日线带日期：用于按基金净值日期取对应收盘价（溢价率修正需要）
  const ts = r.timestamp || [];
  const series = [];
  for (let i = 0; i < ts.length; i++) {
    const c = q.close && q.close[i];
    if (c != null) series.push({ date: new Date(ts[i] * 1000), close: c });
  }
  return { meta: m, closes, series };
}
// 取 <= 指定日期的最近一个交易日收盘价
function closeOnOrBefore(series, date) {
  let best = null;
  for (const p of series) { if (p.date <= date) best = p; else break; }
  return best ? best.close : null;
}
function sma(arr, n) {
  if (arr.length < n) return null;
  let s = 0; for (let i = arr.length - n; i < arr.length; i++) s += arr[i];
  return s / n;
}

async function main() {
  const out = { generatedAt: beijingTime(), updateFreq: '每日 3 次（08:30 / 16:30 / 23:00 北京时间）', source: 'Yahoo Finance', errors: [] };
  const mark = (e) => { out.errors.push(e); };

  // ---------- NDX ----------
  // 注：NDX PE-TTM 无可靠免费自动源（Yahoo quoteSummary 需 crumb 鉴权、Nasdaq API 不返回）。
  // PE 为慢变量，由 data.js 人工复核提供；本脚本只自动更新点位 / VIX / 回撤，
  // 故不输出 pe 字段，页面用 Object.assign 合并时自然回落到 data.js 的手动值。
  try {
    const ndx = await fetchYahooChart('^NDX');
    const price = ndx.meta.regularMarketPrice;
    const hi = ndx.meta.fiftyTwoWeekHigh;
    const dd = (hi && price) ? (hi - price) / hi * 100 : null;
    const vix = (await fetchYahooChart('^VIX')).meta.regularMarketPrice;
    out.ndx = {
      ndx: price, vix: vix, dd: dd != null ? +dd.toFixed(2) : null,
      dataSource: 'Yahoo Finance'
    };
  } catch (e) { mark('NDX: ' + (e.message || e)); out.ndx = null; }

  // ---------- BTC ----------
  try {
    const b = await fetchYahooChart('BTC-USD');
    const price = b.meta.regularMarketPrice;
    const hi = b.meta.fiftyTwoWeekHigh;
    const dd52w = (hi && price) ? (hi - price) / hi * 100 : null;
    const sma200 = sma(b.closes, 200);
    let ahr999 = null;
    if (sma200) {
      const genesis = Date.parse('2009-01-03');
      const years = (Date.now() - genesis) / (365.25 * 86400000);
      const ratio2 = Math.pow(2, years);
      ahr999 = (price / sma200) * (price / ratio2);
    }
    let mstr = null;
    try { mstr = (await fetchYahooChart('MSTR')).meta.regularMarketPrice; } catch (e) { mark('MSTR: ' + (e.message || e)); }
    out.btc = {
      price: price, ahr999: ahr999 != null ? +ahr999.toFixed(4) : null,
      p200ma: sma200 ? +(price / sma200).toFixed(3) : null,
      dd52w: dd52w != null ? +dd52w.toFixed(1) : null,
      mstr: mstr, dataSource: 'Yahoo Finance'
    };
  } catch (e) { mark('BTC: ' + (e.message || e)); out.btc = null; }

  // ---------- 场内纳指 ETF 溢价率 ----------
  // 用户策略阈值：<5% 当天改买场内 ETF，>8% 卖出换回场外 —— 必须自动、准确、可审计
  try {
    const ETF_LIST = [
      { code: '513100', secid: '1.513100', name: '纳指ETF国泰' },
      { code: '159941', secid: '0.159941', name: '纳指ETF广发' },
      { code: '513300', secid: '1.513300', name: '纳斯达克ETF' },
      { code: '159632', secid: '0.159632', name: '纳斯达克ETF' },
      { code: '513390', secid: '1.513390', name: '纳指科技ETF' }
    ];
    // 1) NDX 日线 + 现价（用于按净值日修正）
    const ndxChart = await fetchYahooChart('^NDX');
    const ndxNow = ndxChart.meta.regularMarketPrice;
    // 2) 美元人民币（QDII 净值以美元资产计，需汇率修正）
    let fxNow = null, fxSeries = [];
    try {
      const fx = await fetchYahooChart('CNY=X');
      fxNow = fx.meta.regularMarketPrice;
      fxSeries = fx.series;
    } catch (e) { mark('USDCNY: ' + (e.message || e)); }

    const etfs = [];
    for (const etf of ETF_LIST) {
      try {
        // 3) 场内现价（东财 push2）
        const qRaw = await curlJson(`https://push2.eastmoney.com/api/qt/stock/get?secid=${etf.secid}&fields=f43,f57,f58,f169,f170`);
        const qd = qRaw && qRaw.data;
        const price = qd && qd.f43 != null ? qd.f43 / 1000 : null;
        if (!price) throw new Error('现价缺失');
        // 4) 最新公布净值 + 净值日期（东财 f10/lsjz）
        const jzRaw = await curlJson(`https://api.fund.eastmoney.com/f10/lsjz?fundCode=${etf.code}&pageIndex=1&pageSize=1`, EM_FUND_REF);
        const jz = jzRaw && jzRaw.Data && jzRaw.Data.LSJZList && jzRaw.Data.LSJZList[0];
        if (!jz || !jz.DWJZ) throw new Error('净值缺失');
        const nav = parseFloat(jz.DWJZ);
        const navDate = new Date(jz.FSRQ + 'T23:59:59Z');
        // 5) 指数修正 + 汇率修正
        const ndxThen = closeOnOrBefore(ndxChart.series, navDate);
        const fxThen = fxSeries.length ? closeOnOrBefore(fxSeries, navDate) : null;
        let adjNav = nav, basis = '最新公布净值（未修正）';
        if (ndxNow && ndxThen) {
          const idxRatio = ndxNow / ndxThen;
          const fxRatio = (fxNow && fxThen) ? (fxThen / fxNow) : 1;
          adjNav = nav * idxRatio * fxRatio;
          basis = `净值 ${nav} × 指数 ${idxRatio.toFixed(4)} × 汇率 ${fxRatio.toFixed(4)}`;
        }
        const premiumRaw = (price - nav) / nav * 100;
        const premium = (price - adjNav) / adjNav * 100;
        etfs.push({
          code: etf.code, name: jz.FSRQ ? (qd && qd.f58) || etf.name : etf.name,
          price: +price.toFixed(4),
          nav: +nav.toFixed(4), navDate: jz.FSRQ,
          adjNav: +adjNav.toFixed(4),
          premium: +premium.toFixed(2),
          premiumRaw: +premiumRaw.toFixed(2),
          basis: basis,
          signal: premium < 5 ? '溢价<5% · 可买场内' : (premium > 8 ? '溢价>8% · 换回场外' : '5%~8% · 维持场外'),
          dataSource: '东财 push2 + 东财基金净值 + Yahoo NDX/CNY'
        });
      } catch (e) { mark(`ETF ${etf.code}: ` + (e.message || e)); }
    }
    out.etf = {
      list: etfs,
      note: '溢价率经指数与汇率修正；QDII 净值 T+2~T+3 滞后，未经修正的 raw 值仅供对照',
      updateAt: beijingTime()
    };
  } catch (e) { mark('ETF溢价率: ' + (e.message || e)); out.etf = null; }

  out.fetchNote = out.errors.length ? ('部分失败：' + out.errors.join(' / ')) : '全部成功';
  const code = `// 自动生成：稳健仓市场快照（NDX / VIX / BTC / AHR999）\n// 生成时间：${out.generatedAt}\nwindow.MARKET_LIVE = ${JSON.stringify(out, null, 2)};\n`;
  fs.writeFileSync(outPath, code, 'utf8');
  console.log('生成', outPath);
  console.log('摘要:', out.fetchNote);
  console.log(JSON.stringify(out.ndx || {}), JSON.stringify(out.btc || {}));
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
