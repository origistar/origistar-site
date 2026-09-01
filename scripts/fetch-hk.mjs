// 港股打新 / 待入通 数据自动刷新
// 数据源：腾讯财经 gtimg（港股+A股实时行情，免鉴权）+ 新浪财经（HKD/CNY 汇率）
// 产物：low-risk/hk-data.json 内的 _price / _chgFromIpo / _aPrice / _ahPremium / _ahPotential / updated
// 说明：保荐 / 锁定期 / 解禁日 / 评分 / 建议 均为「系统生成字段」，并非人工笔记：
//   · 保荐人/基石/评分/建议 来自招股披露/研究库（旧 hk-ipo-tracker 的 data.json 自动填充，再由 enrich-hk.mjs 继承）
//   · 锁定期/解禁日 由 enrich-hk.mjs 按港股 IPO 标准规则推算（基石6个月/控股股东12个月，自上市日）
//   本脚本只回填行情，绝不覆盖上述系统字段。仅「待入通 listed 清单」本身来自活报告手工维护。
// 用法：node scripts/fetch-hk.mjs

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'low-risk', 'hk-data.json');

/* ---------- 北京时间 ---------- */
function beijingNow() {
  const now = new Date();
  return new Date(now.getTime() + (8 * 60 + now.getTimezoneOffset()) * 60000);
}
const p2 = (n) => String(n).padStart(2, '0');

/* ---------- 通用 GET（带超时，失败返回空串，绝不抛错） ---------- */
// enc: 'gbk' 用于腾讯 gtimg（GBK 编码），'utf8' 用于东财/新浪
function httpGet(url, headers = {}, enc = 'utf8') {
  return new Promise((resolve) => {
    const req = https.get(
      url,
      { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0', ...headers } },
      (res) => {
        const chunks = [];
        res.on('data', (d) => chunks.push(d));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          if (enc === 'gbk') {
            try { return resolve(new TextDecoder('gbk').decode(buf)); } catch (_) { /* 回退 */ }
          }
          resolve(buf.toString('utf8'));
        });
      }
    );
    req.on('error', () => resolve(''));
    req.on('timeout', () => { req.destroy(); resolve(''); });
  });
}

/* ---------- 港股通入通门槛（亿港元） ----------
   · A+H 股：H 股自动纳入，无市值门槛
   · 同股不同权（-W）：上市满 6 个月 + 20 个交易日，且市值 ≥ 200 亿、成交额 ≥ 60 亿
   · 一般新股：走恒生综合指数半年度检讨（3 月 / 9 月生效），小型股门槛约 100 亿
   门槛随指数检讨浮动，此处取用户速查表沿用值，脚本只负责算出「当前市值距门槛多远」。 */
const CONNECT_NEED_WVR = 200;
const CONNECT_NEED_NORMAL = 100;
function connectNeed(s) {
  if (s.isAH) return 0;
  if (/-W\b|-W$/.test(String(s.name || ''))) return CONNECT_NEED_WVR;
  return CONNECT_NEED_NORMAL;
}

/* ---------- HKD/CNY 汇率（新浪） ---------- */
async function fetchRate(prev) {
  const raw = await httpGet('https://hq.sinajs.cn/list=fx_shkdcny', {
    Referer: 'https://finance.sina.com.cn/',
  });
  const m = raw.match(/="([^"]*)"/);
  if (m) {
    const r = +m[1].split(',')[1];
    if (r > 0 && r < 2) return r;
  }
  return prev || 0.92;
}

/* ---------- 腾讯 gtimg 批量行情 ---------- */
// 返回 { sym: {price, prev, chgPct, name, floatCap, totalCap} }
// gtimg 港股字段下标（实测 00700 / 09988 / 03690 三只校验通过）：
//   [3] 现价  [4] 昨收  [33] 涨跌幅%  [44] 流通市值(亿港元)  [45] 总市值(亿港元)
async function fetchQuotes(syms) {
  const out = {};
  // 每批 30 个，避免 URL 过长
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
      const item = { name: a[1], price, prev: +a[4], chgPct: +a[33] };
      if (m[1].startsWith('hk')) {
        const fc = +a[44], tc = +a[45];
        if (fc > 0) item.floatCap = fc;   // 亿港元
        if (tc > 0) item.totalCap = tc;   // 亿港元
      }
      out[m[1]] = item;
    }
  }
  return out;
}

/* ---------- 港股新股自动发现（东财港股资料表） ---------- */
// 数据源 RPT_HKF10_INFO_ORGPROFILE 的 LISTING_DATE 字段可查未来日期，
// 因此上市日 > 今天 = 招股中/待上市，<= 今天 = 已上市次新。
// 这解决了"新上市的不会自动出现、老的不自动移除"的问题。
const EM_DC = 'https://datacenter-web.eastmoney.com/api/data/v1/get';

// 噪音 1：供股 / 拆股 / 合股临时代码 / 债券（如「高地股份(四千)」= 每手 4000 股的合股代码）
const NOISE_RE = /(旧|股权|RTS|债权|票据|优先股|FRN)/;
// 噪音 2：中文数字括号或后缀（(四千) / -二万 / -八千…）一律是临时交易代码
const TEMP_CODE_RE = /\((?:[一二三四五六七八九十百千万零两]+)\)/;
const TEMP_SUFFIX_RE = /[-－]\s*(?:[一二三四五六七八九十百千万零两]{1,4})\s*$/;
// 噪音 3：公司简介里提到「股票代码 01803.HK」「股份代号:1218」= 老公司换代码，非新股
const RECODE_RE = /(?:股票代码|股份代号|股份代码|证券代码|股票代号)\s*[:：]?\s*(\d{4,5})/;

function isRealNewListing(code, name, row) {
  if (!/^\d{5}$/.test(code)) return false;          // 排除 85160 这类债券代码
  if (parseInt(code, 10) >= 40000) return false;    // 4xxxx 债务证券、8xxxx 债券
  if (NOISE_RE.test(name || '')) return false;      // 供股/拆股/债券
  if (TEMP_CODE_RE.test(name || '')) return false;    // (四千)/(二万) 临时代码
  if (TEMP_SUFFIX_RE.test(name || '')) return false;  // 阿尔法企业-二万（无括号的临时代码）
  if (/^[A-Z0-9\s.\-]+$/.test(name || '')) return false; // 纯英文数字名（如 "EFN 3.00 2808"）
  // 港股通标的不含创业板，打新也不看 GEM
  if (row && row.BELONG_MARKET && row.BELONG_MARKET !== '香港主板') return false;
  // 简介里出现别的股票代码 → 老股换代码（如驴迹 02900 实为 01745、北京体育文化 02908 实为 01803）
  if (row) {
    const prof = `${row.ORG_PROFILE || ''} ${row.ORG_NAME || ''}`;
    const m = prof.match(RECODE_RE);
    if (m && m[1].padStart(5, '0') !== code) return false;
  }
  return true;
}

async function discoverHK(backDays = 120, fwdDays = 60) {
  const now = new Date();
  const fmt = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const from = fmt(new Date(now.getTime() - backDays * 864e5));
  const to = fmt(new Date(now.getTime() + fwdDays * 864e5));
  const filter = `(LISTING_DATE>'${from}')(LISTING_DATE<'${to}')`;
  const cols = 'SECURITY_CODE,SECURITY_NAME_ABBR,LISTING_DATE,BELONG_INDUSTRY,BELONG_MARKET,ORG_PROFILE';

  const rows = [];
  try {
    for (let page = 1; page <= 5; page++) {
      const url = `${EM_DC}?reportName=RPT_HKF10_INFO_ORGPROFILE&columns=${cols}`
        + `&sortColumns=LISTING_DATE&sortTypes=-1&pageSize=200&pageNumber=${page}`
        + `&filter=${encodeURIComponent(filter)}`;
      const j = await httpGetJson(url);
      const data = (j && j.result && j.result.data) || [];
      rows.push(...data);
      if (data.length < 200) break;   // 已取完
    }
  } catch (e) {
    return { ok: false, error: e.message || String(e), list: [], total: 0 };
  }

  const rejected = [];
  const list = rows
    .filter((r) => {
      const ok = isRealNewListing(r.SECURITY_CODE, r.SECURITY_NAME_ABBR, r);
      if (!ok) rejected.push(`${r.SECURITY_CODE} ${r.SECURITY_NAME_ABBR}`);
      return ok;
    })
    .map((r) => ({
      code: r.SECURITY_CODE,
      name: r.SECURITY_NAME_ABBR,
      listDate: String(r.LISTING_DATE || '').slice(0, 10) || null,
      industry: r.BELONG_INDUSTRY || null,
      market: r.BELONG_MARKET || null
    }));
  if (rejected.length) console.log('过滤噪音 ' + rejected.length + ' 条：' + rejected.slice(0, 12).join('、') + (rejected.length > 12 ? ' …' : ''));
  return { ok: true, list, total: rows.length };
}

function httpGetJson(url) {
  return httpGet(url).then((raw) => {
    if (!raw || !raw.trim()) throw new Error('空响应');
    return JSON.parse(raw);
  });
}

// 代码规范化：hk-data.json 用 "09615.HK"，东财用 "09615" → 统一 5 位数字
function normCode(code) {
  const n = String(code || '').replace(/[^\d]/g, '');
  return n ? n.padStart(5, '0') : null;
}

// 排除清单：自动发现的干扰源（非真实招股 IPO）
// 02913「天成控股」= 02110 天成控股（老仙股，曾用名裕勤控股）股本重组（十合一+股本削减）后换码上市（2026-09-03），
// 东财 IPO 日历误判为新股（LISTING_DATE 未来值），无发行价/无保荐人/无公开发售，严禁进打新池。
// 判定依据：与 02110 同名同股本（432,000,000 股）同董事长同注册地；腾讯行情 0 价格壳；etnet 无资料。
const AUTO_SKIP_CODES = new Set(['02913']);

// 合并：保留全部系统/研究字段，只更新自动字段；新发现标的的研究字段留空，由 enrich-hk.mjs 补全（标准锁定期自动推算、保荐等从研究库继承）
// 新股上市后仍保留在打新页的天数（可看首日 / 上市以来表现），超期才移除
const IPO_KEEP_DAYS = 7;
function isoMinusDays(iso, n) {
  const d = new Date(Date.parse(iso + 'T00:00:00Z') - n * 86400000);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
}

// 方案A 约束：待入通清单由用户从活报告手工维护，本函数只自动发现「招股中」IPO；
// 上市后 IPO_KEEP_DAYS 天内仍留在打新页（可看首日表现），超期自动移除，不转入 listed（避免污染待入通人工池）。
function mergeDiscovered(stocks, discovered, today, errors) {
  const grace = isoMinusDays(today, IPO_KEEP_DAYS);
  const byCode = new Map();
  stocks.forEach((s) => { const k = normCode(s.code); if (k) byCode.set(k, s); });

  const seen = new Set();
  for (const d of discovered) {
    const k = d.code;
    // 排除干扰源（股本重组换码等非 IPO），已入库的标记忆移除
    if (AUTO_SKIP_CODES.has(k)) {
      const ex = byCode.get(k);
      if (ex && ex._autoAdded) ex._markRemove = true;
      continue;
    }
    seen.add(k);
    let board = (d.listDate && d.listDate > today) ? 'ipo'
      : (d.listDate && d.listDate >= grace) ? 'ipo' : 'listed';
    const existing = byCode.get(k);
    // 上市宽限期只适用于「自动发现」的打新标的；人工维护的待入通标的绝不改判为 ipo
    if (board === 'ipo' && existing && !existing._autoAdded) board = existing.board;

    if (existing) {
      if (existing._autoAdded && board === 'listed') {
        // 机器发现的 IPO 已上市：从打新页移除，待入通由用户手工维护
        existing._markRemove = true;
        continue;
      }
      // 已存在：只更新自动可得字段，系统/研究字段一律不动
      existing.listDate = d.listDate || existing.listDate;
      if (!existing.industry && d.industry) existing.industry = d.industry;
      if (!existing.name || existing.name === existing.code) existing.name = d.name;
      existing.board = board;
      if (existing.board === 'ipo' && !existing.category) existing.category = 'ipo';
      if (board === 'ipo' && d.listDate && d.listDate <= today) existing._justListed = true;
      existing._autoUpdated = true;
      continue;
    }

    // 新增：只加入仍在招股中的 IPO，不自动加入已上市标的
    if (board !== 'ipo') continue;

    const item = {
      board: 'ipo',
      category: 'ipo',
      code: k + '.HK',
      name: d.name,
      industry: d.industry,
      listDate: d.listDate,
      ipoPrice: null, ipoDate: null, deadline: null,
      isAH: null, aCode: null, ahRule: '',   // 留空，由 enrich-hk.mjs 自动识别 A+H
      cornerstonePct: null, cornerN: null, corners: [],
      sponsor: null, leader: null, advice: null,
      connectDate: null, unlockDate: null, floatShares: null,
      lockup: null, score: null, riskLevel: null, risk: false,
      // 注：上面这些「系统字段」留空，enrich 阶段会补全——标准锁定期自动推算、保荐等从研究库继承，无需人工填
      raiseCap: null, toConnectPct: null, totalShares: null,
      _autoAdded: true
    };
    byCode.set(k, item);
    stocks.push(item);
  }

  // 移除：已不在发现窗口内、已上市的自动 IPO、或未标记人工保留的过期标的
  const removed = [];
  for (let i = stocks.length - 1; i >= 0; i--) {
    const s = stocks[i];
    const k = normCode(s.code);
    if (!k) continue;                    // 无代码的人工条目（潜在标的）保留
    if (s._markRemove) {                 // 自动 IPO 已上市
      removed.push(`${s.name}(${s.code})`);
      stocks.splice(i, 1);
      continue;
    }
    if (seen.has(k)) continue;           // 在窗口内，保留
    if (s.manual === true) continue;     // 人工标记保留
    // 有实质研究内容的也保留，避免误删用户心血
    if (s.advice || s.connectDate || (s.corners && s.corners.length)) continue;
    removed.push(`${s.name}(${s.code})`);
    stocks.splice(i, 1);
  }
  if (removed.length) {
    console.log('自动移出过期标的 ' + removed.length + ' 只：' + removed.join('、'));
  }
  return { removed };
}

// 全站统一北京时间（CI 跑 UTC，直接取本地日期会错 8 小时）
function todayISO() {
  const bj = new Date(Date.now() + 8 * 3600 * 1000);
  return `${bj.getUTCFullYear()}-${p2(bj.getUTCMonth() + 1)}-${p2(bj.getUTCDate())}`;
}

/* ---------- 代码 → gtimg 符号 ---------- */
function hkSym(code) {
  const num = String(code || '').replace(/[^\d]/g, '');
  return num ? 'hk' + num.padStart(5, '0') : null;
}
function aSym(aCode) {
  if (!aCode) return null;
  const num = aCode.replace(/[^\d]/g, '');
  if (!num) return null;
  return (aCode.toUpperCase().endsWith('.SH') ? 'sh' : 'sz') + num;
}

/* ---------- 主流程 ---------- */
async function main() {
  if (!fs.existsSync(FILE)) {
    console.error('缺少 ' + FILE + '，跳过');
    process.exit(0);
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (e) {
    console.error('hk-data.json 解析失败，保留原文件：' + e.message);
    process.exit(0);
  }
  const stocks = Array.isArray(data.stocks) ? data.stocks : [];
  if (!stocks.length) { console.error('无标的，跳过'); process.exit(0); }

  const errors = [];

  /* 0) 自动发现新股（东财港股资料表按上市日期筛选，可查未来日期 → 仅招股中 IPO）
     待入通 listed 清单由用户从活报告手工维护，本步骤不再自动追加已上市标的。 */
  const discover = await discoverHK(120, 60);
  if (discover.ok) {
    const before = stocks.length;
    mergeDiscovered(stocks, discover.list, todayISO(), errors);
    console.log(`自动发现 IPO：候选 ${discover.total} 条 → 真实 ${discover.list.length} 只；合并后 ${before} → ${stocks.length} 只`);
  } else {
    console.log('自动发现失败（保留既有名单）：' + discover.error);
    errors.push('自动发现失败：' + discover.error);
  }

  /* 1) 汇率 */
  const rate = await fetchRate(data.hkdCnyRate);
  data.hkdCnyRate = +rate.toFixed(6);
  console.log(`汇率 HKD/CNY = ${data.hkdCnyRate}`);

  /* 2) 港股行情：已上市标的（含刚上市、仍在打新页宽限期内的新股） */
  const today0 = todayISO();
  const isLive = (s) => s.board === 'listed'
    || (s.board === 'ipo' && s.listDate && String(s.listDate).slice(0, 10) <= today0);
  const listed = stocks.filter((s) => isLive(s) && hkSym(s.code));
  const hkSyms = [...new Set(listed.map((s) => hkSym(s.code)))];
  const hkQ = await fetchQuotes(hkSyms);
  let ok = 0, fail = 0, capOk = 0;
  for (const s of listed) {
    const q = hkQ[hkSym(s.code)];
    if (q) {
      s._price = q.price;
      if (s.ipoPrice) s._chgFromIpo = +((q.price / s.ipoPrice - 1) * 100).toFixed(2);
      s._floatCap = q.floatCap != null ? +q.floatCap.toFixed(2) : null;   // 亿港元
      s._mktCap = q.totalCap != null ? +q.totalCap.toFixed(2) : null;     // 亿港元
      if (s._mktCap) capOk++;
      ok++;
    } else {
      fail++;
      errors.push(s.name + '(' + s.code + ') 行情缺失');
    }
  }
  console.log(`港股行情 成功 ${ok} / 失败 ${fail}（其中市值 ${capOk} 只）`);

  /* 3) AH 股：拉 A 股价，算真实溢价 / 潜在溢价 */
  const ahList = stocks.filter((s) => s.isAH && aSym(s.aCode));
  if (ahList.length) {
    const aQ = await fetchQuotes([...new Set(ahList.map((s) => aSym(s.aCode)))]);
    let ahOk = 0;
    for (const s of ahList) {
      const q = aQ[aSym(s.aCode)];
      if (!q) continue;
      s._aPrice = q.price;
      if (s._price) s._ahPremium = +((q.price * rate) / s._price - 1).toFixed(6) * 100;
      else if (s.ipoPrice) s._ahPotential = +((q.price * rate) / s.ipoPrice - 1).toFixed(6) * 100;
      ahOk++;
    }
    console.log(`AH 股 A 股价 成功 ${ahOk} / ${ahList.length}`);
  }

  /* 4) 上市宽限期：招股中标的上市后仍留打新页 IPO_KEEP_DAYS 天（可看首日 / 上市以来表现），超期移除 */
  const bj = beijingNow();
  const today = `${bj.getFullYear()}-${p2(bj.getMonth() + 1)}-${p2(bj.getDate())}`;
  const grace = isoMinusDays(today, IPO_KEEP_DAYS);
  for (const s of stocks.filter((x) => x.board === 'ipo')) {
    const ld = s.listDate ? String(s.listDate).slice(0, 10) : null;
    if (!ld || ld > today) { s._justListed = false; continue; }
    s._justListed = true;
    if (ld < grace) {
      // 上市已超宽限期：自动移出打新页，不转入待入通（避免污染人工池）
      s._markRemove = true;
      console.log(`移出打新页：${s.name}(${s.code}) 已于 ${ld} 上市满 ${IPO_KEEP_DAYS} 天`);
    }
  }
  for (let i = stocks.length - 1; i >= 0; i--) {
    if (stocks[i]._markRemove) { stocks.splice(i, 1); }
  }

  /* 4.5) 入通测算：当前市值是硬数据，入通资格随市值浮动，必须每日重算 */
  let capMeet = 0, capShort = 0;
  for (const s of stocks) {
    // 是否已有人工研究内容（页面据此区分「已研究」与「自动发现待研究」）
    s._researched = !!(s.advice || s.connectDate || s.score != null || (s.corners && s.corners.length));
    s._connectNeed = connectNeed(s);                       // 亿港元，0 = 免门槛
    if (s._connectNeed === 0) {
      s._connectStatus = 'A+H · 免市值门槛';
      s._connectGapPct = null;
      continue;
    }
    if (!s._mktCap) { s._connectStatus = null; s._connectGapPct = null; continue; }
    const gap = (s._mktCap / s._connectNeed - 1) * 100;
    s._connectGapPct = +gap.toFixed(1);
    s._connectStatus = gap >= 0 ? '已达标' : `差 ${Math.abs(gap).toFixed(0)}%`;
    if (gap >= 0) capMeet++; else capShort++;
  }
  console.log(`入通门槛测算：达标 ${capMeet} 只 / 未达标 ${capShort} 只（门槛：WVR 200 亿、一般 100 亿、A+H 免）`);

  /* 4.6) 入通日进度：已过入通日 → 标记已入通，不再算「待入通」 */
  let connected = 0, soon = 0;
  for (const s of stocks) {
    const cd = String(s.connectDate || '');
    const m = cd.match(/(\d{4})-(\d{2})-(\d{2})/);
    s._connectDone = false; s._connectDays = null;
    if (!m) continue;
    const dnum = Date.parse(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
    if (isNaN(dnum)) continue;
    const tnum = Date.parse(`${today}T00:00:00Z`);
    s._connectDays = Math.round((dnum - tnum) / 864e5);
    if (s._connectDays < 0) { s._connectDone = true; connected++; }
    else if (s._connectDays <= 14) soon++;
  }
  console.log(`入通进度：已生效 ${connected} 只 / 14 天内待生效 ${soon} 只`);

  /* 5) 时间戳（北京时间） */
  data.updated = `${today} ${p2(bj.getHours())}:${p2(bj.getMinutes())}`;
  data.dataSource = '腾讯 gtimg（行情/市值）+ 东财港股资料表（仅 IPO 发现）+ 新浪（汇率）；待入通清单来自活报告人工维护';
  data.updateFreq = '每日 3 次（北京时间 08:30 / 16:30 / 23:00）';
  data.errors = errors;

  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
  console.log(`已写入 hk-data.json · ${stocks.length} 只 · ${data.updated}`);
  if (errors.length) console.log('提示：' + errors.join('；'));
}

main().catch((e) => {
  console.error('异常（保留原文件）：' + e.message);
  process.exit(0);
});
