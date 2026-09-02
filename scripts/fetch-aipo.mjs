// A股打新日历 · 新股 + 可转债（新债）自动抓取
//
// 数据源（全部免鉴权）：
//   1) A股新股申购 —— 东方财富 RPTA_APP_IPOAPPLY
//      字段含 MARKET_TYPE（北交所 / 科创板 / 非科创板）与 TRADE_MARKET（交易所），北交所需单独标注
//   2) 可转债申购   —— 东方财富 RPT_BOND_CB_LIST（CORRECODE = 申购代码，CORRECODE_NAME_ABBR = 申购简称）
//   3) 正股实时价   —— 腾讯 gtimg（GBK，批量 30 只/次），用于估算转股价值
//
// 产物：assets/aipo-live.js  ->  window.AIPO_LIVE   （首页「打新日历」卡片读取）
// 用法：node scripts/fetch-aipo.mjs
//
// 口径说明（北交所 vs 沪深，页面需明确区分）：
//   沪深：市值配号 · 中签后缴款 · 不冻结资金 · 中签率极低
//   北交所：全额缴款 · 比例配售 · 申购即冻结资金 2-3 个交易日 · 不要求持有市值 · 需北交所权限

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets', 'aipo-live.js');

const EM_DC = 'https://datacenter-web.eastmoney.com/api/data/v1/get';
const LOOKBACK_DAYS = 20;   // 回看窗口：已申购但尚未上市的也保留
const MAX_ITEMS = 40;       // 每类最多条数

/* ---------- 通用 GET（超时返回空串，绝不抛错） ---------- */
function httpGet(url, headers = {}, enc = 'utf8', timeout = 12000) {
  return new Promise((resolve) => {
    const req = https.get(url, { timeout, headers: { 'User-Agent': 'Mozilla/5.0', ...headers } }, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (enc === 'gbk') {
          try { return resolve(new TextDecoder('gbk').decode(buf)); } catch (_) { /* 回退 utf8 */ }
        }
        resolve(buf.toString('utf8'));
      });
    });
    req.on('error', () => resolve(''));
    req.on('timeout', () => { req.destroy(); resolve(''); });
  });
}

async function emGet(params) {
  const qs = new URLSearchParams({ source: 'WEB', client: 'WEB', ...params }).toString();
  const raw = await httpGet(`${EM_DC}?${qs}`, { Referer: 'https://data.eastmoney.com/' });
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    if (!j.success || !j.result || !Array.isArray(j.result.data)) return null;
    return j.result.data;
  } catch (_) {
    return null;
  }
}

/* ---------- 北京时间 ---------- */
function beijingNow() {
  const now = new Date();
  return new Date(now.getTime() + (8 * 60 + now.getTimezoneOffset()) * 60000);
}
const p2 = (n) => String(n).padStart(2, '0');
function ymd(d) { return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; }
function dateOnly(s) { return s ? String(s).slice(0, 10) : null; }
const r2 = (n) => (n == null || isNaN(n) ? null : Math.round(n * 100) / 100);

/* ---------- 腾讯 gtimg 批量行情（取正股价 + 正股名） ---------- */
// gtimg A股字段：[1] 名称  [2] 代码  [3] 现价  [4] 昨收  [33] 涨跌幅%
function toGtimg(code) {
  const c = String(code).replace(/\D/g, '');
  if (!c) return null;
  if (/^(6|9|5|11|113)/.test(c)) return 'sh' + c;
  if (/^(0|3|12|123|127|128)/.test(c)) return 'sz' + c;
  if (/^(8|4|92)/.test(c)) return 'bj' + c;
  return 'sh' + c;
}
async function fetchQuotes(codes) {
  const out = {};
  const syms = [...new Set(codes.map(toGtimg).filter(Boolean))];
  for (let i = 0; i < syms.length; i += 30) {
    const batch = syms.slice(i, i + 30);
    const raw = await httpGet('https://qt.gtimg.cn/q=' + batch.join(','), { Referer: 'https://gu.qq.com/' }, 'gbk');
    if (!raw) continue;
    for (const line of raw.split(';')) {
      const m = line.match(/v_([a-z0-9]+)="([^"]*)"/i);
      if (!m) continue;
      const a = m[2].split('~');
      const price = +a[3];
      if (!price || isNaN(price)) continue;
      out[m[1]] = { name: a[1], price, chgPct: +a[33] };
    }
  }
  return out;
}

/* ---------- A股新股 ---------- */
const IPO_COLUMNS = [
  'SECURITY_CODE', 'SECURITY_NAME', 'TRADE_MARKET_CODE', 'APPLY_CODE', 'TRADE_MARKET',
  'MARKET_TYPE', 'ISSUE_NUM', 'ONLINE_ISSUE_NUM', 'ONLINE_APPLY_UPPER', 'TOP_APPLY_MARKETCAP',
  'ISSUE_PRICE', 'APPLY_DATE', 'BALLOT_NUM_DATE', 'BALLOT_PAY_DATE', 'LISTING_DATE',
  'AFTER_ISSUE_PE', 'INDUSTRY_PE_NEW', 'MAIN_BUSINESS',
].join(',');

// 板块：北交所单独识别，其余按交易所 + 代码段细分
// 注意 MARKET_TYPE 只有三种取值：'北交所' / '科创板' / '非科创板'
//     ——「非科创板」也包含「科创板」子串，必须先精确匹配，不能只用 includes
function boardOf(row) {
  const mt = String(row.MARKET_TYPE || '').trim();
  const tm = String(row.TRADE_MARKET || '');
  const code = String(row.SECURITY_CODE || '');
  if (mt.includes('北交所') || tm.includes('北京')) return { board: '北交所', isBJ: true, ex: '北交所' };
  if (mt === '科创板') return { board: '科创板', isBJ: false, ex: '沪市' };
  if (tm.includes('上海')) return { board: '沪主板', isBJ: false, ex: '沪市' };
  if (code.startsWith('301') || code.startsWith('302')) return { board: '创业板', isBJ: false, ex: '深市' };
  if (tm.includes('深圳')) return { board: '深主板', isBJ: false, ex: '深市' };
  return { board: mt || '—', isBJ: false, ex: tm.replace('证券交易所', '') };
}

async function fetchStocks(fromDate) {
  const rows = await emGet({
    sortColumns: 'APPLY_DATE,SECURITY_CODE',
    sortTypes: '-1,-1',
    pageSize: '200',
    pageNumber: '1',
    reportName: 'RPTA_APP_IPOAPPLY',
    columns: IPO_COLUMNS,
    filter: `(APPLY_DATE>='${fromDate}')`,
  });
  if (!rows) return null;
  return rows
    .filter((r) => r.SECURITY_CODE && r.APPLY_DATE)
    .map((r) => {
      const b = boardOf(r);
      const biz = String(r.MAIN_BUSINESS || '').replace(/\s+/g, '');
      return {
        code: r.SECURITY_CODE,
        name: r.SECURITY_NAME,
        applyCode: r.APPLY_CODE || r.SECURITY_CODE,
        date: dateOnly(r.APPLY_DATE),
        ballotDate: dateOnly(r.BALLOT_NUM_DATE),   // 中签号公布日
        payDate: dateOnly(r.BALLOT_PAY_DATE),      // 中签缴款日（北交所为 null：申购即冻结）
        listingDate: dateOnly(r.LISTING_DATE),
        board: b.board,
        exchange: b.ex,
        isBJ: b.isBJ,
        price: r2(r.ISSUE_PRICE),
        pe: r2(r.AFTER_ISSUE_PE),
        indPe: r2(r.INDUSTRY_PE_NEW),
        issueNum: r2(r.ISSUE_NUM),                 // 发行总数（万股）
        applyUpper: r.ONLINE_APPLY_UPPER || null,  // 申购上限（股）
        // 同样的 TOP_APPLY_MARKETCAP，沪深与北交所含义完全不同，必须分开标注：
        //   沪深 = 顶格申购所需「持仓市值」（万元）；北交所 = 顶格申购需「冻结资金」（万元）
        topCap: r2(r.TOP_APPLY_MARKETCAP),
        topLabel: b.isBJ ? '顶格冻结资金' : '顶格需市值',
        business: biz.length > 46 ? biz.slice(0, 46) + '…' : biz,
      };
    })
    .sort((a, b2) => (a.date < b2.date ? -1 : a.date > b2.date ? 1 : 0))
    .slice(0, MAX_ITEMS);
}

/* ---------- 可转债（新债） ---------- */
async function fetchBonds(fromDate, quotes) {
  const rows = await emGet({
    sortColumns: 'PUBLIC_START_DATE',
    sortTypes: '-1',
    pageSize: '200',
    pageNumber: '1',
    reportName: 'RPT_BOND_CB_LIST',
    columns: 'ALL',
    filter: `(PUBLIC_START_DATE>='${fromDate}')`,
  });
  if (!rows) return null;
  return rows
    .filter((r) => r.SECURITY_CODE && r.PUBLIC_START_DATE)
    .map((r) => {
      const stockCode = String(r.CONVERT_STOCK_CODE || '');
      const q = quotes && stockCode ? quotes[toGtimg(stockCode)] : null;
      const itp = r.INITIAL_TRANSFER_PRICE > 0 ? r.INITIAL_TRANSFER_PRICE : null;
      // 转股价值 = 100 / 初始转股价 × 正股价
      const tv = q && q.price && itp ? r2((100 / itp) * q.price) : null;
      return {
        code: r.SECURITY_CODE,                       // 转债代码（上市后用）
        name: r.SECURITY_NAME_ABBR,                  // 转债简称
        applyCode: r.CORRECODE || r.SECURITY_CODE,   // 申购代码
        applyName: r.CORRECODE_NAME_ABBR || '',      // 申购简称
        date: dateOnly(r.PUBLIC_START_DATE),
        listingDate: dateOnly(r.LISTING_DATE),
        scale: r2(r.ACTUAL_ISSUE_SCALE),             // 发行规模（亿元）
        rating: r.RATING || '',
        stockCode,
        stockName: (q && q.name) || '',
        stockPrice: (q && q.price) ? r2(q.price) : null,
        transferPrice: itp,                          // 初始转股价
        transferValue: tv,                           // 转股价值
        // 按债券代码前缀判交易所（比 TRADE_MARKET 的 CNSESH/CNSESZ 稳定）：11x=沪 12x=深
        exchange: /^11/.test(String(r.SECURITY_CODE || '')) ? '沪市'
          : /^12/.test(String(r.SECURITY_CODE || '')) ? '深市' : '',
      };
    })
    .sort((a, b2) => (a.date < b2.date ? -1 : a.date > b2.date ? 1 : 0))
    .slice(0, MAX_ITEMS);
}

async function main() {
  const now = beijingNow();
  const today = ymd(now);
  const from = ymd(new Date(now.getTime() - LOOKBACK_DAYS * 86400000));

  console.log(`[aipo] 北京时间 ${ymd(now)} · 取数窗口 ${from} 起`);

  const stocks = await fetchStocks(from);
  console.log(`[aipo] A股新股：${stocks ? stocks.length + ' 只' : '拉取失败'}`);

  // 正股行情（可转债用）
  let bonds = [];
  const bondRows = await emGet({
    sortColumns: 'PUBLIC_START_DATE', sortTypes: '-1', pageSize: '200', pageNumber: '1',
    reportName: 'RPT_BOND_CB_LIST', columns: 'ALL', filter: `(PUBLIC_START_DATE>='${from}')`,
  });
  if (bondRows) {
    const stockCodes = bondRows.map((r) => String(r.CONVERT_STOCK_CODE || '')).filter(Boolean);
    const quotes = await fetchQuotes(stockCodes);
    bonds = await fetchBonds(from, quotes) || [];
    console.log(`[aipo] 可转债：${bonds.length} 只（正股行情 ${Object.keys(quotes).length} 个）`);
  } else {
    console.log('[aipo] 可转债：拉取失败');
  }

  if (!stocks && !bondRows) {
    console.log('[aipo] 两个数据源均失败，保留上一版 aipo-live.js');
    return;
  }

  // 汇总：今日 / 本周内 / 待上市
  const inDays = (d, n) => {
    if (!d) return false;
    const t0 = new Date(today + 'T00:00:00');
    const t1 = new Date(d + 'T00:00:00');
    const diff = Math.round((t1 - t0) / 86400000);
    return diff >= 0 && diff <= n;
  };
  const todayCount = (list) => list.filter((x) => x.date === today).length;
  const weekCount = (list) => list.filter((x) => inDays(x.date, 7)).length;
  const pendingCount = (list) => list.filter((x) => x.date < today && (!x.listingDate || x.listingDate >= today)).length;

  const live = {
    generatedAt: `${ymd(now)} ${p2(now.getHours())}:${p2(now.getMinutes())}`,
    today,
    stocks: stocks || [],
    bonds,
    summary: {
      stockToday: todayCount(stocks || []),
      stockWeek: weekCount(stocks || []),
      stockPending: pendingCount(stocks || []),
      bondToday: todayCount(bonds),
      bondWeek: weekCount(bonds),
      bondPending: pendingCount(bonds),
      bjCount: (stocks || []).filter((s) => s.isBJ).length,
    },
    source: '东方财富数据中心（新股 RPTA_APP_IPOAPPLY / 可转债 RPT_BOND_CB_LIST）+ 腾讯 gtimg（正股行情）',
  };

  const js = '// 由 scripts/fetch-aipo.mjs 自动生成（源：东方财富数据中心 + 腾讯 gtimg）——请勿手改\n'
    + 'window.AIPO_LIVE = ' + JSON.stringify(live) + ';\n';
  fs.writeFileSync(OUT, js);

  const s = live.summary;
  console.log(`[aipo] 已生成 aipo-live.js · 新股 今日${s.stockToday}/本周${s.stockWeek}/待上市${s.stockPending}（北交所 ${s.bjCount}） · 新债 今日${s.bondToday}/本周${s.bondWeek}/待上市${s.bondPending}`);
}

main();
