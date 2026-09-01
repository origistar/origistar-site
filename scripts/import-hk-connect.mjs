import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PASTE = path.join(ROOT, 'scripts', '_livereport_paste.txt');
const HK_FILE = path.join(ROOT, 'low-risk', 'hk-data.json');
const UPSTREAM = 'D:/workbuddy/新股入通/data.json';

function normCode(c) {
  const n = String(c || '').replace(/[^\d]/g, '');
  return n ? n.padStart(5, '0') + '.HK' : null;
}

function normName(n) {
  return String(n || '')
    .replace(/[ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ]/g, (m) => String.fromCharCode(m.charCodeAt(0) - 0xFEE0))
    .replace(/[－—]/g, '-')
    .trim();
}

function parseRecords(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const code = normCode(lines[i]);
    if (!code || !/^\d{5}\.HK$/.test(code)) continue;
    // 活报告每行一条字段：code + 8个字段 + date = 9 行数据
    if (i + 9 > lines.length) continue;
    const rest = lines.slice(i + 1, i + 10);
    if (rest.length !== 9) continue;
    // validate date line
    const date = rest[8];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    records.push({
      nameRaw: lines[i - 1],
      code,
      _connectCoveragePct: parseFloat(rest[0]) || null,
      _connectCoverageRank: parseInt(rest[1], 10) || null,
      _avgMktCap: rest[2],
      _latestMktCap: rest[3],
      _connectType: rest[4],
      _connectStatus: rest[5],
      _connectForecast: rest[6],
      _connectMethod: rest[7],
      connectDate: date,
    });
    i += 9;
  }
  return records;
}

function loadJson(p) {
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

const pasteText = fs.readFileSync(PASTE, 'utf8');
const records = parseRecords(pasteText);
console.log(`解析到活报告记录 ${records.length} 条`);

const hkData = loadJson(HK_FILE) || { stocks: [] };
const upstreamData = loadJson(UPSTREAM);
const upstreamStocks = Array.isArray(upstreamData) ? upstreamData : (upstreamData?.stocks || []);

const oldListed = (hkData.stocks || []).filter(s => s.board === 'listed');
const oldIPO = (hkData.stocks || []).filter(s => s.board === 'ipo');

const byUpstream = new Map(upstreamStocks.map(s => [normCode(s.code), s]));
const byOld = new Map(oldListed.map(s => [normCode(s.code), s]));

const newListed = [];
const added = [];
const updated = [];

for (const r of records) {
  const code = r.code;
  const upstream = byUpstream.get(code);
  const old = byOld.get(code);

  // name: prefer upstream Chinese name, else existing, else normalized pasted name
  let name = (upstream && upstream.name) || (old && old.name) || normName(r.nameRaw);

  const base = upstream ? { ...upstream } : (old ? { ...old } : {});

  // override with accurate Live Report fields
  base.code = code;
  base.name = name;
  base.board = 'listed';
  base.category = base.category || 'flat';
  base.connectDate = r.connectDate;
  base.isAH = /AH/i.test(r._connectMethod || '');
  base._connectMethod = r._connectMethod;
  base._connectCoveragePct = r._connectCoveragePct;
  base._connectCoverageRank = r._connectCoverageRank;
  base._avgMktCap = r._avgMktCap;
  base._latestMktCap = r._latestMktCap;
  base._connectType = r._connectType;
  base._connectStatusLR = r._connectStatus;      // 活报告原始状态，避免被 fetch-hk.mjs 的 _connectStatus 覆盖
  base._connectForecast = r._connectForecast;
  base._researched = !!(base.advice || base.connectDate || base.score != null || (base.corners && base.corners.length));

  // ensure manual flag (not auto-added)
  delete base._autoAdded;

  // clean stale auto fields that will be refilled by fetch-hk.mjs
  delete base._price;
  delete base._chgFromIpo;
  delete base._mktCap;
  delete base._floatCap;
  delete base._connectNeed;
  delete base._connectGapPct;
  delete base._connectStatus;
  delete base._connectDays;
  delete base._connectDone;

  newListed.push(base);

  if (!old && !upstream) added.push(code);
  else if (!old && upstream) added.push(code + '(来自上游)');
  else updated.push(code);
}

const removed = oldListed.filter(s => !records.find(r => r.code === normCode(s.code))).map(s => s.name + '(' + s.code + ')');

hkData.stocks = [...newListed, ...oldIPO];

// note
hkData.note = '待入通清单来自活报告（Live Report）手工维护；港股打新 IPO 由 fetch-hk.mjs 每日自动发现';

fs.writeFileSync(HK_FILE, JSON.stringify(hkData, null, 2));

console.log('\n=== 待入通清单更新结果 ===');
console.log('活报告条数:', records.length);
console.log('新增:', added.length ? added.join('、') : '无');
console.log('更新/保留:', updated.length ? updated.length + ' 只' : '无');
console.log('移除:', removed.length ? removed.join('、') : '无');
console.log('最终 listed:', newListed.length, '只 | ipo 保留:', oldIPO.length, '只');
