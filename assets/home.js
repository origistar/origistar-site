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

  // ---------- 进取仓预警 ----------
  (function renderAggroAlerts() {
    var a = d.aggressive; if (!a) return;
    var host = document.getElementById('aggro-alerts'); if (!host) return;
    function price(item, n) {
      if (n == null || isNaN(n)) return '—';
      return esc((item.currency || '') + n.toFixed((n < 10) ? 2 : 2));
    }
    function aiWarn(item, type) {
      if (item.status === '停牌' || item.lastPrice == null || item.atrPct == null) return null;
      var mult = (type === 'holdings') ? 3 : 2;
      return price(item, item.lastPrice * (1 - mult * item.atrPct));
    }
    function statusTag(st) {
      var cls = (st === '停牌') ? 'flat' : (st === '持有' ? 'up' : 'acc');
      return '<span class="a-tag tag ' + cls + '">' + esc(st) + '</span>';
    }
    function userWarn(item, type) {
      var parts = [];
      if (type === 'holdings') {
        if (item.userBuyWarn != null) parts.push('用户买入 ' + price(item, item.userBuyWarn));
        if (item.userSellWarn != null) parts.push('用户卖出 ' + price(item, item.userSellWarn));
      } else {
        if (item.userBuyWarn != null) parts.push('用户买入 ' + price(item, item.userBuyWarn));
      }
      return parts.length ? parts.join(' · ') : '<span class="muted">待设</span>';
    }
    var rows = [];
    (a.holdings || []).forEach(function (h) {
      var ai = aiWarn(h, 'holdings');
      rows.push({ item: h, type: 'holdings', ai: ai, aiLabel: 'AI止盈' });
    });
    (a.watch || []).forEach(function (w) {
      var ai = aiWarn(w, 'watch');
      rows.push({ item: w, type: 'watch', ai: ai, aiLabel: 'AI建议买入' });
    });
    if (!rows.length) { host.innerHTML = '<p class="muted">暂无预警数据</p>'; return; }
    host.innerHTML = '<div class="alert-list">' + rows.map(function (r) {
      var it = r.item;
      return '<div class="alert-row">' +
        '<span class="a-name">' + esc(it.name) + '</span>' +
        statusTag(it.status) +
        '<span class="muted">' + userWarn(it, r.type) + '</span>' +
        '<span class="a-warn">' + (r.ai || '—') + '<small>' + esc(r.aiLabel) + '</small></span>' +
      '</div>';
    }).join('') + '</div>';
  })();

  // ---------- 系统配置追踪（3:3:4） ----------
  (function renderConfig() {
    var cfg = d.config; if (!cfg) return;
    var host = document.getElementById('config-track');
    if (!host) return;
    var dt = document.getElementById('cfg-date');
    if (dt) dt.textContent = '更新于 ' + (cfg.updated || d.updated);
    var t = cfg.target, c = cfg.current;
    var keys = ['defensive', 'stable', 'aggressive'];
    var names = { defensive: '防守仓', stable: '稳健仓', aggressive: '进取仓' };
    var colors = { defensive: '#0ea5e9', stable: '#4f46e5', aggressive: '#ef4444' };
    var total = t.defensive + t.stable + t.aggressive;
    var segs = keys.map(function (k) {
      return '<div class="seg" style="width:' + (t[k] / total * 100) + '%;background:' + colors[k] + '"></div>';
    }).join('');
    var rowsHtml = keys.map(function (k) {
      var cur = c[k];
      var dev = (cur == null) ? null : (cur - t[k]);
      var devTxt = (dev == null) ? '待录入' : (dev > 0 ? '+' : '') + dev.toFixed(1) + '%';
      var devCls = (dev == null) ? 'flat' : (Math.abs(dev) > 5 ? 'down' : 'up');
      var devNote = (dev == null) ? '' : (Math.abs(dev) > 5 ? ' · 偏离>5%' : ' · 正常');
      var fillW = (cur == null) ? 0 : Math.min(Math.max(cur, 0), 100);
      return '<div class="cfg-row">' +
        '<div class="cfg-name">' + names[k] + '</div>' +
        '<div class="cfg-bar"><div class="cfg-fill" style="width:' + fillW + '%;background:' + colors[k] + '"></div></div>' +
        '<div class="cfg-num"><span class="cfg-cur">' + (cur == null ? '—' : cur + '%') + '</span><span class="cfg-tgt">目标 ' + t[k] + '%</span></div>' +
        '<div class="cfg-dev tag ' + devCls + '">' + devTxt + devNote + '</div>' +
        '</div>';
    }).join('');
    var legend = keys.map(function (k) {
      return '<span><i style="background:' + colors[k] + '"></i>' + names[k] + ' ' + t[k] + '%</span>';
    }).join('');
    var checks = ((cfg.rebalance && cfg.rebalance.halfYearCheck) || []).map(function (x) {
      return '<li>' + esc(x) + '</li>';
    }).join('');
    host.innerHTML =
      '<div class="cfg-bar-wrap"><div class="mc-bar" style="background:var(--surface-2)">' + segs + '</div></div>' +
      '<div class="cfg-legend">' + legend + '</div>' +
      rowsHtml +
      '<div class="cfg-note">再平衡三阶段：现金流再平衡 → 阈值(5/25)再平衡 → Glide path 临近用钱降仓。现金仓在体系外、不计入。半年人工校验一次（见下）。</div>' +
      '<details class="cfg-detail"><summary>半年校验清单（8 项）</summary><ul>' + checks + '</ul></details>';
  })();

  // ---------- 顶部时间 ----------
  var dashDate = document.getElementById('dash-date');
  if (dashDate) dashDate.textContent = '更新于 ' + d.updated;
})();
