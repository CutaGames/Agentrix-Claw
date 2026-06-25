# Implementation Plan

> AI 萌宠赚钱飞轮 · 任务清单。每个任务只做编码 + 验证，扎根真实符号；每个需求切片以"端到端验证 + 部署"收口（不允许只交一层）。后端按 AGENTS.md 工作流（tsc/jest → SSH 部署 → DB/生产实测 → 记 `.kmdeploy/_deploy_record.md`）；移动端镜像触发 APK 真机重验。

## Overview

10 个顶层任务覆盖 9 条需求 + 全飞轮 E2E。地基先行（AXP 幂等 + 统一费率解析），再做收益聚合层，然后各需求切片并行（移动端收益中心、萌宠经济主体、裂变、兑付、半自主、指标），最后全飞轮 E2E 收口。每个切片自带端到端验证 + 部署 + 移动端真机重验，确保"飞轮某一环真实运转"可独立见证，不出现"task 全做完却没达成目的"。

## Tasks

- [x] 1. AXP 幂等地基（spend 幂等 + earn source 扩充）
  - [x] 1.1 spend 幂等
    - `axp.service.ts`：新增 `IDEMPOTENT_SPEND_SOURCES`；`spend()` 对其中 source + `refId` 走精确一次（pre-check 存在即返回当前余额，并发用 23505 兜底，对齐既有 earn 逻辑）。
    - 新迁移：partial unique index `uq_axp_spend_idem ON user_axp_ledger(user_id, source, ref_id) WHERE direction='spend' AND ref_id IS NOT NULL`；若 earn 侧 idem index 缺失一并补。
    - 单测：同 `(user,source,refId)` 重复 spend 不双扣、余额只变一次。
    - _Requirements: 5.2, 8.1_
  - [x] 1.2 earn source 幂等集合扩充
    - `axp.service.ts`：`IDEMPOTENT_EARN_SOURCES` 加入 `referral_signup`、`referral_gmv_pct`。
    - 单测：重复 refId 的 referral earn 不双发。
    - _Requirements: 4.1, 4.2, 4.3, 8.1_

- [ ] 2. 统一抽佣 FeeResolverService + 费率收敛（需求 9）
  - [x] 2.1 FeeResolverService + 新常量
    - 新增 `modules/commission/fee-resolver.service.ts`：唯一费率解析入口，内部用 `resolveRates`/`FINANCIAL_PROFILES`；暴露 `resolvePlatformFee(assetType, gmv, ctx)`、`resolveReferralGmv(gmv)`。
    - `financial-architecture.config.ts`：新增 `CREATION` profile（base+pool 合计 5%）、`AGENT_HIRE` profile（合计 10%）、常量 `REFERRAL_GMV_RATE=0.02`、`REFERRAL_SIGNUP_INVITER=200`、`REFERRAL_SIGNUP_INVITEE=200`。
    - 单测：各 profile 解析数值正确；referral gmv = gmv×0.02。
    - _Requirements: 9.1, 9.4_
  - [ ] 2.2 收敛三处游离费率（仅动这三项，其余不变）
    - **⚠️ 勘探发现（待谨慎处理）**：三处并非干净的硬编码常量——`developer-revenue` 是 `developer-account.entity.ts` 的 `DEVELOPER_TIER_CONFIGS.revenueSharePercent`（按等级配的开发者分成，非单一 15% 平台费）；`multi-agent` 在 `agent-hire-escrow.service.ts` 无干净 30% 常量（仅"超支平台吸收+按 agreedUsd 封顶"）。需逐模块登记真实值/位置 + 对拍后再改，避免破坏线上 BNB 测试链已跑通的结算语义。
    - `developer-revenue` → 引用 FeeResolver 的 DEV_TOOL（10%）。
    - `multi-agent-marketplace.service` 硬编码 30% → FeeResolver 的 AGENT_HIRE（10%）。
    - `creation`/`creator-studio` 结算 → FeeResolver 的 CREATION（5%）。
    - 登记 `human-commission`/`off-ramp-commission` 现值并改引用统一配置（数值不变）。
    - 单测：改配置费率 → 对应线抽佣同步变化；既有 BNB 测试链相关费率数值未变。
    - _Requirements: 9.1, 9.2, 9.3, 9.5_

- [x] 3. 收益聚合层后端 pet-earnings（需求 1）
  - [x] 3.1 模块骨架 + 分类映射
    - 新建 `modules/pet-earnings/`：`pet-earnings.module.ts`、`earning-source-map.ts`（AXP earn source → 展示分类，design 表为准）。
    - 单测：第一期每个 earn source 都有分类、无遗漏。
    - _Requirements: 1.2_
  - [x] 3.2 PetEarningsService 聚合 + Controller
    - `pet-earnings.service.ts`：`getSummary`（`AxpService.getBalance` + USDT 结算聚合）、`getBreakdown(range)`（`user_axp_ledger` earn 按 source 分组 + USDT 独立币种分组，不相加）、`getTimeline(range)`（按日，AXP/USDT 分序列）。空数据返回零值。
    - `pet-earnings.controller.ts`：`GET /pet-earnings/summary|breakdown|timeline`（JwtAuthGuard，userId 取 req.user）。注册进 AppModule。
    - 单测：聚合守恒（Property 1）、单位隔离（Property 4）。
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_
  - [x] 3.3 端到端验证 + 部署
    - 构造测试用户：写 task_complete/skin_sold/lsm_payout 三笔 AXP earn + 一笔 BNB 测试链 USDT 集市结算 → 校验 summary（AXP=三笔和、USDT=结算额）、breakdown 分类与币种、timeline 日期桶。
    - tsc/jest → SSH 部署 → 生产 DB 实测查询 → 记 `_deploy_record.md`。
    - _Requirements: 1.7_

- [ ] 4. 移动端收益中心（需求 2）
  - [x] 4.1 api + 收益卡 + 收益中心屏
    - `src/services/petEarnings.api.ts`（getSummary/getBreakdown/getTimeline）。
    - `src/components/pet/EarningCard.tsx`（余额 AXP+$、今日新增、入口），插入萌宠主屏。
    - `src/screens/PetEarningsScreen.tsx`（余额头部 + 分类占比 + 走势折线复用/抽出 `OddsHistoryChart` svg 折线 + 明细列表分页调 AXP listHistory）。空态文案齐全。
    - "去兑付"跳兑付页（占位至任务 7）。
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  - [ ] 4.2 端到端验证 + APK
    - **APK 构建已触发**（2026-06-25）：镜像 commit `cc4808aa`（剥离 11 个含 secret 的无关文件后）推送到 `public_claw` 分支 `build/pet-earning-flywheel-2026-06-25` → 触发 Agentrix-Claw APK CI。产物：`https://github.com/CutaGames/Agentrix-Claw/releases`（build-<runid>）。
    - **待用户真机验证**：装包后查看「我的 → AXP 中心 → 收益中心」数字与后端一致（这是 4.2 验收的用户侧环节）。

- [ ] 5. 萌宠=经济主体（需求 3）
  - [x] 5.1 绑定流程 + 合并视图
    - `living-pet` 服务新增 `ensureEarningCapability(userId)`：`boundAgentAccountId` 空则调 `UnifiedAgentService.createUnifiedAgent` 并回写，幂等。
    - `UnifiedAgentService` 新增 `getPetEconomicProfile(userId)`：合并 LivingPet（名/人格）+ AgentAccount（钱包/可用额度/信用分/统计）+ `PetEarningsService.getSummary`。
    - 端点 `POST /living-pet/enable-earning`、`GET /living-pet/economic-profile`。绑定失败不破坏陪伴功能。
    - 单测：未绑定→开通后 boundAgentAccountId 已写、重复开通不建第二个。
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  - [ ] 5.2 移动端"会赚钱的萌宠"呈现 + 验证
    - 萌宠屏用 economic-profile 把人格+钱包+收益呈现为同一只萌宠；首次进入赚钱入口触发开通流程。
    - 端到端：未绑定用户走完开通→视图返回钱包+收益→再次开通不产生第二个 AgentAccount。后端部署 + APK。
    - _Requirements: 3.5_

- [ ] 6. 拉新裂变接线（需求 4）
  - [x] 6.1 user_referrals + ReferralFlywheelService
    - 新迁移 `user_referrals`（inviterUserId/inviteeUserId(unique)/shortCode/channel/signupRewarded/createdAt，index inviter）。
    - 新增 `ReferralFlywheelService`：`onSignup(inviteeUserId, ref)`（建关系幂等 + 双边 earn referral_signup 各 200 AXP + `ReferralLinkService.recordConversion`）、`onInviteeGmv(inviteeUserId, orderId, gmv)`（查 inviter + `FeeResolverService.resolveReferralGmv` 2% + earn referral_gmv_pct refId=orderId）。
    - 端点 `POST /referral/track-signup`、`GET /referral/my-flywheel`。
    - 单测：双边发放幂等（Property 3）、无归因不阻断、重复 GMV 回调不增量。
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - [~] 6.2 注册/成交钩子接线 + 深链透传（移动端「邀请赚 AXP」卡 + Share + my-flywheel 已上线；**注册回调/成交结算自动调用 onSignup/onInviteeGmv 的钩子接线待补**）
    - 注册成功（auth/user）调 onSignup；集市成交结算成功调 onInviteeGmv（接到既有成交结算点）。
    - 深链：复用 `ReferralLinkService.createLink`（`?ref=`）；落地 `/r/:code`→recordClick→注册透传 ref（前后端贯通）。
    - 移动端：分享深链入口（生成/复制分享链接，海报场景）。
    - _Requirements: 4.5_
  - [ ] 6.3 端到端验证 + 部署 + APK
    - A 生成深链 → B 经深链注册（双方各 200 AXP 各一笔）→ B 成交（A 收 2% gmv 分成一笔）→ 重复回调不增量。链路记 `_deploy_record.md`。
    - _Requirements: 4.6_

- [ ] 7. 收益兑付（需求 5）
  - [x] 7.1 AXP 抵扣闭环 + 兑付页（后端：redeem 唯一 refId 修复回归 + 可选幂等键；复用既有 AxpRewardShop 兑付页）
    - `PetEarningsService.getRedeemOptions(userId)`（来自 `AXP_SPEND_SOURCES` 的抵扣场景）；`POST /pet-earnings/redeem` → `AxpService.spend(source, amount, refId=businessOrderId)`（用任务 1.1 幂等）。按既有兑换目录/抵扣规则（catalog）扣减，**不做 AXP→法币折算（AXP 无定价）**。
    - 移动端兑付页：列可抵扣场景 + 抵扣后余额实时刷新。
    - 单测：重复提交不双扣（Property 2）。
    - _Requirements: 5.1, 5.2, 5.3_
  - [ ] 7.2 端到端验证 + 部署 + APK
    - 测试用户用 AXP 抵扣一笔订阅/购买：余额正确减、明细新增 spend、重复提交不双扣。web→mobile 重验。
    - _Requirements: 5.4_
  - [ ] 7.3 USDT 出金接口契约（仅设计交付，不实现）
    - 在 design 落 `CWithdrawalService.createUserPayout(userId, amountWei, targetChainId, targetAddress)` 接口契约 + 复用 `withdrawal`/`fiat-to-crypto`/`mpc-wallet` 路线 + 偿付能力/风控/幂等约束。不写实现。
    - _Requirements: 5.5, 5.6_

- [x] 8. 萌宠半自主接活（需求 6）
  - [x] 8.1 机会发现 + 一键接活（PetAutoEarnService：listOpportunities 真实开放任务 + acceptOpportunity 限额围栏内代投标，接入既有 bid→accept→complete→commission 链路；6 单测）
    - 新增 `PetAutoEarnService`：`listOpportunities(userId)`（聚合 merchant-task 可接 + `UnifiedMarketplaceService.search`，按能力/信用分排序）。
    - `POST /pet-earnings/opportunities/:id/accept`：校验 `AgentAccount.spendingLimits` vs `usedTodayAmount` → 限额内执行接单→完成→结算（调对应模块既有 service）→ 收入经既有 earn source 入账 → 更新 usedTodayAmount。
    - 单测：超限拒（Property 6）、失败不入账且限额统计正确（Property 7）。
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - [x] 8.2 移动端"萌宠帮我赚"+ 端到端验证（收益中心推荐卡 + 一键接单；接入 opportunities/accept 端点）

- [ ] 9. 飞轮指标（需求 7）
  - [x] 9.1 PetEarningsMetricsService + admin 端点（`GET /v1/pet-earnings/admin/metrics`，JwtAuthGuard+AdminGuard；拉新/赚取/兑付真实聚合，不注入种子）
    - 拉新（user_referrals 注册/转化）、赚取（earn 按 source 总额 + 活跃赚钱用户数）、兑付（spend/出金额）、分享回流（referral_links clicks→conversions）。真实数据不注入种子。
    - 端点 `GET /admin/flywheel/metrics`（admin guard）或并入现有运营看板。
    - _Requirements: 7.1, 7.2_
  - [ ] 9.2 端到端验证 + 部署
    - 任务 6/7/8 动作发生后指标对应环节数字相应增加。记 `_deploy_record.md`。
    - _Requirements: 7.3_

- [ ] 10. 全飞轮 E2E 收口（全部完成后执行）
  - 串跑一圈：分享深链 → 注册双边奖励 → 萌宠开通赚钱能力 → 接活赚 AXP → 收益中心可见 → AXP 抵扣兑付 → 飞轮指标反映。
  - 校验 7 条 Correctness Properties；后端部署 + APK 真机；含支付/兑付链路 web→mobile 重验；结果记 `_deploy_record.md`。
  - _Requirements: 1.7, 2.5, 3.5, 4.6, 5.4, 6.5, 7.3, 8.1, 8.5_

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1.1", "1.2", "2.1"], "rationale": "幂等地基 + 费率解析入口，所有后续依赖" },
    { "wave": 2, "tasks": ["2.2", "3.1"], "rationale": "费率收敛、分类映射（依赖 2.1）" },
    { "wave": 3, "tasks": ["3.2"], "rationale": "聚合服务（依赖 3.1 + AXP）" },
    { "wave": 4, "tasks": ["3.3", "4.1", "5.1", "6.1"], "rationale": "聚合验证、移动端收益中心、萌宠绑定、裂变服务（依赖聚合/费率）" },
    { "wave": 5, "tasks": ["4.2", "5.2", "6.2", "7.1", "8.1"], "rationale": "前端/接线层（依赖各自后端）" },
    { "wave": 6, "tasks": ["6.3", "7.2", "7.3", "8.2", "9.1"], "rationale": "端到端验证 + 指标" },
    { "wave": 7, "tasks": ["9.2"], "rationale": "指标验证" },
    { "wave": 8, "tasks": ["10"], "rationale": "全飞轮 E2E 收口" }
  ]
}
```

- 关键路径：1.1/2.1 → 2.2/3.1 → 3.2 → 3.3 → （4/5/6/7/8 切片并行）→ 9 → 10。
- 每个需求切片（任务 3/4/5/6/7/8/9）各自带端到端验证，可独立见到飞轮某一环真实运转，不必等全量。

## Notes
- 后端迁移 additive、遵循 SnakeNamingStrategy（勿在 `@Column` 写 snake_case）。
- 金额：AXP 整数；USDT wei/最小单位字符串，不引入 f64。
- 所有新端点 JwtAuthGuard；admin 端点 admin guard。
- 不触碰 AGENTS.md 的两条 chat 路径同步规则。
- D4（LSM 切稳定币）不在本 spec，留作后续独立阶段（requirements 附录已登记工作量）。
