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

## ⚠️ 本文件被 git 跟踪（重要）
`MEMORY.md` 与 `2026-08-28.md` 已被 `git ls-files` 纳入版本控制。每次 `git reset --hard FETCH_HEAD` 同步远端时，**本文件会被重置为远端版本，本地新增的约定全部丢失**。
- 因此：**任何写入本文件的重要约定，必须同步用 Contents API 部署到远端**，否则下次 reset 就没了。
- 根治建议（待用户确认）：加 `.gitignore` 忽略 `.workbuddy/`，并 `git rm --cached` 解除跟踪。

## 目录与 Git 铁律（2026-08-31 血的教训，违反会毁仓库/回滚线上站）
1. **唯一工作目录 = `D:\workbuddy\origistar-site`**，这是全盘唯一能推 `origistar/origistar-site` 的目录。
   - 会话默认 cwd 是 `D:\workbuddy\金建成`（另一个项目），**动手前必须先 `cd` 到本项目并核对 `git remote -v`**。
   - 本项目与金建成站**完全独立**（用户多次强调）。金建成 = `origistar/JJC`，本站点 = `origistar/origistar-site`。
2. **禁止 `git rebase`**：曾因 `git rebase FETCH_HEAD` 中断，把 `.git/refs` 整个删掉 + objects 残缺，仓库直接报废。要对齐远端只用 `fetch` + `reset --hard FETCH_HEAD`。
3. **部署走 GitHub Contents API 单文件 PUT**。
   - 令牌：`ghp_El...` 经典 PAT（repo 权限）。**已从 `.git/config` 清除，不在任何配置文件明文存放**。
   - 注意区分：JJC 仓库里嵌的是**细粒度 PAT，仅限 JJC 单仓库**，推本项目会 403。
   - **本环境 Python `urllib` 对 api.github.com 会持续报 `SSL: UNEXPECTED_EOF_WHILE_READING`（重试无效），但 `curl` 正常**。**优先用 curl**：Python 生成 base64 payload → 管道传给 `curl -X PUT -d @-`。
4. **本环境 `git clone` 不可用**：clone 只写 sandbox overlay，真实磁盘上看不到产出文件；且存在"幽灵目录"。要建仓库一律用「`git init` → `remote add` → `fetch` → `reset --hard`/`checkout -f -B main`」在真实目录里操作。
5. **`git -C <path>` 不可靠**（报 cannot change to），必须 `cd <path>` 后再跑 git。
6. 任何 git 写操作前，先确认 `pwd` 与 `git remote -v`；临时脚本用完即清。
7. 推送后远端会前移，本地用 `git fetch <url> main` + `git reset --hard FETCH_HEAD` 同步（注意：`reset` 会覆盖被跟踪的 `MEMORY.md`，见上）。

## ⚠️ IMA MCP 的能力边界（2026-08-31 实测）
- **能读**：IMA「知识库」（`Star的知识库`，id `0019ceb62c805e63`）——可列文件夹、列文件、搜索、`fetch_media_content` 取正文。
- **读不到**：IMA 左侧「笔记」模块里用户手写的纪要。MCP 只开放知识库接口，**没有读取「笔记」的接口**。
  - 实测：按 media_type=NOTE 过滤只返回 2 条旧笔记，不含用户新写的读书纪要；搜索书名返回的都是原书 PDF/EPUB。
- **结论**：要往研习录放用户自己写的读书纪要，别指望 IMA MCP。**让用户把笔记导出成 md 放到 `D:\workbuddy\` 下再读文件**。
- 用户明确要求：研习录内容**只用他自己的笔记原文**，不许自己找 PDF 精简，也不许精简他的笔记。

## 研习录（study/）加书配封面流程 + 笔记转换
- **封面**：商品书自动抓真实书封（豆瓣/孔夫子）→ `study/covers/<slug>.jpg`；非商品书由 AI 生成或留渐变占位。书名/作者放封面下方 `.book-meta`，不压封面。
- **笔记转 HTML**：用 **mistune**（不是 Python `markdown`）。mistune 对用户笔记里大量 3 空格嵌套列表能正确渲染为嵌套 ul/ol；Python `markdown` 会把嵌套列展平。
  - 自动去掉笔记顶部书名 H1（避免与页面 hero 重复），同步更新 `<title>` 与 hero h1。
- **书架网格**：手机 3 列 / ≥720px 4 列 / ≥1000px 5 列。
- **标签**：每本书只保留 1 个（用户指定：定投/宏观/人物/A股/比特币/成长/定投/学习）。CSS 兜底 `.book-tags span:nth-child(n+2){display:none}`。
- 每本书一个独立读书页（`study/<slug>.html`，`.reader` 排版 + 「← 回研习录」胶囊）。
