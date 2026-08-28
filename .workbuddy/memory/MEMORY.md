# origistar-site · 项目长期笔记

## 项目定位
- 用户「星哥」的个人投资监测站，纯静态、手机优先、可移植（将来可能迁离 GitHub）。
- 仓库：`origistar/origistar-site`（main 分支，根路径发布 GitHub Pages）。
- 线上地址：https://origistar.github.io/origistar-site/

## 核心约定（务必遵守）
1. **不依赖 GitHub Actions**：数据集中在 `assets/data.js`（`window.ORIGISTAR`），手动或后续任意云函数回写。站点可整体搬云。
2. **App 式信息架构**（用户认可，参考雪球）：底部 Tab = 一级频道，点一下必定直达体系聚合首页，**绝不在 Tab 上弹选择窗**；体系内子页靠顶部 sub-nav 胶囊 + 页面内卡片下钻。
3. **强制深色主题**：不跟随系统（已删除 `prefers-color-scheme` 媒体查询），手机电脑统一深色。
4. **单一数据源**：聚合页/深页的数值一律从 `data.js` 取，由 `nav.js` 的 `renderOverview()` 等函数渲染，禁止在 HTML 里硬编码重复数值。
5. **手机优先**：KPI/卡片网格手机上紧凑同行，表格不横向滚动。
6. 安全区适配：顶部 `env(safe-area-inset-top)`、底部 `env(safe-area-inset-bottom)`（注意 border-box 下 padding 会被算进固定高度，安全区需用 `calc()` 加在 height 上）。

## 六大体系
- 防守仓（SCHD & BRK 便宜价锚定）· 稳健仓（纳指定投 / 比特币 / 定投历史）· 激进仓（版式预留）
- 低风险（港股打新 / 可转债 / 可转债历史）· 策略库（SPMO&MTUM / 13F）· 研习录（读书纪要，一本书一页，汉堡菜单不展开二级）

## 关键文件
- `assets/nav.js` —— 导航引擎（零依赖）：顶部下拉 + 移动抽屉 + 底部 Tab + 体系内胶囊 + `#sys-cards` 子页卡片 + `#overview-slot` 重点概览渲染（`renderOverview()`，按 SYS 从 data.js 取数）。
- `assets/style.css` —— 设计系统：CSS 变量、`.kv`/`.kpi`/`.syscard`/`.ovw`/`.ovw-sig`/`.bigcard`/`.rule`/`.matrix` 等。
- `assets/data.js` —— 静态数据集（updated 日期 + ndx / btc / defensive / hkIpo / strategy）。
- 聚合页：`defensive|stable|aggressive|low-risk|strategy|study`/index.html，hero 后均有 `<div id="overview-slot"></div>`。

## 待办
- 二级深页仍为骨架：btc-dca、schd-brk、hk-ipo、cb-screener、cb-history、momentum、superinvestors（模板样板 = `stable/ndx-dca.html`）。
- 激进仓 / 历史类页面等用户提供内容后再填实。
