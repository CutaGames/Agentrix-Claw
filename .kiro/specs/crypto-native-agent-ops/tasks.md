# Implementation Plan

> Crypto-Native Agent Ops（滩头专项）· 任务清单

## Overview

顺序 = P0 优先:先打地基(模块骨架 → AgentAccount 打通 → 分级审批 → 浏览器编排)→ 再上第一个可验证垂直活儿(尽调 + 结算闭环)→ 监控/安全 → 项目方交付包;P1 在后(桌面 GUI 加固、空投、S2/S3 辅助、团队产品化)。
每个任务只做编码 + 单测/集成测,复用既有模块(relayer/commission/escrow、PolicyEvaluator、CDP、agent-team、AgentAccount、BullMQ/@Cron),不重造。每条标注对应需求。

## Tasks

### 阶段 0 — 模块骨架与契约

- [x] 1. 建后端 `agent-ops` 模块骨架 + 数据模型
  - 新建 `backend/src/modules/agent-ops/`(module/controller/service 占位);在 `app.module` 注册。
  - 新增实体 + 迁移:`agent_ops_task`、`agent_ops_deliverable`、`agent_ops_action_log`、`approval_grant`、`monitor_subscription`(SnakeNamingStrategy,additive)。
  - 单测:实体与 repository 基本 CRUD。
  - _Requirements: 2.4, 8.4, 9.4_

### 阶段 1 — 底座:AgentAccount 经济身份打通(需求 7)

- [x] 2. 额度联动闭环(A 组)
- [x] 2.1 `AgentAccountService.recordSpending` 增加幂等键,改为幂等写入。
  - 单测:重复 idempotencyKey 只记一次;被拒动作不记账。
  - _Requirements: 7.1, 7.2, 7.3, 7.4_
- [x] 2.2 在结算出口挂钩自动调用 `recordSpending`:`relayer.service`、`agent_hire_escrow` release、commission 分账完成处。
  - 集成测:一笔结算 → usedToday/统计正确增长且账实一致。
  - _Requirements: 7.1, 7.2_
- [x] 3. 额度定时重置(B 组):`AgentAccountResetScheduler`(`@Cron`)按 `limitResetDate`+UTC 重置,漏跑补偿。
  - 单测:跨日/跨月重置;漏跑补偿;时区边界。
  - _Requirements: 7.5, 7.6, 7.7_
- [x] 4. 信用评分自动更新(C 组):escrow release/dispute refund/任务失败处调 `updateCreditScore`;creditScore→riskLevel 映射。
  - 单测:加/减分边界(0–1000)、riskLevel 映射、creditScoreUpdatedAt 同步。
  - _Requirements: 7.8, 7.9, 7.10, 7.11_
- [x] 5. 钱包绑定(D 组):`AgentWalletService`(MpcWalletProvider 占位 + 外部钱包验签 + 失败回滚 + defaultAccountId 双向)。
  - 单测:验签通过/失败;绑定失败回滚不留半写;defaultAccount 一致。
  - _Requirements: 7.12, 7.13, 7.14, 7.15_
- [x] 6. 密钥签发与验签(F 组):`AgentKeyService`(密钥对 + secret 一次性 + 验签复用 agent-execute-payment)。
  - 单测:secret 不可二次读取;验签失败拒绝;密钥不入日志/回包。
  - _Requirements: 7.19, 7.20, 7.21_
- [x] 7. 能力门控单一权威源(G 组)+ 前台状态(H 组)。
  - 单测:未声明工具被拒;状态枚举与后端一致(无空占位)。
  - _Requirements: 7.22, 7.23, 7.24, 7.25_
- [x] 8. 链上身份存证(E 组,默认 testnet + 开关):`AgentOnchainIdentityService`(ERC-8004 注册 + EAS + 失败降级)。
  - 单测:注册写回字段;失败降级不阻塞;主网为显式开关。
  - _Requirements: 7.16, 7.17, 7.18_

### 阶段 2 — 底座:分级审批(需求 3)

- [x] 9. 风险分级与红线双层:扩展 `PolicyEvaluatorService` 做 read/medium/high/redline;后端红线与 Rust `redlines.rs` 对齐。
  - 单测:各级判定;红线在任何策略下被拒(Property 3)。
  - _Requirements: 3.1, 3.2, 3.3, 3.5, 6.2_
- [x] 10. 会话/任务预算授权 `ApprovalGrant`:范围内自动放行,越界回落人确认(复用 `requireDesktopActionApproval`)。
  - 单测:范围内放行、超预算/过期回落(Property 9)。
  - _Requirements: 3.4_

### 阶段 3 — 底座:浏览器自动化编排(需求 2)

- [x] 11. `TaskOrchestrator` 编排循环:读取(eval/选择器)→ LLM 决策 → CDP 动作 → 回执;锚定优先级;失败结构化原因 + 重试/降级;落 `agent_ops_action_log`。
  - 集成测:mock 页面读取/点击/导航成败路径;审计轨迹完整。
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

### 阶段 4 — 散户 P0:尽调(需求 8)+ 结算闭环(需求 5/12.1)

- [x] 12. 尽调数据源插件框架:`DataSourcePlugin` 接口 + 首批只读插件(区块浏览器+DEX+1 官方/审计源)。
  - 单测:失败跳过标「未获取」;不编造。
  - _Requirements: 8.1, 8.3, 8.5_
- [x] 13. `DueDiligenceEngine` + `DeliverableValidator`:结构化报告 + 按验收清单(A+B)判合格 + 交付物落库。
  - 单测:验收清单逐项;缺项/违反真实性→不合格(Property 7);报告自洽。
  - _Requirements: 8.1, 8.2, 8.4, 8.6_
- [x] 14. 被雇佣结算 + 多跳分佣闭环:x402 挂牌 → 权威定价 → escrow/relayer USDC → `split-tree-generator` 分佣 → Commission → `recordSpending`。
  - 集成测:全链路;分佣守恒(Property 6);AXP/USDC 边界。
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 12.1, 12.4_
- [x] 15. 可靠性度量埋点:自主完成率/质量合格率(人工抽检入口)/时延 + 冷启动漏斗。
  - 单测:指标口径正确。
  - _Requirements: 18.1, 18.2, 18.4_

### 阶段 5 — 散户 P0:监控 + 安全防护(需求 9/10)

- [x] 16. `MonitorScheduler`:`@Cron`+BullMQ 周期只读检查 + 多端推送(复用 voice `output-dispatcher`)+ 任务增删改。
  - 集成测:触发推送;多端送达;增删改。
  - _Requirements: 9.1, 9.2, 9.3, 9.4_
- [x] 17. `SecurityGuard`:授权扫描+标注+引导撤销(人确认签名)+ 交易模拟适配器 + 骗局检查;只读为主。
  - 单测:高风险授权标注;撤销走人确认;不代执行资金。
  - _Requirements: 10.1, 10.2, 10.3, 10.4_

### 阶段 6 — 项目方 P0:交付包 + sybil 检测(需求 13/14/15)

- [x] 18. 交付包任务模板框架 + S0 建设期包(文档/品牌社媒/赛道研究/审计协调)。
  - 单测:交付物产出 + 写动作接分级审批。
  - _Requirements: 13.1, 13.2, 13.3, 13.4_
- [x] 19. S1 增长交付包(6 个)
- [x] 19.1 社媒增长运营(量化口径 + 真实增长校验 + 拒刷量)。 _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6_
- [x] 19.2 内容/meme 生产(日历+素材)。 _Requirements: 14.7, 14.8, 14.9, 14.10_
- [x] 19.3 KOL 发现/外联/CRM(去重+真实性 + 谈判人确认)。 _Requirements: 14.11, 14.12, 14.13, 14.14, 14.15_
- [x] 19.4 Quest/活动(配置+核验+反 sybil)。 _Requirements: 14.16, 14.17, 14.18, 14.19_
- [x] 19.5 社区审核+情绪日报 / 白名单收集。 _Requirements: 14.20, 14.21, 14.22, 14.23, 14.24, 14.25_
- [x] 19.6 增长全局合规红线断言(买粉/机器人/刷量被拒)。 _Requirements: 14.26, 6.2_
- [x] 20. 贯穿层:协议/金库/治理监控 + sybil 只读检测(评分+可疑簇+依据,不处置)+ FUD 情绪 + 报告/KPI 看板。
  - 单测:sybil 评分;只读不处置;报告按时。
  - _Requirements: 15.1, 15.2, 15.3, 15.4_

### 阶段 7 — P1(滩头验证后)

- [x] 21. 桌面 GUI 加固(需求 4):无障碍树 grounding + set-of-marks + 窗口聚焦 + 接分级审批。
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
- [x] 22. 空投发现与合法协助领取(需求 11):资格发现/提醒/协助领取(签名人确认)/排除 sybil。
  - _Requirements: 11.1, 11.2, 11.3, 11.4_
- [x] 23. S2/S3 辅助(需求 16):上所/做市监控/BD/IR/治理(「agent 辅助」不承诺结果)。
  - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5_
- [x] 24. Agent 团队产品化(需求 17):provisionTeam 定制 + 三模式计费 + 协作编排 + 计量看板 + 多跳分佣 + 团队级预算。
  - _Requirements: 17.1–17.27_

## Task Dependency Graph

```
1 (骨架+数据模型)
├─ 2 (额度联动) → 4 (信用评分,依赖 escrow 事件)
├─ 3 (额度重置)
├─ 5 (钱包绑定)
├─ 6 (密钥) ─┐
├─ 7 (能力门控/前台)
└─ 8 (链上身份,依赖 5/6)

9 (分级审批分级) → 10 (审批预算授权)
   └─(9 依赖红线集,独立于阶段1)

11 (浏览器编排) 依赖 1;为 12/13/16/17/19/20 提供执行底座

12 (数据源插件) → 13 (尽调引擎/Validator) 依赖 11
14 (被雇佣结算) 依赖 2.2 + 5 + 现有 relayer/commission/escrow
15 (度量埋点) 依赖 13

16 (监控) 依赖 1 + 11
17 (安全防护) 依赖 11 + 10(撤销需人确认)

18 (交付包框架) 依赖 1 + 9
19.x (S1 增长包) 依赖 18 + 11 + 9/10
20 (贯穿监控/sybil) 依赖 1 + 11

P1: 21 依赖 9/10;22 依赖 11+10+11;23 依赖 11;24 依赖 14+10+agent-team 既有模块
```

**关键路径(P0 最短可验证闭环):** 1 → 11 → 12 → 13 → 15(尽调可跑 + 可度量)→ 2.2/14(被雇佣结算闭环)。
底座 2–10 可与 11–13 并行,但 14 结算依赖 2.2 与 5。

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"], "rationale": "模块骨架+数据模型,所有任务的前置" },
    { "wave": 2, "tasks": ["2.1", "3", "5", "6", "7", "9", "11", "12"], "rationale": "底座与编排可并行;均只依赖任务1" },
    { "wave": 3, "tasks": ["2.2", "4", "8", "10", "13", "16", "18"], "rationale": "依赖 wave2:结算挂钩(2.2)、信用(4 依赖escrow)、链上(8 依赖5/6)、审批预算(10)、尽调引擎(13 依赖11/12)、监控(16)、交付包框架(18)" },
    { "wave": 4, "tasks": ["14", "15", "17", "19.1", "19.2", "19.3", "19.4", "19.5", "19.6", "20"], "rationale": "结算闭环(14 依赖2.2/5)、度量(15 依赖13)、安全(17 依赖10/11)、S1 增长包(依赖18)、贯穿监控(20)" },
    { "wave": 5, "tasks": ["21", "22", "23", "24"], "rationale": "P1:桌面加固/空投/S2S3辅助/团队产品化,滩头验证后" }
  ]
}
```

## Notes

- 先做关键路径(1→11→12→13)拿到尽调自主完成率数据(需求 18 门槛:自主 ≥80% / 质量 ≥90%),验证生死线再扩。
- 复用优先:任何"新建"前先确认既有模块(escrow/commission/relayer/policy-evaluator/agent-team)能否扩展。
- 红线与合规为硬约束(Property 3/4/10),所有写操作任务必须接分级审批(任务 9/10)。
- 链上相关(8/14)默认 BSC testnet;上主网需合约审计 + relayer 风控,属待复核,不在 P0 编码范围内强推。
- 每个任务完成需通过 `tsc --noEmit` + 相关 jest;后端改动按既有部署流程验证。
