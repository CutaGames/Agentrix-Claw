# Agentrix 电子宠物系统 Phase 1-3 审计报告

日期：2026-05-06

范围：
- 后端：Phase 1 灵魂/皮肤，Phase 2 配额/审核/Rive 资产，Phase 3 Marketplace/Remix/结算/DMCA
- 桌面：pet SDK、SoulPicker、Rive 情绪映射
- 移动：mobilePetSdk、SoulPickerScreen
- Web：公开档案页、Marketplace 页面、embed SDK

## 结论

本次审计结论不是“Phase 1-3 已全部完成并可闭环验收”，而是：

- Phase 1：后端契约、桌面/移动 SDK、Web 公开档案页基本到位，但真正的跨端 E2E 和计划权限收口未完成。
- Phase 2：配额、审核、Stripe overage 桥接、Rive 资产后端骨架已落地，但桌面/移动/Web 的 Rive 运行时没有真正落地，因此性能门槛“情绪切换 < 200ms”目前不能算通过。
- Phase 3：后端 Marketplace/Remix/版税/结算链路较完整，Web Marketplace 页面和 embed SDK 也已实现并通过测试；但严格意义上的“真实跨端 E2E”和 Web VRM 渐进渲染仍未完成。

换句话说，后端核心业务逻辑已经具备较强完成度，但“完成 Phase 1-3”这句话目前更接近“后端完成 + Web/SDK 局部完成”，还不能等同于“全部 exit gate 都已被真实验证”。

## 已确认完成的实现面

### Phase 1

- `shared/types/pet.ts`、`shared/types/agentrix-presence.ts` 已定义宠物灵魂/皮肤契约。
- 后端 `pet-soul-template`、`pet-skin`、`living-pet` 模块已存在，`switchSoul()`、`activateSkin()` 已实现。
- 桌面 `desktop/src/services/petSoulSdk.ts` 与 `desktop/src/components/SoulPicker.tsx` 已实现，并有对应测试。
- 移动 `src/services/mobilePetSdk.ts` 已实现基础 API，对应 Jest 测试存在且通过。
- Web `frontend/pages/p/[petId]/index.tsx` 与 `frontend/components/pet/PetSoulBadge.tsx` 已实现，并有测试。

### Phase 2

- 后端 `pet-gen-quota`、`moderation`、`pet-overage-billing`、`pet-rive-asset` 模块均存在。
- `phase2-e2e.spec.ts` 已覆盖 3 次免费、4 次 overage、失败退款、NSFW 拦截等关键路径。
- `user-plan-resolver.service.ts` 已实现 plan 解析，`payment/stripe-webhook` 与 overage 服务有桥接。

### Phase 3

- 后端 `marketplace-pet` 模块完整，含上架、拍卖、租赁、反狙击、祖先链、版税拆分、逆向图搜、Remix 繁殖、结算桥接。
- `phase3-e2e.spec.ts` 已覆盖 Remix lineage、版税拆分、逆向图搜关键链路。
- Web 已存在 Marketplace 列表页、详情页、公开档案页、`frontend/public/embed.js` 和 `frontend/pages/embed/pet/[id].tsx`，并通过测试。
- DMCA 服务与 abuse limiter 已实现并通过测试。

## 审计发现

### P0：Phase 2 Rive 运行时未真正落地

证据：

- `backend/src/modules/pet-rive-asset/pet-rive-asset.service.ts` 明确写的是“骨架”和“纯查询”。
- `desktop/src/services/petSdk.ts` 中 `rive` renderer 仍是 stub，只做事件转发，没有真实 `@rive-app/canvas` 运行时。
- `desktop/src/services/riveEmotionMap.ts` 目前只有情绪到触发器的映射，没有实际渲染实现。
- 仓库中未发现 `frontend/components/pet/WebPetCanvas.tsx`、`frontend/components/pet/WebPetVRM.tsx` 等真实 Web 渲染组件。

影响：

- PRD 中 Phase 2 的“Rive 切换情绪 < 200ms”当前无法被真实验证。
- 桌面/移动/Web 的 Rive 交互更接近契约和占位，而不是完整运行时。

判定：Phase 2 未达到完整验收状态。

### P1：Phase 1 的 plan-based soul gating 没有真正实现

证据：

- `backend/src/modules/pet-soul-template/pet-soul-template.service.ts` 在 `list()` 中明确保留了注释：free/pro 过滤逻辑“这里先全部返回”。
- `backend/src/modules/living-pet/living-pet.service.ts` 的 `switchSoul()` 仅校验模板存在且 enabled，没有结合 plan 做 `ForbiddenException` 收口。
- 测试计划中的 BE-T1.7、BE-T1.8、BE-T1.9 当前没有对应自动化验证落地。

影响：

- “Free 只能切 Claw / Pro 有数量限制 / Pro+ 全开放”这一组业务规则目前不能宣称完成。

判定：Phase 1 业务约束未完全闭环。

### P1：真实跨端 E2E 没有落地到仓库级测试

证据：

- 在 `tests/` 与 `tests/e2e/` 下未发现 pet/soul/marketplace 的 Playwright 或多端 UI E2E 用例。
- 当前所谓 Phase 2/3 E2E 主要是 `backend/src/modules/pet-gen-quota/phase2-e2e.spec.ts` 与 `backend/src/modules/marketplace-pet/phase3-e2e.spec.ts` 这类进程内服务级 E2E。

影响：

- Phase 1 的 `桌面 -> 移动 5s 同步`、`移动 -> 桌面 5s 同步`、`离线再上线同步` 等 exit gate 仍无真实自动化证据。
- Phase 2 的 `跨端 Rive 切情绪同步 < 1s` 也没有真实端到端验证。

判定：当前“E2E 完成”只能成立于后端服务级链路，不能成立于真实多端交互闭环。

### P2：Phase 3 Web VRM 渐进渲染未落地

证据：

- `frontend/pages/marketplace/pets/index.tsx` 与 `frontend/pages/marketplace/pets/[id].tsx` 当前使用的是占位视觉卡片，不是真实 VRM 渲染。
- 未发现 `WebPetVRM.tsx` / `WebPetCanvas.tsx` 实现文件。

影响：

- Phase 3 Web 端“Marketplace MVP + embed”成立，但“Web VRM 渐进加载”不能算已完成。

判定：Phase 3 Web 为部分完成。

### P2：性能出口条件缺少真实 benchmark

证据：

- 当前已存在的性能相关内容主要是阈值常量和 PRD/测试计划文本。
- 未发现针对 `switchSoul` P95、跨端同步时延、Rive 200ms 切换时延的真实 benchmark 或 Playwright 计时脚本。

影响：

- “功能可用”与“性能 OK”不能划等号；现阶段只能说没有看到自动化 benchmark 证据。

判定：性能结论目前只能给出“未充分验证”。

## 本次审计中已修复的问题

### 1. 前端 embed 测试 teardown 假阳性失败

- 症状：Vitest 断言通过，但 jsdom 在 teardown 阶段因 iframe 残留触发 `RangeError: Maximum call stack size exceeded`。
- 修复：在 `frontend/__tests__/embedScript.test.ts` 与 `frontend/__tests__/embedScript.xss.test.ts` 中补充 `currentScript` 与 DOM 清理。
- 结果：前端 pet/embed 测试从“断言全绿但进程报错”变为纯绿退出。

### 2. desktop SoulPicker 测试的 React `act()` 警告

- 症状：`agentrix:pet-soul-changed` 自定义事件触发后有未包裹 `act()` 的 warning。
- 修复：在 `desktop/src/test/SoulPicker.test.tsx` 中将事件派发包入 `act()`。
- 结果：desktop 测试无 warning，输出干净。

### 3. frontend pet/marketplace 相关 TypeScript 错误

- 症状：`frontend` 的 `tsc --noEmit` 报 9 个错误，主要来自测试夹具和详情页 fallback 返回值缺少显式类型。
- 修复：为 `marketplace.index.test.tsx`、`marketplace.detail.test.tsx` 测试数据补显式类型，并为 `pages/marketplace/pets/[id].tsx` 的 bids fallback 补 `Bid[]` 类型。
- 结果：frontend 类型检查恢复通过。

## 最终判定

### Phase 1

- 核心后端能力：通过
- Web/桌面/移动基础 UI 与 SDK：通过
- 真实跨端 E2E：未完成
- 计划权限控制：未完成

结论：部分完成，未达到完整 exit gate 验收。

### Phase 2

- 配额、审核、计费桥接：通过
- Rive 资产后端骨架：通过
- 多端 Rive 运行时与性能门槛：未完成

结论：后端完成度高，前端/客户端运行时未完成，不能宣称 Phase 2 全完成。

### Phase 3

- Backend Marketplace / Remix / 版税 / 结算：通过
- Web Marketplace 页面与 embed：通过
- Web VRM 渲染与真实跨端交易 E2E：未完成

结论：Phase 3 后端与 Web MVP 基本到位，但仍不是全量闭环完成。
