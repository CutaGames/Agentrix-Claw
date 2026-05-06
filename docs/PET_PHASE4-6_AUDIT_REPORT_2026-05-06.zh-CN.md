# PET Phase4-Phase6 审计报告（Phase6 M4 暂不纳入）

> 范围：`docs/PRD_PET_PHASED_DEV_PLAN.zh-CN.md` Phase 4 到 Phase 6（按用户要求，Phase 6 的 M4 本轮不做）
> 方法：代码走查、既有验证报告复核、后端 Jest 结果复核、Playwright API/E2E 复核
> 日期：2026-05-06

## 1. 审计结论摘要

- Phase 4：核心后端、Web Passkey、桌面审批/同步面都已落地。本轮发现的主要断点不在业务逻辑，而在 E2E 测试夹具和认证引导与当前 DTO/返回体的漂移；这些断点已在测试层补修，并完成认证态 API/E2E 回归。
- Phase 5：设备注册/OTA、手表 Tile、眼镜 HUD 均存在真实实现，不是空壳；但移动端当前扫描页是二维码/设备配对入口，不是 PRD 所要求的“6 视角宠物扫描生成向导”，因此 Phase 5 只能判定为部分完成。
- Phase 6：M1、M2、M3、M5、M6 都能找到明确代码落点，其中 M2/M3/M5/M6 本轮已完成认证态 API 契约复核；M4 按要求未纳入。本轮最大剩余缺口已转为产品形态偏差和硬件/浏览器级真实链路覆盖，而不是模块缺失或认证态 E2E 无法闭环。

## 2. 判定口径

- `已实现`：有明确代码控制面，且本轮或历史已有单测/API 证据。
- `部分实现`：有代码，但与 PRD 目标形态不一致，或缺少关键链路验证。
- `历史已实现，本轮未重跑`：仓内/旧报告能证明已交付，但本轮未再次做线上或数据库复核。
- `未纳入`：按本轮范围显式排除。

## 3. 分阶段审计

### 3.1 Phase 4

结论：`已实现，认证态 API/E2E 已闭环；浏览器级 WebAuthn ceremony 本轮未重跑`

代码证据：

- `backend/src/modules/passkey/passkey.controller.ts` 已暴露 Passkey/WebAuthn 注册、认证、列表、删除接口。
- `frontend/pages/auth/passkey.tsx` 已实现 Web 端 Passkey 注册/认证 UI，并包含 `data-testid` 钩子。
- `desktop/src/components/ApprovalSheet.tsx` 仍是桌面端风险分级审批的真实 UI 面。
- `backend/src/modules/pet-energy/*`、`backend/src/modules/pet-a2a/*` 仍为真实服务面。

本轮复核结论：

- 现有 Phase 4 Playwright 用例真正的断点不是后端坏掉，而是认证引导和测试夹具对旧契约的假设失效。原测试对 dev OTP/bootstrap 过度依赖，且部分请求体/断言已经落后于当前后端 DTO。
- 本轮已在 `tests/e2e/desktop-sync-approval-agent.spec.ts` 中加入 `PLAYWRIGHT_AUTH_TOKEN` / `E2E_BEARER_TOKEN` 注入路径，并通过生产环境生成真实 bearer token，实际跑通认证态分支。
- 桌面同步/审批/operations/agent-presence 相关认证态用例已完成回归；仍未确认完整的浏览器 WebAuthn ceremony 或 L3 实人授权链路。

审计判断：

- Phase 4 的代码面不是空缺，主要问题是“测试契约漂移与验证链路脆弱”而不是“功能没写”。
- Passkey 仍应视为 v1 形态，本轮未重新执行真实浏览器 Passkey 注册/登录闭环。

### 3.2 Phase 5

结论：`部分实现`

代码证据：

- `backend/src/modules/device-registry/device-registry.controller.ts` 已暴露 `/v1/devices/pair/ticket`、`/v1/devices/pair`、`/v1/devices`、`/v1/ota/manifest`、`/v1/ota/:packageId/chunk/:index`，说明设备注册与 OTA 控制面为真实实现。
- `src/services/wearables/glassHUDController.service.ts` 已实现 HUD 能力建模、消息优先级队列、分页/写入逻辑，不是占位文件。
- `src/screens/watch/WatchLivingTileScreen.tsx` 已实现宠物状态 Tile、情绪展示、L1 审批响应与 complication 渲染函数。
- `src/screens/me/ScanScreen.tsx` 当前实现的是通用二维码扫描器，覆盖桌面/网页配对、OpenClaw/Relay JSON、深链、URL 直连等场景。

本轮复核结论：

- Device Registry + OTA：可判定为真实后端能力，且与 Phase 5 硬件接入目标一致。
- Watch Tile / Glass HUD：代码量与行为完整度都足以判定为真实实现，但本轮没有实体硬件 E2E 或仿真器回归。
- 扫描链路：当前移动端 `ScanScreen` 明确是“二维码/设备配对扫描”，并非 PRD 所述的“6 视角宠物采集/扫描生成向导”。这不是命名差异，而是产品形态不一致。

审计判断：

- Phase 5 后端与穿戴端软件切片已有实装。
- Phase 5 的“宠物扫描生成体验”仍不可判定为完成，应明确记为缺口/偏差，不应把现有二维码扫描页误算进 PRD 交付。

### 3.3 Phase 6（M4 排除）

结论：`M1 历史已实现，本轮未重跑；M2/M3/M5/M6 已实现，且关键认证态 API 契约已复核`

#### M1：6 族群 / 种子扩充

代码/历史证据：

- `shared/types/pet.ts` 已定义 `A_office` 到 `F_family` 六个族群。
- 既有报告 `docs/PHASE5_PHASE6_M1_M2_M3_VALIDATION_REPORT.md` 记录了 BCDEF 种子已落库，历史部署态为 6 族群总计 27 个模板。

审计判断：

- M1 有明确共享类型与历史部署证据，可判定为“历史已实现，本轮未重跑”。
- 本轮未再次做数据库查询，因此不把它记为“本轮重新验证通过”。

#### M2：多宠团队 / 子宠管理

代码证据：

- `backend/src/modules/pet-team/pet-team.controller.ts` 暴露角色列表、成员列表、授予、更新、暂停、恢复、撤销等接口。
- `backend/src/modules/pet-team/pet-team.service.spec.ts` 提供角色唯一性、上限、状态切换、scope 更新等测试。

审计判断：

- M2 属于真实后端模块，不是占位接口。
- 本轮已新增并跑通针对 `/v1/pet/team/roles` 的认证态 API 契约测试；当前不足主要在更高层的业务闭环，而不是接口缺失。

#### M3：宠物 NFT Intent Scaffold

代码证据：

- `backend/src/modules/pet-nft/pet-nft.controller.ts` 已提供 config、intent 创建、查询、取消接口。
- `backend/src/modules/pet-nft/pet-nft.service.spec.ts` 已覆盖门槛、链支持、重复 intent、防跨用户、状态机等核心逻辑。

审计判断：

- M3 可判定为“后端 scaffold 已实现”。
- 本轮已跑通 config 认证态契约测试，但未执行真实签名 worker / 链上提交闭环。

#### M5：Partner App / Runtime

代码证据：

- `backend/src/modules/partner-app/partner-app.controller.ts` 已同时提供 owner 面和 runtime 面。
- Runtime 侧存在 `X-Agentrix-App-Key` 认证模型与 `/v1/partner-runtime/whoami`、`/v1/partner-runtime/ping`。

审计判断：

- M5 后端控制面存在，且不是假路由。
- 本轮已实际跑通 owner 注册、runtime whoami、runtime ping、usage 查询链路，并修正了测试中落后的 scope 白名单与 ping 状态码假设。
- 尚未覆盖真实第三方接入、长期计费行为或更复杂的 partner side effects。

#### M6：Sovereign Pet

代码证据：

- `backend/src/modules/pet-sovereign/pet-sovereign.controller.ts` 已包含 config、状态查询、enable MPC、enable self、revert、chains/memory/status patch 等接口。
- `backend/src/modules/pet-sovereign/pet-sovereign.service.spec.ts` 已提供服务层测试。

审计判断：

- M6 后端接口与状态控制面明确存在。
- 本轮已跑通 config 契约层认证态覆盖，未对真实主权切换、副作用、链路写入做更深的认证态 E2E。

#### M4

按用户要求，本轮不纳入审计与测试结论。

## 4. 本轮补足的断点

- 修复了 `tests/e2e/desktop-sync-approval-agent.spec.ts` 的认证引导脆弱问题，使其可通过环境变量注入真实 token，而不是绑定脆弱的本地 OTP/dev bootstrap。
- 修复了桌面同步 E2E 中与当前 `DesktopTimelineEntryDto` 不一致的 task timeline 请求体，并把审批前置 task 状态对齐到当前允许值 `need-approve`。
- 修复了桌面命令创建用例里过期的 command kind 假设，对齐到当前允许值 `list-windows`。
- 修复了 Partner App E2E 中过期的 scope 假设，把 `pet.write` 调整为当前白名单中的 `pet.chat`，同时放宽 runtime ping 对 `201 Created` 的接受。
- 修复了 Agent Presence E2E 中 dashboard、create-agent、channel-health 的返回体/DTO 假设，对齐当前接口契约。
- 新增 `tests/e2e/pet-phase4-phase6-api.spec.ts`，补齐了 Phase 4-6 关键后端面的匿名拒绝与认证态契约入口。
- 最终认证态 Playwright 回归结果为 `41 passed, 1 skipped, 0 failed`，说明本轮断点已从“不可跑”转为“可稳定执行”。

## 5. 当前最大风险

- 最大剩余风险不在“有没有模块”，而在“更高层真实体验是否与 PRD 对齐”。
- Phase 5 的扫描能力存在明显 PRD 偏差，当前移动端实现不能替代六视角宠物扫描生成向导。
- Watch/Glass/OTA 目前主要靠代码面和单测/静态复核，本轮没有真实硬件执行证据。
- Passkey 浏览器级 WebAuthn ceremony、M6 主权切换副作用、Partner 真实第三方集成仍未做更深层闭环回归。

## 6. 建议的下一步

1. 把生产 token 生成或测试账号登录收敛成稳定的 CI 前置步骤，避免认证态回归再次依赖临时人工注入。
2. 单独补一个 Phase 5 扫描生成链路审计/实现任务，避免继续把二维码配对页误当成宠物扫描生成页。
3. 为 M5/M6 再补一轮“真实 app key / 真实 pet ownership”级别的 API E2E，并为 Passkey 补浏览器级 WebAuthn 闭环回归。