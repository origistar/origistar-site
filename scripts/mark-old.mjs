import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'low-risk', 'hk-data.json');
const OLD_THRESHOLD = '2025-12-31';

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

async function fetchMeta(code) {
  const url = 'https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_HKF10_INFO_ORGPROFILE'
    + '&columns=SECURITY_CODE,SECURITY_NAME_ABBR,LISTING_DATE,BELONG_INDUSTRY'
    + '&filter=' + encodeURIComponent('(SECURITY_CODE="' + code + '")')
    + '&pageSize=10&sortColumns=LISTING_DATE&sortTypes=-1';
  const raw = await get(url);
  try {
    const j = JSON.parse(raw);
    const row = (j && j.result && j.result.data && j.result.data[0]) || null;
    if (!row) return null;
    return { listDate: String(row.LISTING_DATE || '').slice(0, 10) || null, industry: row.BELONG_INDUSTRY || null };
  } catch { return null; }
}

async function main() {
  const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const listed = (data.stocks || []).filter((s) => s.board === 'listed');
  let oldCount = 0, filled = 0;
  for (const s of listed) {
    const code = s.code.replace('.HK', '');
    let meta = null;
    if (!s.listDate) {
      meta = await fetchMeta(code);
      await sleep(150);
      if (!meta) { console.log('未查到 ' + s.code); }
    }
    if (meta) {
      if (meta.listDate) s.listDate = meta.listDate;
      if (!s.industry && meta.industry) { s.industry = meta.industry; filled++; }
    }
    s.isOld = s.listDate && s.listDate < OLD_THRESHOLD;
    if (s.isOld) oldCount++;
    console.log(s.code, s.name, '上市日', s.listDate, s.isOld ? '【老股】' : '【次新】', '行业', s.industry);
  }
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
  console.log('\n老股:', oldCount, '只 | 次新:', listed.length - oldCount, '只 | 补行业:', filled, '只');
}

main().catch((e) => { console.error('异常:', e.message); process.exit(0); });
