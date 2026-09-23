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
    // live 桶（watchItems=观察仓）的 key 为中文名(name)；按 name 匹配，code 兜底
    var ai = Object.assign({}, window.AGGRESSIVE_LIVE.watchItems || {});
    function applyAggro(list) {
      if (!list) return;
      list.forEach(function (it) {
        var live = ai[it.name] || ai[it.code];
        if (!live) return;
        if (live.price != null) it.lastPrice = live.price;
        if (live.atrPct != null) it.atrPct = live.atrPct;
      });
    }
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

  // 防守仓：价格 vs 档位（保留原函数签名，供其它调用）
  function zoneTier(price, extreme, sweet, fair) {
    if (price <= extreme) return { label: '极度便宜' };
    if (price <= sweet)   return { label: '甜区' };
    if (price <= fair)    return { label: '合适区' };
    return { label: '等待 · 高于合理价' };
  }

  // SCHD 分档：按隐含股息率（TTM ÷ 现价）落档，返回金额与档名
  function schdTier(price, ttm, cfg) {
    if (price == null || !ttm) return { amt: 0, label: '暂停' };
    var y = ttm / price * 100;
    var tiers = (cfg && cfg.tiers) || [];
    for (var i = 0; i < tiers.length; i++) {
      if (y >= tiers[i].yield) return { amt: tiers[i].amt, label: tiers[i].label, yieldPct: y };
    }
    return { amt: 0, label: (y < ((cfg && cfg.stopYield) || 3.00) ? '停投' : '暂停'), yieldPct: y };
  }

  // BRK.B 分档：按 P/B 落档，min ≤ P/B < max 命中该档
  // 分界取更便宜那档 → 恰等于分界值时落到下一档（如 P/B = 1.30 走 1.20–1.30 档）
  // max === null 表示无上限（最便宜档）
  function brkTier(price, bvps, cfg) {
    if (price == null || !bvps) return { amt: 0, label: '不投' };
    var pb = price / bvps;
    var tiers = (cfg && cfg.tiers) || [];
    for (var i = 0; i < tiers.length; i++) {
      var t = tiers[i];
      if (pb < t.max || t.max == null) {
        if (pb >= t.min) return { amt: t.amt, label: t.label, pb: pb };
      }
    }
    return { amt: 0, label: '不投', pb: pb };
  }

  function pct(n, d) { return Number(n).toFixed(d == null ? 2 : d) + '%'; }

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

  // 3) SCHD 定投（主力 · 按隐含股息率分档投固定金额）
  var schd = d.defensive.schd;
  var sT = schdTier(schd.price, schd.ttm, schd);
  rows.push({
    name: 'SCHD 定投',
    val: sT.amt > 0 ? money(sT.amt) + '/周' : sT.label,
    note: usd(schd.price) + ' · 股息率 ' + (sT.yieldPct != null ? sT.yieldPct.toFixed(2) + '%' : '—') +
          '（合理 ' + (schd.fairYield != null ? schd.fairYield.toFixed(2) : '3.16') + '%）'
  });

  // 4) 伯克希尔 定投（补充仓 · 按 P/B 分档）
  var brk = d.defensive.brk;
  var bT = brkTier(brk.price, brk.bvps, brk);
  rows.push({
    name: '伯克希尔定投',
    val: bT.amt > 0 ? money(bT.amt) + '/周' : bT.label,
    note: usd(brk.price) + ' · P/B ' + (bT.pb != null ? bT.pb.toFixed(2) + '×' : '—') +
          '（BVPS ' + usd(brk.bvps) + '）'
  });

  // 4b) 黄金ETF（战略配置）
  var gold = d.gold || {};
  rows.push({
    name: '黄金ETF',
    val: gold.zone && gold.zone !== '—' ? gold.zone : '—',
    note: gold.price != null ? (usd(gold.price) + ' · $' + gold.threshold + ' 以下建仓') : '约 $4100 开第一批'
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

    // 只显示「当天」可申购的标的（申购日 == 今天）；过去的待上市、未来的预约均不展示
    var sUp = stocks.filter(function (s) { return s.date === today; });
    var bUp = bonds.filter(function (b) { return b.date === today; });

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
      html += '<div class="ipo-grp">A股新股 · 今日可申购 ' + sUp.length + '</div>' + sUp.map(stockRow).join('');
    }
    if (bUp.length) {
      html += '<div class="ipo-grp">可转债 · 今日可申购 ' + bUp.length + '</div>' + bUp.map(bondRow).join('');
    }
    if (!html) html = '<p class="muted">今日无新股 / 新债申购</p>';
    host.innerHTML = html;

    // 顶部统计（仅当日）
    if (statsHost) {
      var sToday = sUp.length;
      var bToday = bUp.length;
      var bjTotal = sUp.filter(function (s) { return s.isBJ; }).length;
      var cells = [
        { n: sToday, t: '今日新股', hi: sToday > 0 },
        { n: bToday, t: '今日新债', hi: bToday > 0 },
        { n: bjTotal, t: '其中北交所', hi: bjTotal > 0, bj: true },
        { n: sToday + bToday, t: '今日可打', hi: (sToday + bToday) > 0 },
      ];
      statsHost.innerHTML = cells.map(function (c) {
        return '<div class="aipo-stat' + (c.hi ? ' hi' : '') + (c.bj ? ' bj' : '') + '">' +
          '<b>' + c.n + '</b><span>' + c.t + '</span></div>';
      }).join('');
    }
    if (dateHost) dateHost.textContent = '数据 ' + (L.generatedAt || '—');
  })();

  // ---------- 观察仓触发（仅进取仓 · 首页多一层 5% 预警） ----------
  (function renderAggroAlerts() {
    var a = d.aggressive; if (!a) return;
    var host = document.getElementById('aggro-alerts'); if (!host) return;
    function price(item, n) {
      if (n == null || isNaN(n)) return '—';
      return esc((item.currency || '') + Number(n).toFixed(2));
    }
    // 分级：买二 / 预警买二 / 买一 / 预警买一；进取页保留 buy1/buy2 不变
    function trigOf(tp, w) {
      if (w.userBuyWarn2 != null && tp <= w.userBuyWarn2) return 'buy2';
      if (w.userBuyWarn2 != null && tp <= w.userBuyWarn2 * 1.05) return 'preBuy2';
      if (tp <= w.userBuyWarn) return 'buy1';
      if (tp <= w.userBuyWarn * 1.05) return 'preBuy1';
      return null;
    }
    function targetOf(trig, w) {
      if (trig === 'buy2' || trig === 'preBuy2') return w.userBuyWarn2;
      return w.userBuyWarn;
    }
    var rows = [];
    (a.watch || []).forEach(function (w) {
      if (w.lastPrice == null || w.userBuyWarn == null) return;
      var trig = trigOf(w.lastPrice, w);
      if (!trig) return;
      rows.push({ item: w, trig: trig, target: targetOf(trig, w) });
    });
    if (!rows.length) {
      host.innerHTML = '<p class="muted">观察仓无触发</p>';
      return;
    }
    var trigLabel = {
      buy1: '买一触发', buy2: '买二触发',
      preBuy1: '预警·买一', preBuy2: '预警·买二'
    };
    var trigCls = {
      buy1: 'up', buy2: 'acc',
      preBuy1: 'warn', preBuy2: 'warn'
    };
    host.innerHTML = '<div class="alert-list">' + rows.map(function (r) {
      var it = r.item;
      var cls = trigCls[r.trig];
      var tgt = price(it, r.target);
      return '<div class="alert-row">' +
        '<span class="a-name">' + esc(it.name) + '</span>' +
        '<span class="a-tag tag ' + cls + '">' + trigLabel[r.trig] + '</span>' +
        '<span class="a-warn">现 ' + price(it, it.lastPrice) +
          '<small>触发 ' + tgt + '</small>' +
        '</span>' +
        '</div>';
    }).join('') + '</div>';
  })();

  // ---------- 顶部时间 ----------
  var dashDate = document.getElementById('dash-date');
  if (dashDate) dashDate.textContent = '更新于 ' + d.updated;
})();
