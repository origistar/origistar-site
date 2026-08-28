/* origistar · 首页动态渲染（雪球式布局）
   读取 assets/data.js + nav.js 暴露的 ORIGISTAR_NAV，
   自动生成：体系入口网格、核心信号仪表盘、跟踪标的列表。
   后续在 nav.js 添加子页，首页会自动同步。 */
(function () {
  var d = window.ORIGISTAR;
  var nav = window.ORIGISTAR_NAV;
  if (!d || !nav) return;
  var base = nav.base || '';

  // ---------- 工具 ----------
  function fmtNum(n) { return (typeof n === 'number') ? n.toFixed(2) : n; }
  function colorFor(type) {
    if (type === 'up') return 'var(--up)';
    if (type === 'down') return 'var(--down)';
    if (type === 'warn') return 'var(--warn)';
    if (type === 'acc') return 'var(--accent-2)';
    return 'var(--accent)';
  }
  function gradFor(k) {
    var g = {
      defensive: 'linear-gradient(135deg,#0ea5e9,#06b6d4)',
      stable: 'linear-gradient(135deg,#4f46e5,#6366f1)',
      aggressive: 'linear-gradient(135deg,#ef4444,#f97316)',
      'low-risk': 'linear-gradient(135deg,#8b5cf6,#a855f7)',
      strategy: 'linear-gradient(135deg,#10b981,#14b8a6)',
      study: 'linear-gradient(135deg,#64748b,#94a3b8)'
    };
    return g[k] || g.stable;
  }
  function emojiFor(k) {
    var e = { defensive: '🛡', stable: '📈', aggressive: '🔥', 'low-risk': '🚀', strategy: '🧭', study: '📚' };
    return e[k] || '•';
  }
  function findPage(k, pid) {
    var sys = nav.systems[k];
    if (!sys || !sys.pages) return null;
    return sys.pages.filter(function (p) { return p.id === pid; })[0];
  }

  // ---------- 1. 体系入口 icon grid ----------
  var iconSlot = document.getElementById('home-icon-grid');
  if (iconSlot) {
    iconSlot.innerHTML = nav.ORDER.map(function (k) {
      var s = nav.systems[k];
      return '<a href="' + base + s.index + '">' +
        '<span class="ig-icon" style="background:' + gradFor(k) + '">' + emojiFor(k) + '</span>' +
        '<span class="ig-name">' + s.name + '</span></a>';
    }).join('');
  }

  // ---------- 2. 信号仪表盘 ----------
  var dashDate = document.getElementById('dash-date');
  if (dashDate) dashDate.textContent = '更新于 ' + d.updated;

  function renderGauge(id, pct, val, label, sub, type) {
    var el = document.getElementById(id);
    if (!el) return;
    el.style.setProperty('--pct', pct.toFixed(3));
    el.style.setProperty('--gauge-color', colorFor(type));
    el.querySelector('.g-val').textContent = fmtNum(val);
    el.querySelector('.g-label').textContent = label;
    el.querySelector('.g-sub').textContent = sub;
  }

  // 纳指：PE 0-40 归一化
  var ndxPct = Math.min(Math.max(d.ndx.pe / 40, 0), 1);
  renderGauge('gauge-ndx', ndxPct, d.ndx.pe, '纳指', d.ndx.peLabel, d.ndx.signalType);

  // BTC：AHR999 0-2 归一化
  var btcPct = Math.min(Math.max(d.btc.ahr999 / 2, 0), 1);
  renderGauge('gauge-btc', btcPct, d.btc.ahr999, 'BTC', d.btc.ahr999Label, d.btc.signalType);

  // 防守仓：距甜区折扣综合（当前偏贵为 0）
  var schdGap = Math.max(0, 1 - d.defensive.schd.price / d.defensive.schd.sweet);
  var brkGap  = Math.max(0, 1 - d.defensive.brk.price  / d.defensive.brk.sweet);
  var defPct  = Math.min(Math.max((schdGap + brkGap) / 2, 0), 1);
  var defText = defPct > 0 ? '可定投' : '等待';
  renderGauge('gauge-def', defPct, '—', '防守', defText, defPct > 0 ? 'down' : 'flat');

  // 解析文字
  var dashText = document.getElementById('dash-text');
  if (dashText) {
    dashText.innerHTML = '<h4>本周解析</h4><p>' + (d.ndx.note || '—') + '</p>';
  }

  // CTA 根据今日信号跳转
  var cta = document.getElementById('home-cta');
  if (cta) {
    var ndxPage = findPage('stable', 'ndx-dca');
    cta.href = ndxPage ? base + ndxPage.file : base + 'stable/ndx-dca.html';
  }

  // ---------- 3. 跟踪标的列表 ----------
  var trackSlot = document.getElementById('home-track-list');
  if (trackSlot) {
    var tracks = [
      { k: 'stable',    p: 'ndx-dca',       name: '纳指定投',    val: 'PE ' + d.ndx.pe + ' · ' + d.ndx.signal,            tag: d.ndx.signal,        type: d.ndx.signalType },
      { k: 'stable',    p: 'btc-dca',       name: '比特币',      val: '$' + d.btc.price.toLocaleString() + ' · ' + d.btc.ahr999Label, tag: d.btc.signal, type: d.btc.signalType },
      { k: 'low-risk',  p: 'hk-ipo',        name: '港股打新',    val: d.hkIpo.signal,                                       tag: '观察',               type: 'flat' },
      { k: 'low-risk',  p: 'hk-connect',    name: '待入通',      val: '次新入通埋伏',                                       tag: '跟踪',               type: 'acc' },
      { k: 'low-risk',  p: 'cb-screener',   name: '可转债',      val: '双低筛选',                                           tag: '观望',               type: 'flat' },
      { k: 'strategy',  p: 'superinvestors',name: '13F 持仓',    val: nav.systems.strategy.pages[1].name + ' · 8位',      tag: '季度更新',           type: 'acc' },
      { k: 'strategy',  p: 'momentum',      name: 'SPMO & MTUM', val: '动量轮动',                                           tag: '跟踪中',             type: 'acc' },
      { k: 'defensive', p: 'schd-brk',      name: 'SCHD & BRK.B',val: '甜区等待',                                           tag: '等待',               type: 'down' }
    ];
    trackSlot.innerHTML = tracks.map(function (t) {
      var page = findPage(t.k, t.p);
      if (!page) return '';
      return '<a class="track-card" href="' + base + page.file + '">' +
        '<span class="t-icon" style="background:' + gradFor(t.k) + '">' + emojiFor(t.k) + '</span>' +
        '<div class="t-main"><div class="t-name">' + t.name + '</div><div class="t-desc">' + t.val + '</div></div>' +
        '<span class="t-tag ' + t.type + '">' + t.tag + '</span></a>';
    }).join('');
  }
})();
