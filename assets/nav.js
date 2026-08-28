/* origistar · 导航引擎（零依赖、可移植）
   用法：<script src="assets/nav.js" data-system="stable" data-page="ndx-dca"></script>
   会自动注入：顶部导航(桌面下拉) + 移动抽屉 + 底部 Tab + 体系内 sub-nav 胶囊 */
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

  // 系统配置（点系统即进首个子页面；下拉/底部 Tab 直达真实页）
  var S = {
    defensive: { name: '防守仓', icon: 'defensive', desc: 'SCHD & 伯克希尔 便宜价定投', pages: [
      { id: 'schd-brk', name: 'SCHD & BRK.B', file: 'defensive/schd-brk.html', desc: '锚定便宜价监测', icon: 'schd' }
    ]},
    stable: { name: '稳健仓', icon: 'stable', desc: '纳指100 / 比特币 长期定投', pages: [
      { id: 'ndx-dca', name: '纳指定投', file: 'stable/ndx-dca.html', desc: 'PE/DD/网格决策 v5.1', icon: 'stable' },
      { id: 'btc-dca', name: '比特币', file: 'stable/btc-dca.html', desc: 'AHR999 熊市定投', icon: 'btc' },
      { id: 'ndx-history', name: '定投历史', file: 'stable/ndx-history.html', desc: '实盘记录与回测', icon: 'history' }
    ]},
    aggressive: { name: '激进仓', icon: 'aggressive', desc: '高弹性个股 / 主题（待建）', pages: [
      { id: 'overview', name: '激进仓', file: 'aggressive/index.html', desc: '版式预留', icon: 'aggressive' }
    ]},
    'low-risk': { name: '低风险', icon: 'lowrisk', desc: '港股打新 / 可转债', pages: [
      { id: 'hk-ipo', name: '港股打新', file: 'low-risk/hk-ipo.html', desc: '次新入通追踪', icon: 'ipo' },
      { id: 'cb-screener', name: '可转债', file: 'low-risk/cb-screener.html', desc: '双低筛选', icon: 'cb' },
      { id: 'cb-history', name: '可转债历史', file: 'low-risk/cb-history.html', desc: '历史回测', icon: 'history' }
    ]},
    strategy: { name: '策略库', icon: 'strategy', desc: '因子 / 顶级投资者跟踪', pages: [
      { id: 'momentum', name: 'SPMO & MTUM', file: 'strategy/momentum.html', desc: '动量轮动', icon: 'momentum' },
      { id: 'superinvestors', name: '13F 持仓', file: 'strategy/superinvestors.html', desc: '顶级投资者对比', icon: 'whale' }
    ]},
    study: { name: '研习录', icon: 'study', desc: '读书纪要 · 研报重点 · 待定', pages: [
      { id: 'index', name: '研习录', file: 'study/index.html', desc: '读书纪要 · 研报重点', icon: 'study' }
    ]}
  };
  var ORDER = ['defensive', 'stable', 'aggressive', 'low-risk', 'strategy', 'study'];

  // ---------- 顶部导航 ----------
  var sysNav = ORDER.map(function (k) {
    var s = S[k];
    var active = (SYS === k) ? ' active' : '';
    // 研习录不展开二级页面（内容太多，一本书一页），直接点进首页
    if (k === 'study') {
      var p0 = s.pages[0];
      return '<a class="ni' + active + '" href="' + base + p0.file + '" style="text-decoration:none">' + s.name + '</a>';
    }
    var drop = s.pages.map(function (p) {
      return '<a href="' + base + p.file + '"><span class="di">' + svg(p.icon) + '</span>' +
        '<span><span class="dt">' + p.name + '</span><br><span class="dd">' + p.desc + '</span></span></a>';
    }).join('');
    return '<div class="ni' + active + '" tabindex="0">' + s.name +
      '<div class="drop">' + drop + '</div></div>';
  }).join('');

  var nav = document.createElement('header');
  nav.className = 'topnav';
  nav.innerHTML =
    '<a class="brand" href="' + base + 'index.html"><span class="logo">O</span><b>origistar</b></a>' +
    '<nav class="nav-sys">' +
      '<a class="ni' + (SYS === 'home' ? ' active' : '') + '" href="' + base + 'index.html" style="text-decoration:none">首页</a>' +
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
    dPanel += '<h4>' + s.name + '</h4>' + s.pages.map(function (p) {
      return '<a href="' + base + p.file + '"><span class="di">' + svg(p.icon) + '</span>' + p.name + '</a>';
    }).join('');
  });
  drawer.innerHTML = '<div class="mask" id="mask"></div>' + dPanel + '</div>';
  document.body.appendChild(drawer);
  function openDrawer() { drawer.classList.add('show'); }
  function closeDrawer() { drawer.classList.remove('show'); }
  document.getElementById('menuBtn').addEventListener('click', openDrawer);
  document.getElementById('closeBtn').addEventListener('click', closeDrawer);
  document.getElementById('mask').addEventListener('click', closeDrawer);

  // ---------- 底部 Tab（移动端） ----------
  var tabs = ORDER.map(function (k) {
    var s = S[k]; var first = s.pages[0];
    var active = (SYS === k) ? ' active' : '';
    return '<a class="' + active + '" href="' + base + first.file + '">' + svg(s.icon) + '<span>' + s.name + '</span></a>';
  }).join('');
  var btab = document.createElement('nav');
  btab.className = 'btab';
  btab.innerHTML = tabs;
  document.body.appendChild(btab);

  // ---------- 体系内 sub-nav 胶囊 ----------
  if (SYS !== 'home' && S[SYS]) {
    var slot = document.getElementById('subnav-slot');
    if (slot) {
      slot.className = 'subnav';
      slot.innerHTML = S[SYS].pages.map(function (p) {
        var act = (p.id === PAGE) ? ' active' : '';
        return '<a class="' + act + '" href="' + base + p.file + '">' + p.name + '</a>';
      }).join('');
    }
  }

  // ---------- 数据时间戳 ----------
  try {
    if (window.ORIGISTAR && window.ORIGISTAR.updated) {
      document.getElementById('nav-updated').textContent = '更新于 ' + window.ORIGISTAR.updated;
    }
  } catch (e) {}
})();
