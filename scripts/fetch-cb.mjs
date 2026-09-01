// 可转债双低筛选 · 主站页数据自动刷新
// 数据源：origistar.github.io/convertible-bond-screener（旧独立站，每日北京 22:00 由其自身 Actions 更新）
//   1) history.csv              —— 每日聚合（价格中位数/双低中位数/双低<130数量/强赎关注/结论/空仓信号）
//   2) output/候选清单_<date>.csv —— 安全双低候选池（评级≥AA-、规模2~30亿、价≤130）
//   3) index.html               —— 旧站生成页，解析 KPI 卡（可交易转债）与强赎关注区 Top10
// 产物：assets/cb-live.js（window.CB_LIVE），页面 low-risk/cb-screener.html 读取渲染，失败时保留内置快照兜底
// 用法：node scripts/fetch-cb.mjs

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets', 'cb-live.js');
const BASE = 'https://origistar.github.io/convertible-bond-screener';

/* ---------- 通用 GET（带超时，失败返回空串，绝不抛错） ---------- */
function httpGet(url, enc = 'utf8') {
  return new Promise((resolve) => {
    const req = https.get(
      url,
      { timeout: 12000, headers: { 'User-Agent': 'Mozilla/5.0' } },
      (res) => {
        const chunks = [];
        res.on('data', (d) => chunks.push(d));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          resolve(enc === 'gbk' ? safeGbk(buf) : buf.toString('utf8'));
        });
      }
    );
    req.on('error', () => resolve(''));
    req.on('timeout', () => { req.destroy(); resolve(''); });
  });
}
function safeGbk(buf) {
  try { return new TextDecoder('gbk').decode(buf); } catch (_) { return buf.toString('utf8'); }
}

function parseCsv(text) {
  if (!text) return [];
  const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  const header = lines[0].split(',');
  return lines.slice(1).filter((l) => l.trim()).map((l) => {
    const cells = l.split(',');
    const row = {};
    header.forEach((h, i) => { row[h.trim()] = (cells[i] ?? '').trim(); });
    return row;
  });
}

const r1 = (n) => Math.round(n * 10) / 10;
// 北京时间时间戳（与全站口径一致）：'YYYY-MM-DD HH:MM'
const nowBeijing = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');

async function main() {
  /* 1) history.csv：全量历史 + 最新一行聚合 */
  const historyCsv = await httpGet(BASE + '/history.csv');
  const hist = parseCsv(historyCsv);
  if (!hist.length) { console.log('[cb] history.csv 拉取失败，跳过（页面用兜底快照）'); return; }
  const latest = hist[hist.length - 1];
  const date = latest.date; // YYYYMMDD
  const series = {
    labels: hist.map((h) => `${h.date.slice(4, 6)}-${h.date.slice(6, 8)}`),
    price: hist.map((h) => Number(h.price_median)),
    cnt: hist.map((h) => Number(h.dl130_count)),
  };
  // 完整历史行（升序），供 cb-history.html 动态渲染每日清单
  const history = hist.map((h) => ({
    date: h.date,
    priceMedian: Number(h.price_median),
    dual: Number(h.dl_median),
    dl130: Number(h.dl130_count),
    redeem: Number(h.redeem_watch),
    verdict: h.verdict || '',
    empty: h.empty_signal || '',
  }));

  /* 2) 候选清单 CSV（日期与 history 最新行一致） */
  const csvUrl = BASE + '/output/' + encodeURIComponent(`候选清单_${date}.csv`);
  const candCsv = await httpGet(csvUrl);
  const cand = parseCsv(candCsv);
  const safe = cand
    .map((r) => ({
      code: r['转债代码'], name: r['转债名称'],
      price: r1(Number(r['转债价格'])), dlv: r1(Number(r['双低值'])),
      prem: r1(Number(r['转股溢价率%'])), rating: r['评级'],
      scale: r1(Number(r['发行规模(亿)'])),
      anchor: r['价格超买入上限'] === 'True' ? '偏贵' : (r['纯债价值'] ? '—' : '—'),
    }))
    .sort((a, b) => a.dlv - b.dlv)
    .slice(0, 20);
  if (!cand.length) console.log('[cb] 候选清单拉取失败（当日常见于筛选停跑），仅更新聚合');

  /* 3) 旧站 index.html：解析 KPI（可交易转债）与强赎关注区 Top10 */
  const oldHtml = await httpGet(BASE + '/index.html');
  let tradable = null, redeem = [];
  if (oldHtml) {
    const kpi = oldHtml.match(/可交易转债<\/div>\s*<div class=.v.>([\d.]+)/);
    if (kpi) tradable = Number(kpi[1]);
    // 两张表：8 列=安全池（用 CSV 代替），6 列=强赎关注区
    const rows = [...oldHtml.matchAll(/<tr><td>(\d{6})<\/td>([\s\S]*?)<\/tr>/g)];
    for (const m of rows) {
      const cells = m[2].match(/<td[^>]*>([^<]*)<\/td>/g);
      if (!cells || cells.length !== 5) continue; // 6 列行 = 代码 + 5 个数据列
      const txt = cells.map((c) => c.replace(/<[^>]*>/g, '').trim());
      redeem.push({ code: m[1], name: txt[0], price: r1(Number(txt[1])), prem: txt[2], dlv: r1(Number(txt[3])), rating: txt[4] });
    }
  }

  const live = {
    generatedAt: nowBeijing(),
    date,
    verdict: latest.verdict || '',
    emptySignal: latest.empty_signal || '',
    badge: latest.empty_signal === '触发' ? '⚠️ 空仓观望' : '可观察',
    kpis: {
      tradable: tradable ?? null,
      priceMedian: Number(latest.price_median),
      priceMean: Number(latest.price_mean),
      premiumMedian: Number(latest.premium_median),
      dlMedian: Number(latest.dl_median),
      dl130: Number(latest.dl130_count),
      dl140: Number(latest.dl140_count),
      redeemWatch: Number(latest.redeem_watch),
    },
    series,
    history,
    safe,
    redeem,
    source: 'origistar.github.io/convertible-bond-screener · 每日北京 22:00',
  };

  const js = '// 由 scripts/fetch-cb.mjs 自动生成（源：可转债双低每日筛选独立站）——请勿手改\n'
    + 'window.CB_LIVE = ' + JSON.stringify(live) + ';\n';
  fs.writeFileSync(OUT, js);
  console.log(`[cb] cb-live.js 已生成：日期 ${date} · 双低<130 ${live.kpis.dl130} 只 · 候选 ${safe.length} 只 · 强赎区 ${redeem.length} 只 · 可交易 ${live.kpis.tradable ?? '—'}`);
}

main();
