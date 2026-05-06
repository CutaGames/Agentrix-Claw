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

修复与补测后的结果分三轮收敛：

- 首次带真实 token 回归：`24 passed, 1 skipped, 2 failed, 15 did not run`
- 第二轮修补后：`35 passed, 1 skipped, 2 failed, 4 did not run`
- 最终回归：`41 passed, 1 skipped, 0 failed`

解释：

- 本轮不再停留在“认证态大量跳过”，而是通过真实 bearer token 把认证态分支实际跑了起来。
- 失败点全部来自测试夹具或断言与当前后端契约漂移，不是后端服务逻辑普遍失效。
- 最终剩余的 `1 skipped` 是 `4.0 attempt dev-mode auth via email OTP`，它是 dev bootstrap 兜底分支，不影响本轮基于真实 token 的认证态结论。

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

以下认证态入口已实际执行通过：

- passkey list
- pet team roles
- pet nft config
- pet sovereign config
- partner-app owner register / usage
- partner-runtime whoami / ping
- desktop-sync / approval / agent-presence 的认证态 Playwright 分支

### 4.3 本轮修掉的真实断点

- desktop-sync task 写入仍按旧 timeline 结构发送 `event` / `ts`，与当前 `DesktopTimelineEntryDto` 不匹配，已修正。
- approval 创建前置数据使用了当前 DTO 不接受的旧状态值，已改为 `need-approve`。
- desktop command 创建用例使用了过期的 command kind，已改为当前允许值 `list-windows`。
- partner-app owner flow 使用了已不在白名单中的 `pet.write` scope，已改为 `pet.chat`。
- partner-runtime ping 断言错误地只接受 `200`，已放宽到当前实际返回的 `200/201`。
- agent-presence dashboard 断言仍依赖旧字段 `totalEvents`，已改为当前 `totalMessages24h` / `totalMessagesWeek` 等字段。
- create-agent 用例仍发送旧 DTO 字段 `type` / `channels` / `config`，已对齐当前 `CreateAgentDto`。
- channel-health 断言把对象返回体误判为数组，已修正。

## 5. 本轮未覆盖的范围

### 5.1 部分 Phase 5 / Wearable 场景天然不是纯 API 可覆盖

以下场景本轮没有真实硬件/系统级执行条件：

- Glass HUD 实机显示
- Watch Tile / complication 交互
- 设备配对与 OTA 分块下载的真实端侧流程
- PRD 定义的六视角宠物扫描采集体验

### 5.2 更高层闭环仍未重跑

- 浏览器级 Passkey/WebAuthn 注册登录 ceremony 未在本轮重新验证。
- M6 主权切换的真实副作用与链路写入未在本轮做更深认证态回归。
- M5 真实第三方 partner 接入未在本轮做长链路验证。

## 6. 测试结论

- 本轮最重要的修复是“测试层断点修复”，不是后端业务逻辑修复。
- Phase 4-6 相关后端服务层整体稳定，新增/既有单测结果支持这一点。
- Playwright 现已不只是“具备结构条件”，而是已经通过真实 token 完成了本轮目标范围内的认证态 API/E2E 回归。
- 当前最大的测试空洞是“硬件/端侧真实链路”和“更高层产品闭环”，而不是匿名 API 面或测试入口本身。

## 7. 下一步测试建议

1. 把测试 token 生成或测试账号登录前置固定化，避免后续回归再次卡在人工注入 bearer token。
2. 为 Device Registry / OTA 增加一组独立的 Playwright API 套件，避免 Phase 5 只停留在代码走查。
3. 单独建立移动端 Phase 5 扫描生成链路测试计划，把二维码配对扫描与宠物采集扫描彻底分开。