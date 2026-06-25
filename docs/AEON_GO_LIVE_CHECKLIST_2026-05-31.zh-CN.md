# Aeon(永曜城)上线前清单 — Go-Live Checklist

> 2026-05-31。基于实际代码 + 生产部署状态盘点(非空泛清单)。
> 图例:✅ 已完成 · 🟡 进行中/部分 · ⬜ 未开始 · 🔴 阻断上线
> 关联:`.kiro/specs/agentrix-world/`、`AEON_CONCEPT_ART_REVIEW`、`AEON_ART_DOUBAO_BRIEF`。

## 0. 已就绪(回顾)
- ✅ Phase 0-5 全部代码完成,生产部署(`47.130.176.148` :3000,PM2 `agentrix-backend`)。
- ✅ 4 个属性测试 16 用例在生产 jest 通过;lockfile 经 `npm ci --legacy-peer-deps` 验证。
- ✅ 后端 HTTP E2E 闭环 22/22 通过(圈地→公司→悬赏→接单→验收放款→建造→新闻→收件箱)。
- ✅ 迁移:AeonWorldPhase1/3/4 已在生产应用(plots/rooms/orgs/members/tasks/ledger/build_items)。

---

## A. 硬阻断(不做不能上线)

### A1 · 美术量产 🔴⬜
- 现状:全 emoji 占位。门禁文档 + 豆包 prompt 已就位(`AEON_ART_DOUBAO_BRIEF`)。
- 待办:出 CA-1/2/3 概念图过门禁 → 建造目录 10 项贴图 → 房间背景 5 张 → 替换 `BuildService.CATALOG.icon` + 渲染层切 `<Image>`。
- 责任:外部美术/豆包。**最大单项,且非纯工程。**

### A2 · 移动端原生依赖 + APK 🔴🟡
- 现状:MapLibre(地图)、expo-sensors 未进 `package.json`(会破 `npm ci`)。Aeon 屏已写但未进真机。
- 待办:WSL `npx expo install @maplibre/maplibre-react-native` → EAS 重建 APK → 跑 `.maestro/60-aeon-world-closed-loop.yaml` 真机验收。

### A3 · Redis 多实例 adapter 实战 🟡
- 现状:Phase 0 spike 单机 p95=33.5ms 达标;Redis adapter 代码就绪(`aeon-redis.adapter.ts` 优雅降级)。
- 待办:确认生产是单实例(则当前够用)还是多 PM2 实例(需压测 Redis fan-out)。上线规模决定。

### A4 · 真钱合规闭环 🔴🟡
- 现状:合规闸门(KYC/AML/未成年/地区)逻辑完整,但 `req.user.kycPassed` 等是占位(全 undefined→false)。AXP 路径完全可用。
- 待办:接平台现有 KYC/AML 服务填充 ComplianceContext。**接通前:数字货币功能保持关闭,只放 AXP**(代码已支持回退)。

---

## B. 体验完整性(影响留存,强烈建议上线前)

### B5 · agent 真实驱动 ✅(本次完成)
- `AeonAgentWorkerService`:agent 员工打卡 → 自主回合循环(找开放 KPI 任务→接单→Bedrock 生成产出→提交交付物→房间内播思考/打字/完成动作 + 移动,实时可见)→ 写 owner 收件箱。
- 决策 seam:默认 Bedrock(低成本),`decideWork()` 一处即可换成 OpenClaw SSE,不耦合 4000 行 OpenClawProxyService。
- ClockInService 打卡即 register + 跑一回合;下岗 unregister。
- ⬜ 待接:把 `decideWork()` 切到真实 OpenClaw 任务执行(可选增强);定时器周期 `tickAll()`(目前打卡触发一回合,可加 @Interval 周期推进)。

### B7 · Trust3 高风险闸门串联 ✅(本次完成)
- `AeonHighRiskGateService`:复用平台 `SignRequestService`(Trust3)。agent/copilot 态 + 大额(≥500 AXP)或任何数字货币花费 → 创建 sign-request → 推移动端生物识别 → 轮询至 completed/cancelled/expired;拒绝/超时抛 Forbidden 且**不记账**(R11.4)。manual 态免闸门。
- 已串入 `AeonEconomyService.transfer({ controlState })`;无 sign-request 服务时降级放行 + 告警(开发环境)。
- ⬜ 待接:调用方(task verify / org payWage / marketplace)在 agent 态下传 `controlState: 'agent'`(当前默认 manual,真人发起;agent-worker 自主花费路径接入时传)。

### B6 · task_search 真实检索 🟡
- 现状:任务广场用 DB 直查 `listOpen`。够用,但没接平台 task_post/task_search 工具做跨域检索。
- 待办:可选,规模大时接。

### B8 · world-sim 事件流 → 世界新闻自动 hook 🟡
- 现状:新闻在 org/task 动作时发(company_founded/bounty/accept/complete 已验证)。
- 待办:接 world-sim 周期 tick → `WorldNewsService.publishMicroStory()` 自动涌现微剧情(可选增强)。

---

## C. 运营 / 上线准备

### C1 · CI gate ⬜
- 加 Aeon jest(`src/modules/aeon/__tests__`)+ E2E 到 CI;**必须 `npm ci --legacy-peer-deps`**(裸 npm ci 因 langchain peer 冲突会断)。

### C2 · 容量 / 成本投影 ⬜
- 用 spike 的每参与者带宽 × 在线时长 × 并发,投影 20→100→1000 用户的服务器/Redis/Bedrock 成本。

### C3 · 内容审核 + 举报 ⬜🔴(UGC 上线必须)
- 建造物/房间名/聊天/世界新闻是 UGC。需接平台审核 + 举报路径(design Phase 4 提及未实现)。
- agent-to-agent 交互日志留存供 owner 审阅(R21.4)已设计,举报路径待补。

### C4 · 数据埋点 ⬜
- 关键漏斗:进地图→圈地→进房间→开公司→发/接任务→完成。留存/转化埋点。

### C5 · 灰度 + 回滚 ⬜
- 功能开关(admin_config)控制 Aeon 入口可见性;灰度放量;回滚预案(迁移可逆,已写 down())。

---

## 推荐上线路径(MVP 最小可玩)

1. **A1 美术**(并行委托豆包,关键路径)+ **A2 APK**。
2. **A4 只放 AXP**(数字货币先关),绕开 KYC/AML 阻断。
3. **C3 审核/举报**(UGC 合规底线)。
4. B5/B7 已就绪 → 让"agent 进游戏打卡干活赚 AXP"核心卖点可玩。
5. C1 CI gate + C5 灰度开关 → 小范围灰度。

> 工程侧(后端价值闭环 + agent 驱动 + 高风险闸门)已基本就位。离"可玩上线"主要卡在
> **A1 美术** 和 **A2 APK 真机** 两个非纯后端项,以及 **C3 UGC 审核** 这条合规底线。
