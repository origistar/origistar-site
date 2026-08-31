// 港股打新 / 待入通 数据自动刷新
// 数据源：腾讯财经 gtimg（港股+A股实时行情，免鉴权）+ 新浪财经（HKD/CNY 汇率）
// 产物：low-risk/hk-data.json 内的 _price / _chgFromIpo / _aPrice / _ahPremium / _ahPotential / updated
// 说明：研究字段（基石/保荐/入通规则/解禁日/评分/建议）为人工维护，本脚本只回填行情，绝不覆盖人工内容
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
function httpGet(url, headers = {}) {
  return new Promise((resolve) => {
    const req = https.get(
      url,
      { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0', ...headers } },
      (res) => {
        let buf = '';
        res.on('data', (d) => (buf += d));
        res.on('end', () => resolve(buf));
      }
    );
    req.on('error', () => resolve(''));
    req.on('timeout', () => { req.destroy(); resolve(''); });
  });
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
// 返回 { sym: {price, prev, chgPct, name} }
async function fetchQuotes(syms) {
  const out = {};
  // 每批 30 个，避免 URL 过长
  for (let i = 0; i < syms.length; i += 30) {
    const batch = syms.slice(i, i + 30);
    const raw = await httpGet('https://qt.gtimg.cn/q=' + batch.join(','));
    if (!raw) continue;
    for (const line of raw.split(';')) {
      const m = line.match(/v_([a-z0-9]+)="([^"]*)"/i);
      if (!m) continue;
      const a = m[2].split('~');
      const price = +a[3];
      if (!price || isNaN(price)) continue;
      out[m[1]] = { name: a[1], price, prev: +a[4], chgPct: +a[33] };
    }
  }
  return out;
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

  /* 1) 汇率 */
  const rate = await fetchRate(data.hkdCnyRate);
  data.hkdCnyRate = +rate.toFixed(6);
  console.log(`汇率 HKD/CNY = ${data.hkdCnyRate}`);

  /* 2) 港股行情：已上市标的 */
  const listed = stocks.filter((s) => s.board === 'listed' && hkSym(s.code));
  const hkSyms = [...new Set(listed.map((s) => hkSym(s.code)))];
  const hkQ = await fetchQuotes(hkSyms);
  let ok = 0, fail = 0;
  for (const s of listed) {
    const q = hkQ[hkSym(s.code)];
    if (q) {
      s._price = q.price;
      if (s.ipoPrice) s._chgFromIpo = +((q.price / s.ipoPrice - 1) * 100).toFixed(2);
      ok++;
    } else {
      fail++;
      errors.push(s.name + '(' + s.code + ') 行情缺失');
    }
  }
  console.log(`港股行情 成功 ${ok} / 失败 ${fail}`);

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

  /* 4) 转板：招股中标的若上市日已过，自动转入 listed */
  const bj = beijingNow();
  const today = `${bj.getFullYear()}-${p2(bj.getMonth() + 1)}-${p2(bj.getDate())}`;
  for (const s of stocks.filter((x) => x.board === 'ipo')) {
    if (s.listDate && String(s.listDate).slice(0, 10) <= today) {
      s.board = 'listed';
      s.category = s.risk ? 'demon' : 'flat';
      console.log(`转板：${s.name}(${s.code}) 已于 ${s.listDate} 上市 → listed`);
    }
  }

  /* 5) 时间戳（北京时间） */
  data.updated = `${today} ${p2(bj.getHours())}:${p2(bj.getMinutes())}`;
  data.dataSource = '腾讯财经 gtimg（行情）+ 新浪财经（汇率）；研究字段人工维护';
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
