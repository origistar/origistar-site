// 稳健仓市场行情拉取：纳指100(NDX) + 比特币(BTC)
// 主源：Yahoo Finance（curl 取数，免 key，美区 runner 可达）
// 输出：assets/market-live.js -> window.MARKET_LIVE
// 更新频率：与全站统一，每日 3 次（08:30 / 16:30 / 23:00 北京时间）
//
// 计算口径：
//   NDX 点位：Yahoo ^NDX 实时价
//   VIX：Yahoo ^VIX 实时价
//   NDX 回撤(DD)：距 52 周高点 = (52w高 - 现价) / 52w高
//   NDX PE：Yahoo QQQ quoteSummary trailingPE 作 NDX-100 近似代理（ETF 与指数同构）
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
function curlJson(url) {
  return new Promise((resolve, reject) => {
    execFile('curl', ['-s', '-m', '25', '-H', 'User-Agent: ' + UA, '-H', 'Accept: application/json', url],
      { maxBuffer: 32 * 1024 * 1024 }, (err, stdout) => {
        if (err) return reject(err);
        try { resolve(JSON.parse(stdout)); } catch (e) { reject(new Error('JSON 解析失败')); }
      });
  });
}
async function fetchYahooChart(sym, range = '1y', interval = '1d') {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=${interval}`;
  const d = await curlJson(url);
  const r = d.chart && d.chart.result && d.chart.result[0];
  if (!r) throw new Error('empty result');
  const m = r.meta || {};
  const q = (r.indicators && r.indicators.quote && r.indicators.quote[0]) || {};
  const closes = (q.close || []).filter(c => c != null);
  const price = m.regularMarketPrice != null ? m.regularMarketPrice : (closes.length ? closes[closes.length - 1] : null);
  return { meta: m, closes };
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

  out.fetchNote = out.errors.length ? ('部分失败：' + out.errors.join(' / ')) : '全部成功';
  const code = `// 自动生成：稳健仓市场快照（NDX / VIX / BTC / AHR999）\n// 生成时间：${out.generatedAt}\nwindow.MARKET_LIVE = ${JSON.stringify(out, null, 2)};\n`;
  fs.writeFileSync(outPath, code, 'utf8');
  console.log('生成', outPath);
  console.log('摘要:', out.fetchNote);
  console.log(JSON.stringify(out.ndx || {}), JSON.stringify(out.btc || {}));
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
