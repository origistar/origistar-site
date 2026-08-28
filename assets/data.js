/* origistar · 站点数据（可移植，纯前端）
   更新方式：本地改此文件，或后续用任意云函数/定时脚本回写。
   当前为最近一次人工核对值，页面会显示“更新于”日期。 */
window.ORIGISTAR = {
  updated: "2026-08-28",

  /* 稳健仓 · 纳指定投 (v5.1) */
  ndx: {
    pe: 33.1,            // 纳指100 当前 PE
    peLabel: "偏高",
    dd: -8.4,            // 距高点回撤 %
    dailyDCA: 1500,      // 自用每日定投 ¥
    signal: "常态定投",   // 信号
    signalType: "flat",  // up / down / flat / acc
    note: "PE>33 且浮盈>50% 触发减仓；回撤>5% 且低溢价触发网格加仓。"
  },

  /* 稳健仓 · 比特币 (仅熊市) */
  btc: {
    price: 96200,        // BTC 现价 $
    ahr999: 1.12,        // AHR999 指标
    ahr999Label: "定投区间",
    weeklyDCA: 6000,     // 周定投 ¥
    budget: 200000,      // 总预算 ¥
    signal: "常态 · 仅熊市加速",
    signalType: "flat",
    note: "AHR999<1.2 视为可定投区间；BTC<$50K 第一档加速。"
  },

  /* 防守仓 · 锚定便宜价 */
  defensive: {
    schd:  { price: 35.10, extreme: 27.0, sweet: 30.0, fair: 32.0, zone: "偏贵", zoneType: "down" },
    brk:   { price: 504.30, extreme: 450.0, sweet: 475.0, fair: 500.0, zone: "偏贵", zoneType: "down" },
    note: "价格 ≤ 甜区(甜) 进入定投；≤ 极度便宜 加倍。当前均高于合理价，等待。"
  },

  /* 低风险 · 港股打新（示例占位） */
  hkIpo: {
    watch: 3, pipeline: 5, signal: "观察 · 无极端超额认购", signalType: "flat"
  },

  /* 策略库 */
  strategy: {
    momentum: { label: "SPMO / MTUM 动量", signal: "跟踪中", signalType: "acc" },
    superinvestors: { label: "13F 顶级投资者", tracked: 8, signal: "季度更新", signalType: "acc" }
  }
};
