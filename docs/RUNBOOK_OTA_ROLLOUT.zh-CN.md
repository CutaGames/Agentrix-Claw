# 移动端 OTA 灰度发布 runbook

> Sprint M-P2-1。EAS Update channels 灰度发布操作手册。
>
> 桌面端有同名 runbook：`docs/RUNBOOK_AUTO_UPDATE_ROLLOUT.zh-CN.md`。两端流程独立，不相互影响。

---

## 0. 前置条件

- `app.json` `updates.url` = `https://u.expo.dev/96a641e0-ce03-45ff-9de7-2cd89c488236` ✅
- `eas.json` 已有 4 条 channel：`development` / `preview` / `production` / `wearos` ✅
- `runtimeVersion` = `1.1.0`（与 `app.json` `expo.version` 同步）✅
- `eas` CLI ≥ 18.0.1 已安装

> ⚠️ **runtimeVersion 升级**：`runtimeVersion` 只能在 native binary（apk/aab/ipa）变更时升。OTA Update 是纯 JS bundle 替换，不能改 native 代码。如果你需要更新 native（比如新装 `react-native-purchases`），必须发新一版 `runtimeVersion` + 新 binary，旧 OTA channel 不能服务新 JS。

---

## 1. Channel 拓扑

```
production     ← 公开正式包（Play Store / App Store 用户）
preview        ← Internal Testing track + early beta 用户
development    ← 内部 dev client
wearos         ← Watch 配套独立通道
```

每条 channel 在 EAS server 上是独立的 update queue。客户端按打包时定的 channel 拉取自己 queue 的最新 update。

---

## 2. 发版流程（首次或大版本）

```bash
# 1. bump app.json `version` and `runtimeVersion`
# 2. build a fresh native binary
eas build --profile production --platform android

# 3. upload to Play Console (Internal Testing track first)
eas submit --platform android --profile production

# 4. wait for Play review (1-2 days for Internal)
```

---

## 3. OTA hotfix 流程（无 native 变更）

适用：bug fix、文案修改、UI 调整、纯 JS 逻辑。

### 3.1 标准灰度（推荐）

```bash
# 1. 先发 preview channel，给 Internal Testing 100 名 beta 用户
eas update --branch preview --message "v1.1.0+5: fix login retry"

# 2. 等 24-48h 看 Sentry / 用户反馈
#    无 crash 增长 → 进入 step 3
#    有 crash → 走 §4 回滚

# 3. promote 到 production
eas update --branch production --message "v1.1.0+5: fix login retry"
```

### 3.2 紧急 hotfix（崩溃修复）

直接 ship 到 production，但**先发 10% 灰度**：

```bash
# Note: EAS Update 不直接支持 percentage rollout, 用 channel branching 模拟
# Step 1: 创建 production-canary 分支
eas update --branch production-canary --message "Hotfix: crash on Android 14"

# Step 2: 在 EAS dashboard 或代码侧把 10% 用户的 channel 改到 production-canary
# (推荐做法：在 app.json 的 channel 字段里读 EXPO_PUBLIC_OTA_CANARY，
#  builds 时随机分组；下个 native 版本里实现)

# Step 3: 24h 后 promote
eas update --branch production --message "Hotfix: crash on Android 14"
```

---

## 4. 回滚流程

```bash
# 列出最近的 update（找到上一个稳定 update id）
eas update:list --branch production

# 回滚：把 production branch 指向前一个 update
eas update:republish --branch production --group <prev-group-id>
```

回滚生效时间：客户端下次启动 + WiFi 网络下，约 5-30 分钟。

> 💡 **配合 Sentry 灰度终止**：Sentry crash rate 1h 内涨幅 >5x 触发自动告警（通过 Sentry rule + Slack webhook）。Ops 收到告警立刻 rollback。

---

## 5. 发版核查清单

每次 `eas update --branch production` 前必看：

- [ ] `app.json` `version` 没改（OTA 不能改 native version；要改请走 §2 native build）
- [ ] `package.json` 依赖没新增（同上）
- [ ] 本地 `npm run typecheck:root` 通过
- [ ] 关键 Maestro 测试通过：`npm run test:v4:mobile`
- [ ] Sentry release tag 已配置（EAS 自动注入 `release: <runtimeVersion>+<commitsha>`）
- [ ] commit 已 push 到 `origin/main`

---

## 6. 监控

- **Update adoption rate**：EAS dashboard → Updates → 选 production → "Adoption"
- **Crash rate by release**：Sentry → Releases → 选 `agentrix-mobile@1.1.0+N`
- **业务指标**：`agentrix_desktop.analytics_events` 表里 `mobile_*` 事件 + `app_version` 列；通过 Admin Desktop dashboard 看趋势

---

## 7. 常见问题

| 现象 | 排查 |
|------|------|
| 用户拉不到 OTA | 检查 `runtimeVersion` 一致；客户端日志看 `expo-updates` 报错 |
| OTA 装上后白屏 | 必然是 JS 错误；立刻 rollback；不要等 |
| iOS 拒绝 OTA | Apple 政策禁止 OTA 改业务核心。仅文案 / bug fix 可以；新功能必须走 binary 审核 |
| 仅部分用户拿到 | 等 1-2h 慢慢扩散；如急救可让用户手动重启 App 两次 |

---

## 8. 与桌面端 OTA 对比

| 维度 | 移动 (EAS Update) | 桌面 (tauri-plugin-updater) |
|------|------|------|
| 频率 | 高（hotfix 当天）| 低（按 release） |
| Apple/Google 审核 | OTA 不审，但有政策限制 | 无审核 |
| 灰度粒度 | channel-based（粗粒度） | rolloutPercent (DB-driven 5/25/50/100) |
| Rollback | `eas update:republish` 秒级 | 手动改 DB rollout_percent = 0 |
| 监控 | Sentry releases | Sentry releases + analytics_events |

---

> 本文档随每次大版本变更更新。下次更新时机：发布 1.2 大版本前。
