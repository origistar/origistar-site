/* origistar · 站点数据（可移植，纯前端）
   更新方式：本地改此文件，或后续用任意云函数/定时脚本回写。
   当前为最近一次人工核对值（示意），页面会显示“更新于”日期。 */
window.ORIGISTAR = {
  updated: "2026-08-28",

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
    note: "今日 PE×VIX=1.5份 × DD×1.0 × ¥1000 = ¥1,500；PE>33 且浮盈>50% 触发减仓，PE<32 或 DD>15% 买回。",
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
    schd:  { price: 35.10, extreme: 27.0, sweet: 30.0, fair: 32.0, zone: "偏贵", zoneType: "down", weeklyBase: 5000 },
    brk:   { price: 504.30, extreme: 450.0, sweet: 475.0, fair: 500.0, zone: "偏贵", zoneType: "down", weeklyBase: 5000 },
    note: "价格 ≤ 甜区 进入定投；≤ 极度便宜 加倍；≤ 合理价 半档；> 合理价 停止等待。当前均高于合理价，等待。"
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
    superinvestors: { label: "13F 顶级投资者", tracked: 8, signal: "季度更新", signalType: "acc" }
  }
};
