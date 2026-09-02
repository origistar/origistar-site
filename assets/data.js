/* origistar · 站点数据（可移植，纯前端）
   更新方式：本地改此文件，或后续用任意云函数/定时脚本回写。
   当前为最近一次人工核对值（示意），页面会显示“更新于”日期。 */
window.ORIGISTAR = {
  updated: "2026-09-02 15:45 北京时间",

  /* 稳健仓 · 纳指定投 (v5.1) */
  ndx: {
    pe: 30.75,           // 纳指100 当前 PE-TTM
    peLabel: "合理偏低",
    vix: 15.71,          // 恐慌指数
    dd: -5.32,           // 距 52 周高点回撤 %
    ndx: 29125,          // 纳指100 点位
    roe: 30.0,           // 指数 ROE %
    premium: 11.5,       // 513100 溢价率 %
    dailyDCA: 1500,      // 自用每日定投 ¥
    score: 46,           // 性价比评分
    scoreLabel: "中等",  // 71-100极高 / 41-70中等 / 10-40偏低
    signal: "日常期 · 常态定投",
    signalType: "flat",  // up / down / flat / acc
    // 近90天趋势（示意，便于离线/可移植；后续可接实时）
    chartLabels: ["08-10","08-11","08-12","08-13","08-14","08-15","08-16","08-17","08-18","08-19","08-20","08-21","08-22","08-23","08-24","08-25","08-26"],
    chartNdx:    [29710,29548,29803,30128,30046,30046,30046,29995,29490,29426,29213,29308,29308,29308,29023,29209,29125],
    chartScore:  [43,44,43,43,42,42,42,43,44,44,46,45,45,45,46,46,46]
  },

  /* 稳健仓 · 比特币 (仅熊市) */
  btc: {
    price: 96200,        // BTC 现价 $
    ahr999: 1.12,        // AHR999 指标
    ahr999Label: "定投区间",
    weeklyDCA: 3000,     // 周定投基数 ¥（再乘 AHR999 档位）
    weeklyBase: 3000,    // 同上，供首页计算使用
    signal: "常态 · 仅熊市加速",
    signalType: "flat",
    note: "AHR999<1.2 视为可定投区间；BTC<$50K 第一档加速。"
  },

  /* 防守仓 · 锚定便宜价（周定投基数 + 甜区乘数） */
  defensive: {
    schd:  { price: 34.83, extreme: 27.0, sweet: 30.0, fair: 33.0, expensive: 37.0, zone: "偏贵 / 等待", zoneType: "down", weeklyBase: 5000 },
    brk:   { price: 503.70, extreme: 337.0, sweet: 404.0, fair: 472.0, expensive: 506.0, zone: "偏贵 / 等待", zoneType: "down", weeklyBase: 5000 },
    note: "价格 ≤ 甜区 进入定投；≤ 极度便宜 加倍；≤ 合理价 半档；> 合理价 停止等待。当前均高于合理价，等待。"
  },

  /* 防守仓 · 黄金（战略配置价格提示，自动/手动均可） */
  gold: {
    price: null,         // 纽约黄金期货主连 GC=F $/oz，由 fetch-defensive.mjs 自动拉取
    threshold: 4100,     // ≥ 此价显示「偏贵/等待」，< 此价显示「建仓」
    fair: 4500,          // 高于此价暂停/缓投
    zone: "—",
    note: "纽约黄金期货主连 GC=F；约 $4100/oz 开第一批，每跌约 5% 加一批（越跌越买），高于 $4500 暂停。"
  },

  /* 进取仓 · 高弹性个股 / 主题（不含成本/仓位比重） */
  aggressive: {
    target: 40,          // 占系统目标权重 %
    cap: 45,             // 上限 %
    updateFreq: "每日 3 次（08:30 / 16:30 / 23:00 北京时间）",
    // 持仓标的：仓位档位(重/中/轻) + 最新价 + ATR% + 预设卖出价；趋势止盈价按 3×ATR 公式算（对应第④层清仓线）
    holdings: [
      { name: "DRAM", code: "DRAM", market: "美股", currency: "$", status: "持有", weight: "重", lastPrice: 95.00, atrPct: 0.05, userSellWarn: 80, note: "DRAM ETF，半导体周期复苏主线" },
      { name: "SK海力士", code: "000660.KS", market: "韩国", currency: "₩", status: "持有", weight: "重", lastPrice: null, atrPct: null, userSellWarn: 3000000, note: "长期看多" },
      { name: "三星电子", code: "005930.KS", market: "韩国", currency: "₩", status: "持有", weight: "轻", lastPrice: null, atrPct: null, userSellWarn: 380000, note: "长期看多，到2027年末" },
      { name: "灵宝黄金", code: "03330.HK", market: "港股", currency: "HK$", status: "持有", weight: "重", lastPrice: 22.24, atrPct: 0.082, userSellWarn: 30, note: "金价上行受益，ATR 较高" },
      { name: "龙资源", code: "01712.HK", market: "港股", currency: "HK$", status: "停牌", weight: "中", lastPrice: null, atrPct: null, userSellWarn: 12, note: "停牌中，等待复牌" },
      { name: "潼关黄金", code: "00340.HK", market: "港股", currency: "HK$", status: "持有", weight: "中", lastPrice: 3.285, atrPct: 0.062, userSellWarn: 4, note: "金矿股，波动大" }
    ],
    // 观察仓：以用户买入预警为主；回踩买点 = 最新价 × (1 − 2×ATR%)，仅作价格参考，非买入建议
    watch: [
      { name: "英伟达", code: "NVDA", market: "美股", currency: "$", status: "观察", weight: "重", lastPrice: null, atrPct: null, userBuyWarn: 200, userBuyWarn2: 190, note: "AI 算力垄断，最看多；买一先底仓，买二加" },
      { name: "台积电", code: "TSM", market: "美股", currency: "$", status: "观察", weight: "重", lastPrice: null, atrPct: null, userBuyWarn: 360, userBuyWarn2: 330, note: "先进制程 70% 市占，信仰；补纳指空白" },
      { name: "礼来", code: "LLY", market: "美股", currency: "$", status: "观察", weight: "重", lastPrice: null, atrPct: null, userBuyWarn: 1100, userBuyWarn2: 1000, note: "GLP-1 垄断，玑哥\"矛\"；补纳指空白（玑哥补锚）" },
      { name: "微软", code: "MSFT", market: "美股", currency: "$", status: "观察", weight: "中", lastPrice: null, atrPct: null, userBuyWarn: 400, userBuyWarn2: 360, note: "压舱石，深折让等回调" },
      { name: "谷歌", code: "GOOGL", market: "美股", currency: "$", status: "观察", weight: "中", lastPrice: null, atrPct: null, userBuyWarn: 330, userBuyWarn2: 300, note: "搜索垄断+Gemini，压舱石（玑哥补锚）" },
      { name: "亚马逊", code: "AMZN", market: "美股", currency: "$", status: "观察", weight: "中", lastPrice: null, atrPct: null, userBuyWarn: 200, userBuyWarn2: 175, note: "云+电商压舱石，买二为玑哥建议深档" },
      { name: "ARM", code: "ARM", market: "美股", currency: "$", status: "观察", weight: "中", lastPrice: null, atrPct: null, userBuyWarn: 230, userBuyWarn2: 210, note: "CPU 架构近垄断；买二为玑哥建议深档" },
      { name: "博通", code: "AVGO", market: "美股", currency: "$", status: "观察", weight: "轻", lastPrice: null, atrPct: null, userBuyWarn: 300, userBuyWarn2: 270, note: "备胎≤2.5%，300 以内才捞，270 再加" },
      { name: "英特尔", code: "INTC", market: "美股", currency: "$", status: "观察", weight: "轻", lastPrice: null, atrPct: null, userBuyWarn: 70, userBuyWarn2: 50, note: "美国半导体主权彩票≤2%，买二为玑哥建议深档" },
      { name: "罕王黄金", code: "03788.HK", market: "港股", currency: "HK$", status: "观察", weight: "中", lastPrice: 3.415, atrPct: 0.063, userBuyWarn: 3.2, userBuyWarn2: 2.65, note: "2028-2030 年目标投产-达产 5-8 吨黄金，预计利润 15-30 亿+（按 4000 美金金价），3-5 年 150-300 亿市值，2-5 倍空间。核心管理层都有持股、紫金矿业入股（2026.1 月配售进入，每股 3.8 港元）。紫金矿业是成长-成熟期，罕王则是半风投型持股。" }
    ],
    // 5 层趋势止盈规则（分层定性 + 个股独立校准）
    stopRules: [
      { layer: "① 预警", cond: "收盘价连续 2 日跌破 MA20，或回撤 ≥ 2×ATR", action: "进入观察，不操作" },
      { layer: "② 波动落袋", cond: "ATR 分位 > 75%，或单日涨幅 > 2×ATR", action: "减 1/3 仓位" },
      { layer: "③ 趋势破坏", cond: "收盘价跌破 MA50 且周线 < MA10", action: "再减 1/2" },
      { layer: "④ 清仓", cond: "自高点回落 ≥ 3×ATR", action: "清仓" },
      { layer: "⑤ 负成本", cond: "盈利 ≥ 1R 后，止损上移至成本", action: "锁定零成本" }
    ],
    // 趋势止盈价/距买一 计算口径（脚本自动拉行情后按此公式生成）
    warnFormula: {
      holdings: "峰值(52周最高) × (1 - 3×ATR%) = 趋势止盈价（第④层清仓线，ratchet 高点止损）",
      watch: "距买一 = (最新价 − 买一价) / 买一价；≤0 即触发买一；≤买二价即触发买二"
    },
    decisionLog: {
      fields: ["买入理由", "预期催化剂", "证伪条件", "计划持有期", "季度回看"],
      note: "每笔建仓填写以上五项；季度末回看：逻辑是否兑现、是否触发止盈/止损、是否该加/减。"
    }
  },

  /* 低风险 · 港股打新 */
  hkIpo: {
    watch: 3, pipeline: 5, signal: "观察 · 无极端超额认购", signalType: "flat",
    latest: "梅卡曼德 09615",   // 当前打新/待上市标的（首页展示；也会尝试读 low-risk/hk-data.json 覆盖）
    latestStatus: "申购中"
  },

  /* 低风险 · 可转债双低 */
  cb: {
    signal: "今日空仓",
    detail: "双低筛选未触发",
    type: "flat"
  },

  /* 策略库 */
  strategy: {
    momentum: { label: "SPMO / MTUM 动量", signal: "跟踪中", signalType: "acc" },
    superinvestors: { label: "13F 顶级投资者", tracked: 8, signal: "季度更新", signalType: "acc" },
    jinjiancheng: { label: "金渐成（玑哥）", signal: "三仓体系 · 负成本", signalType: "acc" },
    laolei: { label: "老雷", signal: "全球配置 · 垄断", signalType: "acc" }
  },

  /* 系统配置追踪（3:3:4） */
  config: {
    updated: "2026-08-30",
    target: { defensive: 30, stable: 30, aggressive: 40 },
    cap:    { defensive: 35, stable: 35, aggressive: 45 },
    current: { defensive: 5, stable: 10, aggressive: 70 },  // 当前实际仓位占比（%）
    cashOutside: true,    // 现金仓在体系外，不计入
    rebalance: {
      stages: [
        "① 现金流再平衡：每月新增资金按目标权重注入缺口账户",
        "② 阈值再平衡（5/25 规则）：单一账户偏离目标 > 5% 且相对幅度 > 25% 时触发",
        "③ Glide path：临近用钱期（如退休）逐步降低进取仓占比"
      ],
      halfYearCheck: [
        "各仓实际占比 vs 目标 30 / 30 / 40",
        "进取仓是否超过上限 45%",
        "个股集中度（单一标的占进取仓）是否 > 40%",
        "现金仓是否充足（覆盖 1–2 年支出）",
        "黄金战略配置是否达 10%",
        "止盈 / 止损纪律执行情况",
        "是否有新逻辑需要调仓",
        "再平衡记录与决策留痕完整性"
      ]
    }
  }
};
