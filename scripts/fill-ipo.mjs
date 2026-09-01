// 回填港股待入通标的的「发行价 / 上市以来」等可可靠计算的字段。
// 只读缺失字段，绝不覆盖已有非 null 值；幂等，可重复运行。
//
// 字段可靠性判定（关键，避免脏数据）：
//   ✅ ipoPrice（发行价）：东财 RPT_HKF10_INFO_SECURITYINFO.ISSUE_PRICE —— 可靠，直接填。
//   ✅ _chgFromIpo（上市以来%）：(现价 - 发行价)/发行价×100 —— 可靠，本地算。
//   ⚠️ raiseCap（发行市值·亿）：= ipoPrice × totalShares（totalShares 必须是「总股本」口径）。
//      仅当本地已存在 curated totalShares 时才算；绝不从东财 ISSUE_NUM（=IPO 新发股数，非总股本）
//      或 _mktCap/_price（_mktCap 有时是流通市值，口径不稳）反推，否则会算出错误市值。
//   ❌ totalShares：本地若无则不臆造（东财 ISSUE_NUM 与 _mktCap/_price 口径均不可靠）。
//   ✅ listDate（上市日）：东财 LISTING_DATE —— 可靠，仅当本地缺失时填。
// 保荐/基石/锁定期/解禁日/评分/建议 属人工研究字段，本脚本不碰（缺失时卡片显示「📝 待研究」）。
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'low-risk', 'hk-data.json');

function get(url) {
  return new Promise((r) => {
    https.get(url, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      const d = [];
      res.on('data', (c) => d.push(c));
      res.on('end', () => r(Buffer.concat(d).toString('utf8')));
    }).on('error', () => r('')).on('timeout', function () { this.destroy(); r(''); });
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r2 = (n) => Math.round(n * 100) / 100;

async function fetchIssue(code) {
  const url = 'https://datacenter.eastmoney.com/securities/api/data/v1/get'
    + '?reportName=RPT_HKF10_INFO_SECURITYINFO'
    + '&columns=SECUCODE,SECURITY_CODE,SECURITY_NAME_ABBR,LISTING_DATE,ISSUE_PRICE'
    + '&filter=' + encodeURIComponent('(SECUCODE="' + code + '.HK")')
    + '&source=F10&client=PC&pageSize=10';
  const raw = await get(url);
  try {
    const j = JSON.parse(raw);
    const row = (j && j.result && j.result.data && j.result.data[0]) || null;
    if (!row) return null;
    return {
      ipoPrice: row.ISSUE_PRICE != null ? Number(row.ISSUE_PRICE) : null,
      listDate: String(row.LISTING_DATE || '').slice(0, 10) || null,
    };
  } catch { return null; }
}

async function main() {
  const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const listed = (data.stocks || []).filter((s) => s.board === 'listed');
  let ipoFilled = 0, chgFilled = 0, raiseFilled = 0, listFilled = 0;
  const changed = [];
  for (const s of listed) {
    const code = s.code.replace('.HK', '');
    // 1) 发行价缺失 → 东财抓取
    if (s.ipoPrice == null) {
      const m = await fetchIssue(code);
      await sleep(150);
      if (m) {
        if (m.ipoPrice != null) { s.ipoPrice = m.ipoPrice; ipoFilled++; changed.push(s.code + ' 发行价=' + m.ipoPrice); }
        if (!s.listDate && m.listDate) { s.listDate = m.listDate; listFilled++; }
        if (!s.ipoDate && m.listDate) s.ipoDate = m.listDate;
      } else {
        console.log('  ⚠ 东财未查到 ' + s.code + ' ' + s.name + ' 的发行价');
      }
    }
    // 2) 上市以来涨幅（_price / ipoPrice 均有且发行价>0）
    if (s._chgFromIpo == null && s._price != null && s.ipoPrice != null && s.ipoPrice > 0) {
      s._chgFromIpo = r2((s._price - s.ipoPrice) / s.ipoPrice * 100); chgFilled++;
    }
    // 3) 发行市值 = 发行价 × 总股本（仅用本地已存在的 curated totalShares，绝不反推）
    if (s.raiseCap == null && s.ipoPrice != null && s.totalShares != null) {
      s.raiseCap = Math.round(s.ipoPrice * s.totalShares * 10) / 10; raiseFilled++;
    }
  }
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
  console.log('\n=== fill-ipo 回填结果 ===');
  console.log('发行价(东财):', ipoFilled, '只 | 上市日:', listFilled, '只');
  console.log('上市以来:', chgFilled, '只 | 发行市值(用已有总股本):', raiseFilled, '只');
  if (changed.length) console.log('变更明细:\n  ' + changed.join('\n  '));
}

main().catch((e) => { console.error('异常:', e.message); process.exit(0); });
