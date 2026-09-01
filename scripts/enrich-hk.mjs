// 港股打新 / 待入通 · 事实字段每日补全（在 fetch-hk.mjs 之后跑，只填空、绝不覆盖人工研究）
//
// 数据源：东方财富港股 F10（唯二在本环境 + GitHub Actions 均稳定可用的免费表）
//   1) RPT_HKF10_INFO_SECURITYINFO → 发行价 ISSUE_PRICE / 上市日 LISTING_DATE /
//      发行股数 ISSUE_NUM / 每手股数 TRADE_UNIT / 板块 BOARD / 类型 SECURITY_TYPE
//   2) RPT_HKF10_INFO_ORGPROFILE   → 行业 BELONG_INDUSTRY / 总股本 HK_SHARES / 公司全称 ORG_NAME
//      ⚠️ 坑：BELONG_INDUSTRY 属于 ORGPROFILE，写进 SECURITYINFO 会让整条请求报
//         "返回字段不存在" 而静默失败；BOARD 属于 SECURITYINFO，反之亦然。两张表必须分开请求。
//      ⚠️ 坑：SECURITYINFO 的 ISSUE_NUM 是「本次发行股数」不是总股本，
//         只能用来算 IPO 标的的发行市值，绝不能反推 listed 标的总股本。
//
// 派生：
//   发行市值(亿) = 发行价 × 发行股数 / 1e8        （仅招股/新股，ISSUE_NUM 语义正确）
//   每手股数     = TRADE_UNIT
//   入场费(约)   = 发行价 × 每手股数 × 1.0108     （含经纪佣金及各项征费，仅作估算）
//   上市以来%    = (现价 - 发行价) / 发行价
//   标准锁定期   = 规则推算：基石 6 个月 / 控股股东 12 个月，自上市日（旧页面即为此口径）
//
// 保荐人 / 基石 / 评分 / 建议：已穷尽验证东财(SPONSOR_NAME 字段不存在)、AASTOCKS(302)、
//   经济通(http 000)、致富证券(改为 AJAX 前端渲染，静态 HTML 无数据)、富途/雪球(403) —— 均无
//   免费公开 API，只能由本地研究库 D:/workbuddy/新股入通/data.json 继承（CI 无此文件则跳过）。
//
// 用法：node scripts/enrich-hk.mjs
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'low-risk', 'hk-data.json');
const RESEARCH_DB = 'D:/workbuddy/新股入通/data.json'; // 本地研究库；CI 不存在则跳过

function get(url) {
  return new Promise((r) => {
    https.get(url, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      const d = [];
      res.on('data', (c) => d.push(c));
      res.on('end', () => r(Buffer.concat(d).toString('utf8')));
    }).on('error', () => r('')).on('timeout', function () { this.destroy(); r(''); });
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const normCode = (c) => { const n = String(c || '').replace(/[^\d]/g, ''); return n ? n.padStart(5, '0') : null; };
const r2 = (x) => Math.round(x * 100) / 100;

async function fetchEM(reportName, columns, code) {
  const url = 'https://datacenter.eastmoney.com/securities/api/data/v1/get'
    + '?reportName=' + reportName
    + '&columns=' + columns
    + '&filter=' + encodeURIComponent('(SECUCODE="' + code + '.HK")')
    + '&pageSize=1&source=F10&client=PC';
  const raw = await get(url);
  try {
    const j = JSON.parse(raw);
    if (!j || j.success === false) return null;
    return (j.result && j.result.data && j.result.data[0]) || null;
  } catch { return null; }
}

// 一次性拿两张表（分开请求，字段集各自正确）
async function fetchFact(code) {
  const sec = await fetchEM('RPT_HKF10_INFO_SECURITYINFO',
    'SECUCODE,SECURITY_NAME_ABBR,LISTING_DATE,ISSUE_PRICE,ISSUE_NUM,TRADE_UNIT,BOARD,SECURITY_TYPE', code);
  await sleep(150);
  const org = await fetchEM('RPT_HKF10_INFO_ORGPROFILE',
    'SECUCODE,SECURITY_NAME_ABBR,LISTING_DATE,BELONG_INDUSTRY,HK_SHARES,ORG_NAME', code);
  return {
    ipoPrice: sec && sec.ISSUE_PRICE != null ? Number(sec.ISSUE_PRICE) : null,
    issueNum: sec && sec.ISSUE_NUM != null ? Number(sec.ISSUE_NUM) : null,
    lotSize: sec && sec.TRADE_UNIT != null ? Number(sec.TRADE_UNIT) : null,
    board: (sec && sec.BOARD) || null,
    secType: (sec && sec.SECURITY_TYPE) || null,
    listDate: ((sec && String(sec.LISTING_DATE || '').slice(0, 10)) || (org && String(org.LISTING_DATE || '').slice(0, 10)) || null),
    industry: (org && org.BELONG_INDUSTRY) || null,
    hkShares: org && org.HK_SHARES != null ? Number(org.HK_SHARES) : null,
    orgName: (org && org.ORG_NAME) || null,
  };
}

function addMonths(dateStr, n) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr || '');
  if (!m) return null;
  let y = +m[1], mo = +m[2] - 1 + n, d = +m[3];
  y += Math.floor(mo / 12); mo = ((mo % 12) + 12) % 12;
  const last = new Date(y, mo + 1, 0).getDate();
  if (d > last) d = last;
  const p2 = (x) => String(x).padStart(2, '0');
  return `${y}-${p2(mo + 1)}-${p2(d)}`;
}

// A+H 自动识别：用东财搜索接口按公司简称找 A 股孪生股。
// 必须用「简称完全一致」过滤 —— 例：搜「天成控股」会返回 600112 *ST天成 和 02110 天成控股，
// 两者都不是 02913 天成控股的 A 股，只有精确同名才判定为 A+H。
async function detectAH(name) {
  if (!name) return null;
  const url = 'https://searchapi.eastmoney.com/api/suggest/get?input=' + encodeURIComponent(name)
    + '&type=14&token=D43BF722C8E33BDC906FB84D85E326E8&count=10';
  const raw = await get(url);
  try {
    const j = JSON.parse(raw);
    const rows = (j && j.QuotationCodeTable && j.QuotationCodeTable.Data) || [];
    for (const it of rows) {
      const c = String(it.Code || '').trim();
      if (String(it.Name || '').trim() !== String(name).trim()) continue;
      if (/^6\d{5}$/.test(c)) return c + '.SH';
      if (/^(0|3)\d{5}$/.test(c)) return c + '.SZ';
    }
  } catch { /* ignore */ }
  return null;
}

// 研究库继承：把研究字段补进 hk-data 同代码标的（仅填空）
const RESEARCH_FIELDS = ['sponsor', 'corners', 'cornerN', 'cornerstonePct', 'lockup', 'unlockDate',
  'score', 'advice', 'leader', 'riskLevel', 'risk', 'ipoPrice', 'raiseCap', 'totalShares',
  'ipoDate', 'deadline', 'isAH', 'aCode', 'ahRule', 'connectDate', 'floatShares', 'industry', 'lotSize'];
function mergeResearch(stocks, researchStocks) {
  const byCode = new Map();
  for (const r of researchStocks) { const k = normCode(r.code); if (k) byCode.set(k, r); }
  let n = 0;
  for (const s of stocks) {
    const r = byCode.get(normCode(s.code));
    if (!r) continue;
    for (const f of RESEARCH_FIELDS) {
      if (s[f] == null || s[f] === '' || (Array.isArray(s[f]) && !s[f].length)) {
        if (r[f] != null) {
          s[f] = r[f]; n++;
          if (f === 'totalShares') s._tsSrc = 'manual';   // 人工值优先，不被自动推算覆盖
        }
      }
    }
  }
  return n;
}

async function main() {
  const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const stocks = Array.isArray(data.stocks) ? data.stocks : [];

  // 1) 本地研究库继承（CI 无此文件则跳过）
  if (fs.existsSync(RESEARCH_DB)) {
    try {
      const rd = JSON.parse(fs.readFileSync(RESEARCH_DB, 'utf8'));
      const rs = Array.isArray(rd) ? rd : (rd.stocks || []);
      const n = mergeResearch(stocks, rs);
      if (n) console.log('研究库继承填充 ' + n + ' 个字段');
    } catch (e) { console.log('研究库读取失败（跳过）：' + e.message); }
  } else {
    console.log('本机研究库不存在，跳过继承（CI 环境正常）');
  }

  // 2-m) 一次性迁移：自动发现的 IPO 标的此前被默认写死 isAH:false，重置为「未判定」重查一次
  for (const s of stocks) {
    if (s.board === 'ipo' && s._autoAdded && s.aCode == null && s.isAH === false && s._ahChecked !== true) s.isAH = null;
  }

  // 2) 东财事实字段 + 规则派生
  let price = 0, lot = 0, fee = 0, raise = 0, shares = 0, chg = 0, lock = 0, meta = 0, ah = 0;
  for (const s of stocks) {
    const code = normCode(s.code);
    if (!code) continue;
    const need = s.ipoPrice == null || s.lotSize == null || s.industry == null
      || s.listDate == null || (s.board === 'ipo' && s.raiseCap == null);
    if (need) {
      const em = await fetchFact(code);
      await sleep(200);
      if (em) {
        if (s.ipoPrice == null && em.ipoPrice != null) { s.ipoPrice = em.ipoPrice; price++; }
        if (s.lotSize == null && em.lotSize != null) { s.lotSize = em.lotSize; lot++; }
        if (s.industry == null && em.industry) { s.industry = em.industry; meta++; }
        if (s.listDate == null && em.listDate) { s.listDate = em.listDate; meta++; }
        if (s.orgName == null && em.orgName) s.orgName = em.orgName;
        if (s.secType == null && em.secType) s.secType = em.secType;
        // 发行市值 = 发行价 × 本次发行股数（ISSUE_NUM 仅在招股/新股语境下语义正确）
        if (s.board === 'ipo' && s.raiseCap == null && em.ipoPrice != null && em.issueNum) {
          s.raiseCap = r2(em.ipoPrice * em.issueNum / 1e8); raise++;
        }
        // H 股股本：ORGPROFILE 的 HK_SHARES。⚠️ 它是「H 股部分」不是总股本
        //   （例：01133 哈尔滨电气 HK_SHARES=6.76 亿，真实总股本 22.36 亿），
        //   绝不能拿它当总股本算发行市值；也绝不从 ISSUE_NUM 反推。
        if (s.hShares == null && em.hkShares) s.hShares = r2(em.hkShares / 1e8);
      }
    }
    // 总股本：优先用「腾讯总市值 / 现价」推导（对 H 股公司这才是真实总股本），
    //         拿不到行情时退回 H 股股本；人工维护值（_tsSrc=manual）一律不动。
    if (s._tsSrc !== 'manual') {
      if (s._mktCap && s._price) { s.totalShares = r2(s._mktCap / s._price); s._tsSrc = 'calc'; shares++; }
      else if (s.totalShares == null && s.hShares) { s.totalShares = s.hShares; s._tsSrc = 'em'; shares++; }
    }
    // 上市总市值（已上市标的）= 发行价 × 总股本（亿港元）
    if (s.board !== 'ipo' && s.raiseCap == null && s.ipoPrice != null && s.totalShares != null) {
      s.raiseCap = r2(s.ipoPrice * s.totalShares); raise++;
    }
    // 入场费（约）
    if (s.entryFee == null && s.ipoPrice != null && s.lotSize != null) {
      s.entryFee = Math.round(s.ipoPrice * s.lotSize * 1.0108); fee++;
    }
    // 上市以来
    if (s._chgFromIpo == null && s._price != null && s.ipoPrice != null && s.ipoPrice > 0) {
      s._chgFromIpo = r2((s._price - s.ipoPrice) / s.ipoPrice * 100); chg++;
    }
    // A+H 自动识别（A/H 折价是打新与入通的核心参考；每只只查一次，结果由 _ahChecked 记录）
    if (s._ahChecked !== true && s.aCode == null) {
      const a = await detectAH(s.name);
      await sleep(150);
      s._ahChecked = true;
      if (a) { s.isAH = true; s.aCode = a; s.ahRule = s.ahRule || 'A+H（自动识别）'; ah++; }
      else if (s.isAH == null) s.isAH = false;
    }
    // 标准锁定期 + 解禁日（规则；老股不生成，页面本就对老股隐藏这些字段）
    if (s.lockup == null && !s.isOld && s.listDate) {
      const ld = String(s.listDate).slice(0, 10);
      const c = addMonths(ld, 6), h = addMonths(ld, 12);
      if (c && h) {
        s.lockup = '基石6个月/控股股东12个月';
        s.unlockDate = c + '(基石)/' + h + '(控股)';
        lock++;
      }
    }
  }

  // 3) 刷新 _researched
  for (const s of stocks) {
    s._researched = !!(s.advice || s.connectDate || s.score != null || (s.corners && s.corners.length) || s.sponsor);
  }

  data.dataSource = [
    '腾讯 gtimg（行情/市值）', '新浪（HKD/CNY 汇率）',
    '东财港股 F10（发行价/上市日/行业/每手股数/发行股数/总股本/IPO 发现）',
    '标准锁定期为规则推算（基石6个月/控股股东12个月）',
    '保荐人/基石/评分/建议无免费公开 API，由研究库继承或人工维护',
  ].join('；');

  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
  console.log(`enrich 完成：发行价 ${price} · 每手股数 ${lot} · 入场费 ${fee} · 发行市值 ${raise} · 总股本 ${shares} · 上市以来 ${chg} · 标准锁定期 ${lock} · 行业/上市日 ${meta} · A+H ${ah}`);
}

main().catch((e) => { console.error('异常（保留原文件）：' + e.message); process.exit(0); });
