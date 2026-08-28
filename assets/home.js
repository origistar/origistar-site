/* origistar · 首页动态渲染
   读取 assets/data.js，生成「今日信号」清单（直截了当的数字/建议）。 */
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

  // 防守仓：价格 vs 甜区档位
  function zoneTier(price, extreme, sweet, fair) {
    if (price <= extreme) return { label: '极度便宜' };
    if (price <= sweet)   return { label: '甜区' };
    if (price <= fair)    return { label: '合适区' };
    return { label: '等待 · 高于合理价' };
  }

  // ---------- 计算各行 ----------
  var rows = [];

  // 1) 纳指定投（每日）
  rows.push({
    name: '纳指定投',
    val: money(d.ndx.dailyDCA) + '/天',
    note: d.ndx.signal + ' · PE ' + d.ndx.pe + ' · 回撤 ' + d.ndx.dd + '%'
  });

  // 2) BTC 定投（每周 × AHR999 档位）
  var btcBase = d.btc.weeklyBase || d.btc.weeklyDCA || 0;
  var btcT = btcTier(d.btc.ahr999);
  var btcAmt = Math.round(btcBase * btcT.mult);
  rows.push({
    name: 'BTC 定投',
    val: btcAmt > 0 ? money(btcAmt) + '/周' : '暂停',
    note: 'AHR999 ' + d.btc.ahr999 + ' · ' + btcT.label
  });

  // 3) SCHD 定投（每周 × 甜区档位）
  var schd = d.defensive.schd;
  var schdT = zoneTier(schd.price, schd.extreme, schd.sweet, schd.fair);
  var schdAmt = Math.round((schd.weeklyBase || 5000) * (schd.price <= schd.fair ? (schd.price <= schd.extreme ? 2 : (schd.price <= schd.sweet ? 1 : 0.5)) : 0));
  rows.push({
    name: 'SCHD 定投',
    val: schdAmt > 0 ? money(schdAmt) + '/周' : '等待',
    note: usd(schd.price) + ' vs 甜区 ' + usd(schd.sweet)
  });

  // 4) 伯克希尔 今日建议（只给区域，不显示基数）
  var brk = d.defensive.brk;
  var brkT = zoneTier(brk.price, brk.extreme, brk.sweet, brk.fair);
  rows.push({
    name: '伯克希尔',
    val: brkT.label,
    note: usd(brk.price) + ' vs 甜区 ' + usd(brk.sweet)
  });

  // 5) 可转债
  var cb = d.cb || {};
  rows.push({
    name: '可转债',
    val: cb.signal || '—',
    note: cb.detail || '双低筛选'
  });

  // ---------- 渲染 ----------
  var list = document.getElementById('signal-list');
  if (list) {
    list.innerHTML = rows.map(function (r) {
      return '<div class="signal-row">' +
        '<div class="s-main"><div class="s-name">' + esc(r.name) + '</div>' +
        '<div class="s-note">' + esc(r.note) + '</div></div>' +
        '<div class="s-val">' + esc(r.val) + '</div></div>';
    }).join('');
  }

  // ---------- 顶部时间 ----------
  var dashDate = document.getElementById('dash-date');
  if (dashDate) dashDate.textContent = '更新于 ' + d.updated;
})();
