# PET Phase4-Phase6 测试报告（Phase6 M4 暂不纳入）

> 范围：Phase 4 到 Phase 6（M4 排除）
> 日期：2026-05-06
> 方式：聚焦后端 Jest、Playwright API/E2E、测试断点修复回归

## 1. 本轮测试目标

- 继续复核 Phase 4 到 Phase 6 的真实可测面。
- 找出当前 E2E 断点并直接修复。
- 为尚缺 Playwright 覆盖的后端接口补最小但有效的 API 契约测试。

## 2. 本轮改动的测试文件

### 2.1 `tests/e2e/desktop-sync-approval-agent.spec.ts`

本轮修复点：

- 增加 `PLAYWRIGHT_AUTH_TOKEN` / `E2E_BEARER_TOKEN` 注入能力。
- 增加 `OTP_EMAIL` / `OTP_CODE` 环境变量支持。
- 将认证态 skip 原因改为显式提示，不再只是模糊的 “No auth token”。
- 目标是绕开脆弱的 dev OTP/bootstrap，允许在 CI 或本地直接注入真实 bearer token。

### 2.2 `tests/e2e/pet-phase4-phase6-api.spec.ts`

本轮新增覆盖：

- 匿名拒绝检查：
  - `/v1/passkey`
  - `/v1/partner-apps`
  - `/v1/pet/team/roles`
  - `/v1/pet/nft/config`
  - `/v1/pet/sovereign/config`
  - `/v1/partner-runtime/whoami`
  - `/v1/partner-runtime/ping`
- 认证态契约入口：
  - passkey list
  - pet team roles
  - pet nft config
  - pet sovereign config
  - partner-app owner registration
  - partner-runtime whoami/ping
  - partner-app usage

## 3. 执行结果

### 3.1 Backend Jest（聚焦后期相关模块）

本轮复核沿用已执行完成的聚焦结果：

- `19` 个 suite 通过
- `153` 个测试通过
- `78` 个 todo
- 总计 `231` 个测试

结论：

- 本轮没有发现 Phase 4-6 相关后端服务层的普遍性回归。
- 问题主要集中在 E2E 测试引导与认证闭环，而不是后端单测层失败。

### 3.2 Playwright（修复前）

既有 Phase 4 套件在修复前的结果：

- `33` 个测试
- `16` 个通过
- `17` 个跳过

解释：

- 这说明旧用例更多是在跑匿名 guard 或有限 smoke。
- 认证态场景被脆弱的 OTP/bootstrap 卡住，大量逻辑只能 skip。

### 3.3 Playwright（修复后 + 新增 Phase4-6 API 套件）

修复与补测后的结果：

- `42` 个测试
- `18` 个通过
- `24` 个跳过

解释：

- 通过数增加，主要来自新增的匿名 guard / API 契约检查。
- 跳过数增加，不代表回归变差，而是因为本轮把更多认证态入口显式纳入了测试集；在没有 token 的情况下，这些分支会被有原因地跳过，而不是悄悄缺失。

## 4. 已确认通过的测试面

### 4.1 匿名路由与 Guard

本轮新增的关键后端面匿名检查均为绿色：

- Passkey 路由已注册且受保护。
- Partner App owner/runtime 路由已注册且受保护。
- Pet Team、Pet NFT、Pet Sovereign 配置路由已注册且受保护。

这类检查证明了两件事：

- 控制器确实挂载到了生产 API 面。
- `JwtAuthGuard` 或对应认证保护确实生效。

### 4.2 认证态入口已补齐

虽然本轮没有真实 token 去执行这些分支，但以下入口已经写入测试并可直接启用：

- passkey list
- pet team roles
- pet nft config / intents
- pet sovereign config
- partner-app owner register / usage
- partner-runtime whoami / ping
- desktop-sync / approval / agent-presence 的认证态 Playwright 分支

## 5. 本轮无法闭环的原因

### 5.1 缺少可用认证 token

认证态 Playwright 依赖：

- `PLAYWRIGHT_AUTH_TOKEN`，或
- `E2E_BEARER_TOKEN`

本轮尝试的本地补救没有成功：

- helper token 脚本因为缺少 `jsonwebtoken` 依赖而失败。
- 内联 backend JWT 生成因为环境缺少 `JWT_SECRET` 而失败。

因此本轮不能伪造“已跑通认证态 E2E”的结论，只能如实记录为阻塞。

### 5.2 部分 Phase 5 / Wearable 场景天然不是纯 API 可覆盖

以下场景本轮没有真实硬件/系统级执行条件：

- Glass HUD 实机显示
- Watch Tile / complication 交互
- 设备配对与 OTA 分块下载的真实端侧流程
- PRD 定义的六视角宠物扫描采集体验

## 6. 测试结论

- 本轮最重要的修复是“测试层断点修复”，不是后端业务逻辑修复。
- Phase 4-6 相关后端服务层整体稳定，新增/既有单测结果支持这一点。
- Playwright 现已具备继续向认证态扩展的结构条件，只差一个真实 token。
- 当前最大的测试空洞是“认证态跨端闭环”和“硬件/端侧真实链路”，而不是匿名 API 面。

## 7. 下一步测试建议

1. 提供 `PLAYWRIGHT_AUTH_TOKEN` 或 `E2E_BEARER_TOKEN`，重新执行本轮所有跳过的认证态用例。
2. 为 Device Registry / OTA 增加一组独立的 Playwright API 套件，避免 Phase 5 只停留在代码走查。
3. 单独建立移动端 Phase 5 扫描生成链路测试计划，把二维码配对扫描与宠物采集扫描彻底分开。