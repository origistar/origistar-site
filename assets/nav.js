/* origistar · 导航引擎（零依赖、可移植）
   用法：<script src="assets/nav.js" data-system="stable" data-page="index|ndx-dca"></script>
   会自动注入：顶部导航(桌面下拉) + 移动抽屉 + 底部 Tab + 体系内 sub-nav 胶囊 + 聚合页卡片
   设计原则：底部 Tab = 一级目的地，点一下必定直接进该体系的聚合首页，不在 Tab 上弹选择层。 */
(function () {
  var navScript = document.currentScript;
  var src = navScript ? navScript.getAttribute('src') : 'assets/nav.js';
  var base = src.replace(/assets\/nav\.js$/, '');          // 站点根相对路径
  var SYS = 'home'; var PAGE = '';
  if (navScript) { SYS = navScript.getAttribute('data-system') || 'home'; PAGE = navScript.getAttribute('data-page') || ''; }

  var ICON = {
    home: '<path d="M3 11l9-8 9 8M5 10v10h14V10"/>',
    defensive: '<path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z"/>',
    stable: '<path d="M4 19V5M4 19h16M8 16v-5M12 16V8M16 16v-3"/>',
    aggressive: '<path d="M5 19c0-7 5-12 14-14-2 9-7 14-14 14z"/><path d="M9 15l3-3"/>',
    lowrisk: '<path d="M12 3a9 9 0 019 9M12 3v9l6 3"/><path d="M4 12a8 8 0 018-8"/>',
    strategy: '<circle cx="12" cy="12" r="9"/><path d="M15 9l-2 5-5 2 2-5z"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    study: '<path d="M4 19.5A2.5 2.5 0 016.5 17H20M4 19.5V5a2.5 2.5 0 012.5-2.5h11A2.5 2.5 0 0120 5v14.5M4 19.5A2.5 2.5 0 016.5 22H20v-2.5"/>',
    schd: '<path d="M4 19V5M4 19h16M8 15v-4M12 15V8M16 15v-6"/>',
    btc: '<circle cx="12" cy="12" r="9"/><path d="M9.5 8h4a2 2 0 010 4h-4zM9.5 12h4.5a2 2 0 010 4H9.5zM10 7v10M12.5 7v1M12.5 16v1"/>',
    history: '<path d="M3 12a9 9 0 109-9 9 9 0 00-7 3.5M4 4v4h4"/><path d="M12 8v4l3 2"/>',
    ipo: '<path d="M4 20h16M6 20V9l6-5 6 5v11"/><path d="M10 20v-6h4v6"/>',
    cb: '<path d="M4 12a8 8 0 0116 0v2a8 8 0 01-16 0z"/><path d="M4 14h16"/>',
    momentum: '<path d="M4 18l5-6 4 3 7-9"/><path d="M20 6v4h-4"/>',
    whale: '<path d="M3 12c4-5 14-5 18 0-2 4-6 6-9 6-1 2-4 2-5 0-3 0-5-2-4-6z"/><circle cx="8" cy="11" r="1"/>'
  };
  function svg(k, cls) {
    return '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (ICON[k] || ICON.home) + '</svg>';
  }
  var GRAD = {
    schd: 'linear-gradient(135deg,#0ea5e9,#06b6d4)', stable: 'linear-gradient(135deg,#4f46e5,#6366f1)',
    btc: 'linear-gradient(135deg,#f59e0b,#ef4444)', history: 'linear-gradient(135deg,#10b981,#14b8a6)',
    ipo: 'linear-gradient(135deg,#8b5cf6,#a855f7)', cb: 'linear-gradient(135deg,#ec4899,#f43f5e)',
    momentum: 'linear-gradient(135deg,#0ea5e9,#22d3ee)', whale: 'linear-gradient(135deg,#14b8a6,#34d399)',
    aggressive: 'linear-gradient(135deg,#ef4444,#f97316)', defensive: 'linear-gradient(135deg,#0ea5e9,#06b6d4)',
    'low-risk': 'linear-gradient(135deg,#8b5cf6,#a855f7)', strategy: 'linear-gradient(135deg,#10b981,#14b8a6)',
    study: 'linear-gradient(135deg,#64748b,#94a3b8)', lowrisk: 'linear-gradient(135deg,#8b5cf6,#a855f7)'
  };
  function grad(k){ return GRAD[k] || GRAD.stable; }

  // 系统配置：index = 聚合首页；pages = 具体子页
  var S = {
    defensive: { name: '防守仓', icon: 'defensive', desc: 'SCHD & 伯克希尔 便宜价定投', index: 'defensive/index.html', pages: [
      { id: 'schd-brk', name: 'SCHD & BRK.B', file: 'defensive/schd-brk.html', desc: '锚定便宜价监测', icon: 'schd' }
    ]},
    stable: { name: '稳健仓', icon: 'stable', desc: '纳指100 / 比特币 长期定投', index: 'stable/index.html', pages: [
      { id: 'ndx-dca', name: '纳指定投', file: 'stable/ndx-dca.html', desc: 'PE/DD/网格决策 v5.1', icon: 'stable' },
      { id: 'btc-dca', name: '比特币', file: 'stable/btc-dca.html', desc: 'AHR999 熊市定投', icon: 'btc' },
      { id: 'ndx-history', name: '定投历史', file: 'stable/ndx-history.html', desc: '实盘记录与回测', icon: 'history' }
    ]},
    aggressive: { name: '激进仓', icon: 'aggressive', desc: '高弹性个股 / 主题（待建）', index: 'aggressive/index.html', pages: [
      { id: 'overview', name: '激进仓', file: 'aggressive/index.html', desc: '版式预留', icon: 'aggressive' }
    ]},
    'low-risk': { name: '低风险', icon: 'lowrisk', desc: '港股打新 / 待入通 / 可转债', index: 'low-risk/index.html', pages: [
      { id: 'hk-ipo', name: '港股打新', file: 'low-risk/hk-ipo.html', desc: '待上市新股追踪', icon: 'ipo' },
      { id: 'hk-connect', name: '待入通', file: 'low-risk/hk-connect.html', desc: '次新入通埋伏', icon: 'ipo' },
      { id: 'cb-screener', name: '可转债', file: 'low-risk/cb-screener.html', desc: '双低筛选', icon: 'cb' },
      { id: 'cb-history', name: '可转债历史', file: 'low-risk/cb-history.html', desc: '估值水位存档', icon: 'history' }
    ]},
    strategy: { name: '策略库', icon: 'strategy', desc: '因子 / 顶级投资者跟踪', index: 'strategy/index.html', pages: [
      { id: 'momentum', name: 'SPMO & MTUM', file: 'strategy/momentum.html', desc: '动量轮动', icon: 'momentum' },
      { id: 'superinvestors', name: '13F 持仓', file: 'strategy/superinvestors.html', desc: '顶级投资者对比', icon: 'whale' }
    ]},
    study: { name: '研习录', icon: 'study', desc: '读书纪要 · 研报重点', index: 'study/index.html', pages: [
      { id: 'index', name: '研习录', file: 'study/index.html', desc: '读书纪要 · 研报重点', icon: 'study' }
    ]}
  };
  var ORDER = ['defensive', 'stable', 'aggressive', 'low-risk', 'strategy', 'study'];

  // 去重：若聚合页本身已等于某子页，则不再单列
  function subItems(k) {
    var s = S[k];
    var out = [{ id: 'index', name: '概览', file: s.index, icon: s.icon, overview: true }];
    s.pages.forEach(function (p) { if (p.file !== s.index) out.push(p); });
    return out;
  }

  // ---------- 聚合页"重点概览"渲染（数据来自 data.js，单一来源） ----------
  function fmt(n, d) { return (n == null || isNaN(n)) ? '—' : (d ? Number(n).toFixed(d) : n); }
  function sectionHead(t) {
    var u = (window.ORIGISTAR && window.ORIGISTAR.updated) || '—';
    return '<div class="section-head"><h2>' + t + '</h2><span class="sub">更新于 ' + u + '</span></div>';
  }
  function kv(items) {
    return '<div class="kv">' + items.map(function (it) {
      return '<div class="item"><div class="k">' + it.k + '</div><div class="v">' + it.v +
        (it.sub ? '<small> ' + it.sub + '</small>' : '') + '</div></div>';
    }).join('') + '</div>';
  }
  function sigRow(text, type, val) {
    return '<div class="ovw-sig"><div><div class="lab">当前信号</div><div class="val">' + val + '</div></div>' +
      '<span class="st ' + (type || 'flat') + '">' + text + '</span></div>';
  }
  function renderOverview(k) {
    var d = window.ORIGISTAR; if (!d) return '';
    if (k === 'stable') {
      var n = d.ndx, b = d.btc;
      return sectionHead('重点概览') +
        kv([
          { k: '纳指 PE', v: fmt(n.pe, 2), sub: n.peLabel },
          { k: 'VIX', v: fmt(n.vix, 2) },
          { k: '回撤', v: fmt(n.dd, 2) + '%', sub: '52周高点' },
          { k: '今日定投', v: '¥' + n.dailyDCA, sub: '份数' }
        ]) +
        sigRow(n.signal, n.signalType, '今日定投 ¥' + n.dailyDCA) +
        kv([
          { k: 'BTC AHR999', v: fmt(b.ahr999, 2), sub: b.ahr999Label },
          { k: 'BTC 价格', v: '$' + (b.price ? b.price.toLocaleString() : '—') },
          { k: '周定投', v: '¥' + b.weeklyDCA }
        ]);
    }
    if (k === 'defensive') {
      var df = d.defensive;
      var schdOk = df.schd.price <= df.schd.sweet, brkOk = df.brk.price <= df.brk.sweet;
      return sectionHead('重点概览') +
        kv([
          { k: 'SCHD 价', v: '$' + fmt(df.schd.price, 2), sub: '甜区 $' + df.schd.sweet },
          { k: 'SCHD 状态', v: schdOk ? '可定投' : df.schd.zone },
          { k: 'BRK 价', v: '$' + fmt(df.brk.price, 2), sub: '甜区 $' + df.brk.sweet },
          { k: 'BRK 状态', v: brkOk ? '可定投' : df.brk.zone }
        ]) +
        sigRow('等待便宜价', 'flat', '均未达甜区');
    }
    if (k === 'low-risk') {
      var h = d.hkIpo;
      return sectionHead('重点概览') +
        kv([
          { k: '港股观察', v: (h.watch || 0) + ' 支' },
          { k: '申购管线', v: (h.pipeline || 0) + ' 支' },
          { k: '可转债', v: '双低筛选', sub: '待建' },
          { k: '信号', v: h.signal }
        ]) +
        sigRow('观察 · 无极端超额', 'flat', '低风险投资窗口');
    }
    if (k === 'strategy') {
      var st = d.strategy;
      return sectionHead('重点概览') +
        kv([
          { k: '动量', v: st.momentum.signal, sub: st.momentum.label },
          { k: '13F 跟踪', v: st.superinvestors.tracked + ' 位', sub: '超级投资者' },
          { k: '更新', v: st.superinvestors.signal }
        ]) +
        sigRow('跟踪中', 'acc', '因子 + 顶级投资者');
    }
    if (k === 'aggressive') {
      return sectionHead('重点概览') +
        '<div class="rule warn"><h3>版式预留</h3><p>激进仓（高弹性个股 / 主题）尚在规划中，子页面将随策略落地逐步补充。此区未来承载仓位、标的与信号监控。</p></div>';
    }
    if (k === 'study') {
      return sectionHead('重点概览') +
        kv([
          { k: '最近阅读', v: '待补充' },
          { k: '主题', v: '财报·估值·行为金融', sub: '等' }
        ]) +
        sigRow('知识库', 'flat', '一本书一页');
    }
    return '';
  }

  // ---------- 顶部导航 ----------
  var sysNav = ORDER.map(function (k) {
    var s = S[k];
    var active = (SYS === k) ? ' active' : '';
    var drop = s.pages.map(function (p) {
      return '<a href="' + base + p.file + '"><span class="di">' + svg(p.icon) + '</span>' +
        '<span><span class="dt">' + p.name + '</span><br><span class="dd">' + p.desc + '</span></span></a>';
    }).join('');
    // 标签本身即为聚合首页链接，hover 展开子页
    return '<a class="ni' + active + '" href="' + base + s.index + '">' + s.name +
      '<div class="drop">' + drop + '</div></a>';
  }).join('');

  var nav = document.createElement('header');
  nav.className = 'topnav';
  nav.innerHTML =
    '<a class="brand" href="' + base + 'index.html"><span class="logo">O</span><b>origistar</b></a>' +
    '<nav class="nav-sys">' +
      '<a class="ni' + (SYS === 'home' ? ' active' : '') + '" href="' + base + 'index.html">首页</a>' +
      sysNav +
    '</nav>' +
    '<div class="nav-right">' +
      '<span class="pill" id="nav-updated">数据更新中…</span>' +
      '<button class="menu-btn" id="menuBtn" aria-label="菜单">' + svg('menu') + '</button>' +
    '</div>';
  document.body.prepend(nav);

  // ---------- 移动抽屉 ----------
  var drawer = document.createElement('div');
  drawer.className = 'drawer';
  drawer.id = 'drawer';
  var dPanel = '<div class="panel"><div style="display:flex;justify-content:space-between;align-items:center">' +
    '<div class="brand"><span class="logo">O</span><b>origistar</b></div>' +
    '<button class="menu-btn" id="closeBtn">✕</button></div>' +
    '<a href="' + base + 'index.html" style="margin-top:14px"><span class="di">' + svg('home') + '</span>首页</a>';
  ORDER.forEach(function (k) {
    var s = S[k];
    dPanel += '<h4>' + s.name + '</h4>';
    dPanel += '<a href="' + base + s.index + '"><span class="di">' + svg(s.icon) + '</span>概览</a>';
    s.pages.forEach(function (p) {
      if (p.file !== s.index)
        dPanel += '<a href="' + base + p.file + '"><span class="di">' + svg(p.icon) + '</span>' + p.name + '</a>';
    });
  });
  drawer.innerHTML = '<div class="mask" id="mask"></div>' + dPanel + '</div>';
  document.body.appendChild(drawer);
  function openDrawer() { drawer.classList.add('show'); }
  function closeDrawer() { drawer.classList.remove('show'); }
  document.getElementById('menuBtn').addEventListener('click', openDrawer);
  document.getElementById('closeBtn').addEventListener('click', closeDrawer);
  document.getElementById('mask').addEventListener('click', closeDrawer);

  // ---------- 底部 Tab（移动端）：全部直接进聚合首页 ----------
  var tabs = ORDER.map(function (k) {
    var s = S[k];
    var active = (SYS === k) ? ' active' : '';
    return '<a class="' + active + '" href="' + base + s.index + '">' + svg(s.icon) + '<span>' + s.name + '</span></a>';
  }).join('');
  var btab = document.createElement('nav');
  btab.className = 'btab';
  btab.id = 'btab';
  btab.innerHTML = tabs;
  document.body.appendChild(btab);

  // ---------- 体系内 sub-nav 胶囊 ----------
  if (SYS !== 'home' && S[SYS]) {
    var slot = document.getElementById('subnav-slot');
    if (slot) {
      slot.className = 'subnav';
      slot.innerHTML = subItems(SYS).map(function (p) {
        var act = ((PAGE === 'index' || PAGE === '') && p.overview) || (p.id === PAGE && !p.overview) ? ' active' : '';
        return '<a class="' + act + '" href="' + base + p.file + '">' + p.name + '</a>';
      }).join('');
    }
  }

  // ---------- 体系页子页入口网格（雪球式 icon grid） ----------
  var sysGrid = document.getElementById('sys-icon-grid');
  if (sysGrid && SYS !== 'home' && S[SYS]) {
    sysGrid.innerHTML = S[SYS].pages.map(function (p) {
      return '<a href="' + base + p.file + '">' +
        '<span class="sg-icon" style="background:' + grad(p.icon) + '">' + svg(p.icon) + '</span>' +
        '<span class="sg-name">' + p.name + '</span></a>';
    }).join('');
  }

  // ---------- 聚合页子页卡片 ----------
  var cards = document.getElementById('sys-cards');
  if (cards && SYS !== 'home' && S[SYS]) {
      cards.innerHTML = S[SYS].pages.map(function (p) {
      return '<a class="syscard" href="' + base + p.file + '">' +
        '<span class="sci" style="background:' + grad(p.icon) + '">' + svg(p.icon) + '</span>' +
        '<span class="sct"><span class="sct-t">' + p.name + '</span><span class="sct-d">' + p.desc + '</span></span>' +
        '<span class="arrow">›</span></a>';
    }).join('');
  }

  // ---------- 聚合页重点概览 ----------
  var ovw = document.getElementById('overview-slot');
  if (ovw && SYS !== 'home' && S[SYS]) {
    ovw.className = 'ovw';
    ovw.innerHTML = renderOverview(SYS);
  }

  // ---------- 数据时间戳 ----------
  try {
    if (window.ORIGISTAR && window.ORIGISTAR.updated) {
      document.getElementById('nav-updated').textContent = '更新于 ' + window.ORIGISTAR.updated;
    }
  } catch (e) {}

  // 暴露给首页脚本，方便自动生成 icon grid 与跟踪列表（加页面时自动同步）
  window.ORIGISTAR_NAV = { ORDER: ORDER, systems: S, base: base };
})();
