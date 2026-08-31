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
  var schdMult = schd.price <= schd.extreme ? 2 : (schd.price <= schd.sweet ? 1 : (schd.price <= schd.fair ? 0.5 : 0));
  var schdAmt = Math.round((schd.weeklyBase || 5000) * schdMult);
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

  // ---------- 观察仓触发（仅进取仓） ----------
  (function renderAggroAlerts() {
    var a = d.aggressive; if (!a) return;
    var host = document.getElementById('aggro-alerts'); if (!host) return;
    function price(item, n) {
      if (n == null || isNaN(n)) return '—';
      return esc((item.currency || '') + Number(n).toFixed(2));
    }
    var rows = [];
    (a.watch || []).forEach(function (w) {
      if (w.lastPrice == null || w.userBuyWarn == null) return;
      var trig = null;
      if (w.lastPrice <= w.userBuyWarn) trig = 'buy1';
      else if (w.userBuyWarn2 != null && w.lastPrice <= w.userBuyWarn2) trig = 'buy2';
      if (!trig) return;
      rows.push({ item: w, trig: trig });
    });
    if (!rows.length) {
      host.innerHTML = '<p class="muted">观察仓无触发</p>';
      return;
    }
    var trigLabel = { buy1: '买一触发', buy2: '买二触发' };
    host.innerHTML = '<div class="alert-list">' + rows.map(function (r) {
      var it = r.item;
      var cls = (r.trig === 'buy1') ? 'up' : 'acc';
      return '<div class="alert-row">' +
        '<span class="a-name">' + esc(it.name) + '</span>' +
        '<span class="a-tag tag ' + cls + '">' + trigLabel[r.trig] + '</span>' +
        '<span class="muted">现价 ' + price(it, it.lastPrice) + '</span>' +
        '</div>';
    }).join('') + '</div>';
  })();

  // ---------- 系统配置 · 当前仓位 ----------
  (function renderConfig() {
    var cfg = d.config; if (!cfg) return;
    var host = document.getElementById('config-track');
    if (!host) return;
    var dt = document.getElementById('cfg-date');
    if (dt) dt.textContent = '更新于 ' + (cfg.updated || d.updated);
    var c = cfg.current || {};
    var keys = ['defensive', 'stable', 'aggressive'];
    var names = { defensive: '防守仓', stable: '稳健仓', aggressive: '进取仓' };
    var colors = { defensive: '#0ea5e9', stable: '#4f46e5', aggressive: '#ef4444' };
    var rowsHtml = keys.map(function (k) {
      var cur = c[k];
      var fillW = (cur == null) ? 0 : Math.min(Math.max(cur, 0), 100);
      return '<div class="cfg-row">' +
        '<div class="cfg-name">' + names[k] + '</div>' +
        '<div class="cfg-bar"><div class="cfg-fill" style="width:' + fillW + '%;background:' + colors[k] + '"></div></div>' +
        '<div class="cfg-num"><span class="cfg-cur">' + (cur == null ? '—' : cur + '%') + '</span></div>' +
        '</div>';
    }).join('');
    host.innerHTML = rowsHtml;
  })();

  // ---------- 顶部时间 ----------
  var dashDate = document.getElementById('dash-date');
  if (dashDate) dashDate.textContent = '更新于 ' + d.updated;
})();
