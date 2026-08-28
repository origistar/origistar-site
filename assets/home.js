/* origistar · 首页动态渲染
   读取 assets/data.js，生成「今日信号」清单（直截了当的数字/建议，不做仪表盘）。
   打新标的会尝试读取 low-risk/hk-data.json 覆盖为最新，失败则用 data.js 静态值。 */
(function () {
  var d = window.ORIGISTAR;
  if (!d) return;
  var base = (window.ORIGISTAR_NAV && window.ORIGISTAR_NAV.base) || '';

  // ---------- 通用 ----------
  function money(n) { return '¥' + Number(n).toLocaleString('zh-CN'); }
  function usd(n) { return '$' + Number(n).toFixed(2); }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // BTC：AHR999 档位（周定投基数 × 档位）
  function btcTier(ahr) {
    if (ahr < 0.45) return { mult: 3,   label: '抄底区 ×3' };
    if (ahr < 1.2)  return { mult: 1,   label: '定投区 ×1' };
    if (ahr < 3)    return { mult: 0.5, label: '观望区 ×0.5' };
    return { mult: 0, label: '停止定投' };
  }

  // 防守仓：价格 vs 甜区档位（周定投基数 × 档位）
  function zoneTier(price, extreme, sweet, fair) {
    if (price <= extreme) return { mult: 2,   label: '极度便宜 ×2' };
    if (price <= sweet)   return { mult: 1,   label: '甜区 ×1' };
    if (price <= fair)    return { mult: 0.5, label: '合理价 ×0.5' };
    return { mult: 0, label: '等待 · 高于合理价' };
  }

  // ---------- 计算各行 ----------
  var rows = [];

  // 1) 纳指定投（每日）
  rows.push({
    name: '纳指定投',
    val: money(d.ndx.dailyDCA),
    note: d.ndx.signal + ' · PE ' + d.ndx.pe + ' · 回撤 ' + d.ndx.dd + '%',
    type: d.ndx.signalType
  });

  // 2) BTC 定投（每周 × AHR999 档位）
  var btcBase = d.btc.weeklyBase || d.btc.weeklyDCA || 0;
  var btcT = btcTier(d.btc.ahr999);
  var btcAmt = Math.round(btcBase * btcT.mult);
  rows.push({
    name: 'BTC 定投',
    val: btcAmt > 0 ? money(btcAmt) + '/周' : '暂停',
    note: 'AHR999 ' + d.btc.ahr999 + ' · ' + btcT.label,
    type: btcAmt > 0 ? 'acc' : 'flat'
  });

  // 3) SCHD 定投（每周 × 甜区档位）
  var schd = d.defensive.schd;
  var schdT = zoneTier(schd.price, schd.extreme, schd.sweet, schd.fair);
  var schdAmt = Math.round((schd.weeklyBase || 5000) * schdT.mult);
  rows.push({
    name: 'SCHD 定投',
    val: schdAmt > 0 ? money(schdAmt) + '/周' : '等待',
    note: usd(schd.price) + ' vs 甜区 ' + usd(schd.sweet) + ' · ' + schdT.label,
    type: schdAmt > 0 ? 'down' : 'flat'
  });

  // 4) 伯克希尔 今日建议
  var brk = d.defensive.brk;
  var brkT = zoneTier(brk.price, brk.extreme, brk.sweet, brk.fair);
  var brkAmt = Math.round((brk.weeklyBase || 5000) * brkT.mult);
  rows.push({
    name: '伯克希尔',
    val: brkAmt > 0 ? money(brkAmt) + '/周' : '等待',
    note: usd(brk.price) + ' vs 甜区 ' + usd(brk.sweet) + ' · ' + brkT.label,
    type: brkAmt > 0 ? 'down' : 'flat'
  });

  // 5) 可转债
  var cb = d.cb || {};
  rows.push({
    name: '可转债',
    val: cb.signal || '—',
    note: cb.detail || '双低筛选',
    type: cb.type || 'flat'
  });

  // 6) 打新新股
  var hk = d.hkIpo || {};
  rows.push({
    id: 'sig-ipo',
    name: '打新新股',
    val: hk.latest || '—',
    note: hk.latestStatus || hk.signal || '待更新',
    type: 'acc'
  });

  // ---------- 渲染 ----------
  var list = document.getElementById('signal-list');
  if (list) {
    list.innerHTML = rows.map(function (r) {
      return '<div class="signal-row"' + (r.id ? ' id="' + r.id + '"' : '') + '>' +
        '<div class="s-main"><div class="s-name">' + esc(r.name) + '</div>' +
        '<div class="s-note">' + esc(r.note) + '</div></div>' +
        '<div class="s-val ' + (r.type || 'flat') + '">' + esc(r.val) + '</div></div>';
    }).join('');
  }

  // ---------- 顶部信息与 CTA ----------
  var dashDate = document.getElementById('dash-date');
  if (dashDate) dashDate.textContent = '更新于 ' + d.updated;

  var dashText = document.getElementById('dash-text');
  if (dashText) {
    dashText.innerHTML = '<h4>本周解析</h4><p>' + (d.ndx.note || '—') + '</p>';
  }

  var cta = document.getElementById('home-cta');
  if (cta) cta.href = base + 'stable/ndx-dca.html';

  // ---------- 打新标的：尝试用最新 hk-data.json 覆盖 ----------
  try {
    fetch(base + 'low-risk/hk-data.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.stocks) return;
        var ipos = j.stocks.filter(function (s) { return s.board === 'ipo'; });
        if (!ipos.length) return;
        var row = document.getElementById('sig-ipo');
        if (!row) return;
        // 取申购截止/上市日最晚的一只作为当前主打
        ipos.sort(function (a, b) {
          var ka = String(a.deadline || a.listDate || ''), kb = String(b.deadline || b.listDate || '');
          return kb.localeCompare(ka);
        });
        var s = ipos[0];
        var nm = s.name || '—';
        var cd = String(s.code || '').replace(/\.HK$/i, '');
        row.querySelector('.s-val').textContent = cd ? (nm + ' ' + cd) : nm;
        row.querySelector('.s-note').textContent = s.deadline
          ? ('申购截止 ' + s.deadline)
          : (s.listDate ? ('预计上市 ' + s.listDate) : '待上市');
      })
      .catch(function () { /* 失败则保留 data.js 静态值 */ });
  } catch (e) {}
})();
