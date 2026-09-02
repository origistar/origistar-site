/* origistar · 首页动态渲染
   读取 assets/data.js，生成「今日信号」清单（直截了当的数字/建议）。 */
(function () {
  var d = window.ORIGISTAR;
  if (!d) return;
  // 行情快照覆盖（仅覆盖存在的字段，其余回落 data.js）
  if (window.MARKET_LIVE) {
    if (d.ndx) Object.assign(d.ndx, window.MARKET_LIVE.ndx || {});
    if (d.btc) Object.assign(d.btc, window.MARKET_LIVE.btc || {});
  }
  if (window.DEFENSIVE_LIVE && d.defensive) {
    var di = window.DEFENSIVE_LIVE.items || {};
    if (di.schd && d.defensive.schd) Object.assign(d.defensive.schd, di.schd);
    if (di.brk && d.defensive.brk) Object.assign(d.defensive.brk, di.brk);
    if (di.gold && d.gold) Object.assign(d.gold, di.gold);
  }
  if (window.CB_LIVE) {
    d.cb = {
      signal: window.CB_LIVE.badge || (window.CB_LIVE.emptySignal === '触发' ? '今日空仓' : '可观察'),
      detail: window.CB_LIVE.verdict || '双低筛选'
    };
  }
  if (window.AGGRESSIVE_LIVE && d.aggressive) {
    var ai = window.AGGRESSIVE_LIVE.items || {};
    function applyAggro(list) {
      if (!list) return;
      list.forEach(function (it) {
        var live = ai[it.code];
        if (!live) return;
        if (live.price != null) it.lastPrice = live.price;
        if (live.atrPct != null) it.atrPct = live.atrPct;
      });
    }
    applyAggro(d.aggressive.holdings);
    applyAggro(d.aggressive.watch);
  }
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

  // ---------- 打新日历（A股新股含北交所 + 可转债） ----------
  (function renderAIPO() {
    var L = window.AIPO_LIVE;
    var host = document.getElementById('aipo-list');
    var statsHost = document.getElementById('aipo-stats');
    var dateHost = document.getElementById('aipo-date');
    if (!host) return;
    if (!L || (!L.stocks && !L.bonds)) {
      host.innerHTML = '<p class="muted">打新数据暂不可用</p>';
      return;
    }
    var today = L.today || '';
    var stocks = L.stocks || [];
    var bonds = L.bonds || [];

    // 分组口径：
    //   可打 = 申购日 >= 今天（今天能下手的 + 即将开放申购的）
    //   待上市 = 已过申购日、但尚未上市（等开板 / 等中签结果）
    var sUp = stocks.filter(function (s) { return s.date >= today; });
    var sPend = stocks.filter(function (s) { return s.date < today && (!s.listingDate || s.listingDate >= today); });
    var bUp = bonds.filter(function (b) { return b.date >= today; });
    var bPend = bonds.filter(function (b) { return b.date < today && (!b.listingDate || b.listingDate >= today); });

    function diffDays(d) {
      if (!d || !today) return null;
      return Math.round((new Date(d + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000);
    }
    function dayLabel(d) {
      var n = diffDays(d);
      if (n == null) return '';
      if (n === 0) return '今天';
      if (n === 1) return '明天';
      if (n === 2) return '后天';
      if (n > 0) return n + ' 天后';
      return '已申购';
    }
    function mmdd(d) { return d ? d.slice(5).replace('-', '/') : ''; }
    function fmtWan(n) {
      if (n == null || isNaN(n)) return '—';
      if (n >= 10000) return (n / 10000).toFixed(2) + ' 亿元';
      // 小于 100 万保留 1 位小数（申购常见 2.5 万 / 6.5 万，取整会失真）
      if (n < 100) return Number(n.toFixed(1)) + ' 万元';
      return Number(n).toLocaleString('zh-CN', { maximumFractionDigits: 0 }) + ' 万元';
    }
    var BOARD_CLS = { '北交所': 'b-bj', '科创板': 'b-kc', '创业板': 'b-cy', '沪主板': 'b-sh', '深主板': 'b-sz' };

    function stockRow(s) {
      var hot = (s.date === today);
      var cls = BOARD_CLS[s.board] || 'b-sh';
      var meta = [];
      meta.push(esc(s.code));
      if (s.applyCode && s.applyCode !== s.code) meta.push('申购 ' + esc(s.applyCode));
      if (s.price != null) meta.push('¥' + s.price);
      if (s.pe != null) meta.push('PE ' + s.pe);
      if (s.listingDate) meta.push(mmdd(s.listingDate) + ' 上市');
      // 北交所规则与沪深完全不同，单独给一行说明
      var note = s.isBJ
        ? '需全额缴款 · ' + s.topLabel + ' ' + fmtWan(s.topCap) + ' · 不占市值 · 比例配售'
        : s.topLabel + ' ' + fmtWan(s.topCap) + ' · 中签后缴款';
      return '<div class="ipo-row' + (s.isBJ ? ' is-bj' : '') + '">' +
        '<div class="ipo-l"><div class="ipo-d">' + mmdd(s.date) + '</div>' +
        '<div class="ipo-day' + (hot ? ' hot' : '') + '">' + dayLabel(s.date) + '</div></div>' +
        '<div class="ipo-r">' +
          '<div class="ipo-t"><span class="ipo-name">' + esc(s.name) + '</span>' +
          '<span class="ipo-board ' + cls + '">' + esc(s.board) + '</span></div>' +
          '<div class="ipo-m">' + meta.join(' · ') + '</div>' +
          '<div class="ipo-note' + (s.isBJ ? ' bj' : '') + '">' + note + '</div>' +
        '</div></div>';
    }

    function bondRow(b) {
      var hot = (b.date === today);
      var meta = [];
      meta.push('申购 ' + esc(b.applyCode));
      if (b.exchange) meta.push(esc(b.exchange));
      if (b.scale != null) meta.push(b.scale + ' 亿');
      if (b.rating) meta.push(esc(b.rating));
      if (b.stockName) meta.push('正股 ' + esc(b.stockName));
      if (b.transferValue != null) meta.push('转股价值 ' + b.transferValue);
      if (b.listingDate) meta.push(mmdd(b.listingDate) + ' 上市');
      return '<div class="ipo-row">' +
        '<div class="ipo-l"><div class="ipo-d">' + mmdd(b.date) + '</div>' +
        '<div class="ipo-day' + (hot ? ' hot' : '') + '">' + dayLabel(b.date) + '</div></div>' +
        '<div class="ipo-r">' +
          '<div class="ipo-t"><span class="ipo-name">' + esc(b.name) + '</span>' +
          '<span class="ipo-board b-cb">可转债</span></div>' +
          '<div class="ipo-m">' + meta.join(' · ') + '</div>' +
        '</div></div>';
    }

    var html = '';
    // 待办的排前面：可打新股 → 可打新债 → 待上市
    if (sUp.length) {
      html += '<div class="ipo-grp">A股新股 · 可申购 ' + sUp.length + '</div>' + sUp.map(stockRow).join('');
    }
    if (bUp.length) {
      html += '<div class="ipo-grp">可转债 · 可申购 ' + bUp.length + '</div>' + bUp.map(bondRow).join('');
    }
    // 待上市（已申购、等开板）：信息价值低但会堆很长，默认折叠
    var pendTotal = sPend.length + bPend.length;
    if (pendTotal) {
      var pendTxt = [];
      if (sPend.length) pendTxt.push('新股 ' + sPend.length);
      if (bPend.length) pendTxt.push('新债 ' + bPend.length);
      var inner = '';
      sPend.slice(-6).forEach(function (it) {
        inner += '<div class="ipo-row mini"><div class="ipo-l"><div class="ipo-d">' + mmdd(it.date) + '</div></div>' +
          '<div class="ipo-r"><div class="ipo-t"><span class="ipo-name">' + esc(it.name) + '</span>' +
          '<span class="ipo-board ' + (BOARD_CLS[it.board] || 'b-sh') + '">' + esc(it.board) + '</span></div>' +
          '<div class="ipo-m">' + esc(it.code) + ' · ' +
          (it.listingDate ? '预计 ' + mmdd(it.listingDate) + ' 上市' : '上市日待定') + '</div></div></div>';
      });
      bPend.slice(-6).forEach(function (it) {
        inner += '<div class="ipo-row mini"><div class="ipo-l"><div class="ipo-d">' + mmdd(it.date) + '</div></div>' +
          '<div class="ipo-r"><div class="ipo-t"><span class="ipo-name">' + esc(it.name) + '</span>' +
          '<span class="ipo-board b-cb">可转债</span></div>' +
          '<div class="ipo-m">申购 ' + esc(it.applyCode) + ' · ' +
          (it.listingDate ? '预计 ' + mmdd(it.listingDate) + ' 上市' : '上市日待定') + '</div></div></div>';
      });
      html += '<details class="ipo-fold"><summary>待上市 ' + pendTxt.join(' · ') + '</summary>' + inner + '</details>';
    }
    if (!html) html = '<p class="muted">近期无新股 / 新债申购</p>';
    host.innerHTML = html;

    // 顶部统计
    if (statsHost) {
      var sToday = sUp.filter(function (s) { return s.date === today; }).length;
      var bToday = bUp.filter(function (b) { return b.date === today; }).length;
      var upTotal = sUp.length + bUp.length;
      var bjTotal = sUp.filter(function (s) { return s.isBJ; }).length;
      var cells = [
        { n: sToday + bToday, t: '今日可打', hi: (sToday + bToday) > 0 },
        { n: upTotal, t: '待申购' },
        { n: bjTotal, t: '其中北交所', hi: bjTotal > 0, bj: true },
        { n: pendTotal, t: '待上市' },
      ];
      statsHost.innerHTML = cells.map(function (c) {
        return '<div class="aipo-stat' + (c.hi ? ' hi' : '') + (c.bj ? ' bj' : '') + '">' +
          '<b>' + c.n + '</b><span>' + c.t + '</span></div>';
      }).join('');
    }
    if (dateHost) dateHost.textContent = '数据 ' + (L.generatedAt || '—');
  })();

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
