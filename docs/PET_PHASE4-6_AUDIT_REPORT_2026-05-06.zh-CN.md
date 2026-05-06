# PET Phase4-Phase6 审计报告（Phase6 M4 暂不纳入）

> 范围：`docs/PRD_PET_PHASED_DEV_PLAN.zh-CN.md` Phase 4 到 Phase 6（按用户要求，Phase 6 的 M4 本轮不做）
> 方法：代码走查、既有验证报告复核、后端 Jest 结果复核、Playwright API/E2E 复核
> 日期：2026-05-06

## 1. 审计结论摘要

- Phase 4：核心后端、Web Passkey、桌面审批/同步面都已落地。本轮发现的主要断点不在业务逻辑，而在 E2E 认证引导脆弱；该断点已在测试层补修。
- Phase 5：设备注册/OTA、手表 Tile、眼镜 HUD 均存在真实实现，不是空壳；但移动端当前扫描页是二维码/设备配对入口，不是 PRD 所要求的“6 视角宠物扫描生成向导”，因此 Phase 5 只能判定为部分完成。
- Phase 6：M1、M2、M3、M5、M6 都能找到明确代码落点，其中 M2/M3/M5/M6 本轮还有 API 契约复核；M4 按要求未纳入。本轮最大剩余缺口仍是认证态 E2E 无法闭环，不是模块缺失。

## 2. 判定口径

- `已实现`：有明确代码控制面，且本轮或历史已有单测/API 证据。
- `部分实现`：有代码，但与 PRD 目标形态不一致，或缺少关键链路验证。
- `历史已实现，本轮未重跑`：仓内/旧报告能证明已交付，但本轮未再次做线上或数据库复核。
- `未纳入`：按本轮范围显式排除。

## 3. 分阶段审计

### 3.1 Phase 4

结论：`已实现，但认证态真实 E2E 仍未闭环`

代码证据：

- `backend/src/modules/passkey/passkey.controller.ts` 已暴露 Passkey/WebAuthn 注册、认证、列表、删除接口。
- `frontend/pages/auth/passkey.tsx` 已实现 Web 端 Passkey 注册/认证 UI，并包含 `data-testid` 钩子。
- `desktop/src/components/ApprovalSheet.tsx` 仍是桌面端风险分级审批的真实 UI 面。
- `backend/src/modules/pet-energy/*`、`backend/src/modules/pet-a2a/*` 仍为真实服务面。

本轮复核结论：

- 现有 Phase 4 Playwright 用例真正的断点是认证引导。原测试对 dev OTP/bootstrap 过度依赖，导致认证态路径容易整体跳过。
- 本轮已在 `tests/e2e/desktop-sync-approval-agent.spec.ts` 中加入 `PLAYWRIGHT_AUTH_TOKEN` / `E2E_BEARER_TOKEN` 注入路径，并补充更明确的 skip 提示，测试可靠性提升。
- 因缺少可用认证 token，本轮只能确认匿名 guard、HTTP 路由注册、以及认证态用例的执行入口已经补齐，无法确认完整的浏览器 WebAuthn ceremony 或 L3 实人授权链路。

审计判断：

- Phase 4 的代码面不是空缺，主要问题是“验证链路脆弱”而不是“功能没写”。
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

结论：`M1 历史已实现，本轮未重跑；M2/M3/M5/M6 已实现但认证态 E2E 未闭环`

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
- 本轮已新增针对 `/v1/pet/team/roles` 的 API 契约测试，但认证态完整路径仍依赖注入 token 才能执行。

#### M3：宠物 NFT Intent Scaffold

代码证据：

- `backend/src/modules/pet-nft/pet-nft.controller.ts` 已提供 config、intent 创建、查询、取消接口。
- `backend/src/modules/pet-nft/pet-nft.service.spec.ts` 已覆盖门槛、链支持、重复 intent、防跨用户、状态机等核心逻辑。

审计判断：

- M3 可判定为“后端 scaffold 已实现”。
- 本轮新增了 config/intents 相关 API 契约测试，但未执行真实签名 worker / 链上提交闭环。

#### M5：Partner App / Runtime

代码证据：

- `backend/src/modules/partner-app/partner-app.controller.ts` 已同时提供 owner 面和 runtime 面。
- Runtime 侧存在 `X-Agentrix-App-Key` 认证模型与 `/v1/partner-runtime/whoami`、`/v1/partner-runtime/ping`。

审计判断：

- M5 后端控制面存在，且不是假路由。
- 本轮只完成了匿名 guard 与认证态入口用例的补齐，尚未完成 owner 注册与 runtime app key 的全链路 E2E。

#### M6：Sovereign Pet

代码证据：

- `backend/src/modules/pet-sovereign/pet-sovereign.controller.ts` 已包含 config、状态查询、enable MPC、enable self、revert、chains/memory/status patch 等接口。
- `backend/src/modules/pet-sovereign/pet-sovereign.service.spec.ts` 已提供服务层测试。

审计判断：

- M6 后端接口与状态控制面明确存在。
- 本轮只新补了 config 等 API 契约层覆盖，未对真实主权切换、副作用、链路写入做认证态 E2E。

#### M4

按用户要求，本轮不纳入审计与测试结论。

## 4. 本轮补足的断点

- 修复了 `tests/e2e/desktop-sync-approval-agent.spec.ts` 的认证引导脆弱问题，使其可通过环境变量注入真实 token，而不是绑定脆弱的本地 OTP/dev bootstrap。
- 新增 `tests/e2e/pet-phase4-phase6-api.spec.ts`，补齐了 Phase 4-6 关键后端面的匿名拒绝与认证态契约入口。

## 5. 当前最大风险

- 最大剩余风险不在“有没有模块”，而在“认证态端到端闭环是否真的跑通”。
- Phase 5 的扫描能力存在明显 PRD 偏差，当前移动端实现不能替代六视角宠物扫描生成向导。
- Watch/Glass/OTA 目前主要靠代码面和单测/静态复核，本轮没有真实硬件执行证据。

## 6. 建议的下一步

1. 提供一个可用的 `PLAYWRIGHT_AUTH_TOKEN` 或 `E2E_BEARER_TOKEN`，把本轮已补齐的认证态 Playwright 分支全部跑通。
2. 单独补一个 Phase 5 扫描生成链路审计/实现任务，避免继续把二维码配对页误当成宠物扫描生成页。
3. 为 M5/M6 再补一轮“真实 app key / 真实 pet ownership”级别的 API E2E，降低仅停留在 guard/contract 层的风险。