# Agentrix 移动端 E2E 测试体系

> 版本：2026-05-10
> 上游文档：[MOBILE_REFACTOR_AND_ECOSYSTEM_PLAN_2026-05.zh-CN.md](MOBILE_REFACTOR_AND_ECOSYSTEM_PLAN_2026-05.zh-CN.md)

Sprint D 完成后建立的移动端测试体系，分 3 层：

| 层 | 工具 | 目标 | 是否需要设备 |
|---|-----|------|:-:|
| **L1 单元测试** | Jest + ts-jest | 纯逻辑（深链 / AXP / 订阅常量 / 配额计算） | ❌ |
| **L2 API smoke** | node.js 原生 https | 后端 4 个新模块在线可达 | ❌（需后端部署） |
| **L3 E2E UI** | Maestro | 真机走完 4-tab + 经济闭环 | ✅ Android/iOS 设备或 emulator |

---

## L1 · 单元测试

### 已有测试

| 文件 | 覆盖 |
|-----|-----|
| `src/navigation/__tests__/legacyRouteTable.test.ts` | 111 个深链映射断言（所有 §8 legacy URL） |
| `src/services/__tests__/liveSpeechSession.service.spec.ts` | 语音会话状态机 |
| `src/services/__tests__/llamaContextConfig.service.spec.ts` | 本地 LLM 配置 |
| `src/services/__tests__/localPcmWav.service.spec.ts` | 本地语音 PCM 处理 |
| `src/services/__tests__/localVoiceCapabilityPlanner.service.spec.ts` | 语音能力规划 |
| `src/services/__tests__/mobileLocalMultimodalRouting.service.spec.ts` | 本地多模态路由 |

### 运行

```bash
# 全部单测
npx jest --no-coverage

# 只跑深链回归（Sprint A 新增的核心 guard）
npx jest --testPathPattern=legacyRouteTable --no-coverage

# 只跑 services 下的
npx jest --testPathPattern=services
```

### Sprint A/B/C/D 增量覆盖

| Sprint | 新增测试 | 目的 |
|--------|---------|------|
| A | `legacyRouteTable.test.ts` (111 asserts) | 保证旧通知/分享链接永不 404 |
| B | 待加 — `plaza.navigation.test.ts`（5 段切换参数化） | 防止 Segmented 断 |
| C | 待加 — `axp.amounts.test.ts`（返现计算） + `greeting.constants.test.ts`（premium cost 非负） | 防止经济参数漂移 |
| D | 待加 — `subscription.quota.test.ts`（TierQuota 单调递增） | 防止高档反而配额少的 bug |

---

## L2 · API smoke

**文件**：`scripts/test/mobile-api-smoke.mjs`

**覆盖端点**（Sprint B/C 新增 + Sprint D 依赖）：

| 端点 | Auth | 用途 |
|-----|:---:|-----|
| `GET /v1/subscription/catalog` | ❌ | 订阅页 5 档展示 |
| `GET /v1/subscription` | ✅ | Me Tab 头部档位 badge |
| `GET /v1/me/quota` | ✅ | Me Tab 配额网格 / Home AXP 返现率 |
| `GET /v1/axp/balance` | ✅ | Home/Me AXP 余额 |
| `GET /v1/axp/history` | ✅ | Axp Center 历史 |
| `GET /v1/pet/greeting/catalog` | ❌ | 贺卡模板 |
| `GET /v1/pet/greeting/inbox` | ✅ | 收件箱 |
| `GET /v1/pet/greeting/outbox` | ✅ | 发件箱 |
| `GET /v1/pet/coraising/invites` | ✅ | 我的邀请列表 |

### 运行

```bash
# 只跑 public 端点（快速验部署）
node scripts/test/mobile-api-smoke.mjs

# 跑全部（认证端点需 JWT）
AGENTRIX_TOKEN=<jwt> node scripts/test/mobile-api-smoke.mjs

# 跑本地后端
AGENTRIX_API_BASE=http://localhost:3001/api \
AGENTRIX_TOKEN=<dev-jwt> \
  node scripts/test/mobile-api-smoke.mjs
```

### 已知问题与待办

| 问题 | 状态 | 行动 |
|-----|-----|-----|
| 线上 `api.agentrix.top` Sprint B/C 端点 404 | 🟡 未部署 | 需 ssh 部署：`cd /home/ubuntu/Agentrix/backend && git pull && npm run build && npm run migration:run && pm2 restart agentrix-backend` |
| 认证端点需真实 JWT | 🟡 手动 | 可在 Expo 登录后从 MMKV/SecureStore 读出 token |

---

## L3 · Maestro E2E

**套件位置**：`.maestro/*.yaml`

### Sprint A/B/C/D 新增流

| 流 | 覆盖 |
|---|-----|
| `10-4tab-smoke.yaml` | 4 Tab 骨架 + 顶栏（Scan/Bell）+ Tab 切换 |
| `11-plaza-5segments.yaml` | Plaza 5 段 Segmented 切换（Feed/Skills/Tasks/Pets/Play） |
| `12-home-pet-drawer.yaml` | Home 主宠抽屉 10 入口 — Skills / Wallet / Wardrobe / Create 抽样 |
| `13-me-subscribe-axp.yaml` | Me Tab → Subscribe 5 档 catalog + AXP Center |
| `14-coraising-greeting.yaml` | 共养邀请表单 + 贺卡 compose + 贺卡 Inbox |
| `15-global-inbox-scan.yaml` | 全局铃铛（Inbox）+ 扫码（Scan）modal |

### 已有旧流（保留）

| 流 | 覆盖 |
|---|-----|
| `01-launch.yaml` | 首次启动登录页展示 |
| `02-auth-screen.yaml` | 登录入口 |
| `03-input-validation.yaml` | 输入校验 |
| `04-navigation-tabs.yaml` | （已过期，4 Tab 后用 10-4tab-smoke 替代） |

### 前置条件

1. **Maestro CLI**: `curl -Ls https://get.maestro.mobile.dev | bash`
2. **Android 设备 / emulator**: `adb devices` 至少 1 online
3. **APK 已安装**：`app.agentrix.claw` 包名（通过 `adb install` 或 `expo run:android`）
4. **后端可达**：`AGENTRIX_API_BASE` 指向 staging 或 prod（脚本默认 `https://api.agentrix.top/api`）

### 运行

```bash
# 全部 10-15 + 01-04
bash scripts/test/run-mobile-e2e.sh

# 只跑 Sprint 新增（10-15 开头）
bash scripts/test/run-mobile-e2e.sh 1

# 只跑特定
bash scripts/test/run-mobile-e2e.sh 13-
```

报告输出到 `tests/reports/mobile-e2e-<timestamp>/`。

---

## CI 集成建议

```yaml
# .github/workflows/mobile-test.yml (草案，尚未提交)
name: Mobile Tests
on:
  pull_request:
    paths: ['src/**', 'App.tsx', 'app.json']
  push:
    branches: ['build/**']

jobs:
  l1-unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20.19.4' }
      - run: npm ci --legacy-peer-deps
      - run: npm run typecheck:root
      - run: npx jest --no-coverage

  l2-smoke:
    runs-on: ubuntu-latest
    needs: l1-unit
    if: github.ref == 'refs/heads/build/staging'
    env:
      AGENTRIX_API_BASE: https://api.agentrix.top/api
      AGENTRIX_TOKEN: ${{ secrets.AGENTRIX_E2E_TEST_TOKEN }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: node scripts/test/mobile-api-smoke.mjs

  # L3 Maestro runs on real device in separate workflow
  # (build-watch-apk.yml already triggers APK build; add post-build Maestro step)
```

---

## 发现的问题清单（live 更新）

| # | 问题 | 严重度 | 发现者 | 状态 |
|---|-----|:---:|-------|------|
| 1 | 线上 `api.agentrix.top` 返回 404 for `/v1/subscription/catalog` 等 Sprint B/C 端点 | 高 | L2 smoke | 🟡 待部署 |
| 2 | (占位) Plaza 5 段 segmented 在某些屏幕宽度下 horizontalScroll 会覆盖 topbar | – | 待测 | – |
| 3 | (占位) 共养 feed 成功后 HomeScreen 的 AXP glance 需要手动下拉刷新才更新 | – | 待测 | – |

实际发现的问题会在这里持续登记。

---

## 回归测试 checklist（Sprint 上线前必过）

- [ ] L1: `npx jest --no-coverage` 全绿
- [ ] L1: `npm run typecheck:root` 0 new errors
- [ ] L2: API smoke 对 prod 全绿（需先部署后端）
- [ ] L3: Maestro 10-15 全绿
- [ ] 手工: 真机登录 → 4 Tab 切换 → Plaza 5 段 → 订阅页 → 共养创建 → 贺卡发送 → 退登

---

*Agentrix Mobile QA · 2026-05-10*
