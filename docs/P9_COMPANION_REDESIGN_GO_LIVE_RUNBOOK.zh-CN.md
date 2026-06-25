# P-9 Companion Redesign — Go-Live Runbook (Phase 1)

> 适用版本: build/mobile-pet-forms-p6-2026-05-22 (commit `8c8ed2633`)
> 后端: 47.130.176.148 已部署
> 上线策略: 1% → 10% → 50% → 100% 灰度,每档 24h 监控 + 回滚 SOP

## 灰度档位 SQL

每个档位都通过 update `admin_configs.metadata.rolloutPercentage` 字段实现。

```sql
-- 灰度 1% (建议从这里开始)
UPDATE admin_configs
SET metadata = jsonb_set(metadata, '{rolloutPercentage}', '1')
WHERE key = 'pet_companion_redesign_enabled';

-- 灰度 10%
UPDATE admin_configs
SET metadata = jsonb_set(metadata, '{rolloutPercentage}', '10')
WHERE key = 'pet_companion_redesign_enabled';

-- 灰度 50%
UPDATE admin_configs
SET metadata = jsonb_set(metadata, '{rolloutPercentage}', '50')
WHERE key = 'pet_companion_redesign_enabled';

-- 全量 100%
UPDATE admin_configs
SET metadata = jsonb_set(metadata, '{rolloutPercentage}', '100')
WHERE key = 'pet_companion_redesign_enabled';
```

后端 `CompanionFeatureFlagService` 缓存 60s,所以 SQL 改完最长 60s 后所有用户的下次 boot 才感知。

## 紧急回滚

任何档位发现严重问题(crash 率上升 / 关键路径失败 > 5%):

```sql
-- 立即回滚 — 所有用户走 legacy IA
UPDATE admin_configs
SET metadata = jsonb_set(metadata, '{rolloutPercentage}', '0')
WHERE key = 'pet_companion_redesign_enabled';

-- 或者 master switch 完全关闭
UPDATE admin_configs
SET value = 'false'
WHERE key = 'pet_companion_redesign_enabled';
```

**立即生效条件**: backend 60s cache TTL 过后 + 用户 6h MMKV cache TTL(可强制让用户重启)。
**渠道**: 公告告知用户重启 App 立即生效。

## 在线监控指标 (voiceDiagnostics scope `companion-perf`)

灰度期间需关注:

| 指标 | P95 阈值 | 监控方式 |
|---|---|---|
| `companion-ball-mount` | ≤ 16ms | overBudget 标志 |
| `mode-transition` | ≤ 50ms | overBudget 标志 |
| `trust3-sheet-present` | ≤ 200ms | overBudget 标志 |
| `pet-detail-sheet-present` | ≤ 250ms | overBudget 标志 |
| `voice-greet-tts-start` | ≤ 1500ms | overBudget 标志 |
| `wallet-capsule-anim` | ≤ 3200ms | overBudget 标志 |
| `bubble-first-token-cloud` | ≤ 2000ms | overBudget 标志 |
| `bubble-first-token-local-text` | ≤ 5000ms | overBudget 标志 |
| `remote-control-roundtrip` | ≤ 5000ms | overBudget 标志 |
| `sign-request-roundtrip` | ≤ 2000ms | overBudget 标志 |

CompanionSettings → 维护 → 导出陪伴日志 是用户主动上报的渠道。

## R12.10 Pre-launch checklist (18 项)

跑这一遍才能从 50% 推到 100%。每项需在真机 (iOS + Android 各一台) 上跑通。

1. **冷启动默认 World tab** — `MainTabNavigator.initialRouteName === 'World'`
2. **浮球跨 3 tab 可见** — World/Plaza/Me 看到; Summon 隐藏 (`HIDE_ON_DEEP_ROUTES`)
3. **长按浮球 → PetDetailSheet 9 sections** — Hero + Status + Wallet + Skills + CrossDevice + Actions + CoRaising + Settings + (Devices via RemoteControlPanel)
4. **单击浮球 → ConversationBubble** — autoActivateVoice=true,routing badge 可见
5. **右滑浮球 → 拍照 → ConversationBubble** — 自动开 expo-image-picker camera + prefill "这是什么?"
6. **手动 Voice_Greet 静音/勿扰 21:00 表现** — 22-08 Quiet_Hours 内只允许 manual,其他场景被 guard
7. **iOS Live Activity (锁屏 + 灵动岛)** — JS bridge no-op; 完整需 EAS 重 build native
8. **Android Material You widget + Themed Icons fallback** — Phase 2
9. **Android SYSTEM_ALERT_WINDOW overlay** — JS bridge no-op; 完整需 EAS 重 build native
10. **Mood_Diary_Push 真生产 push** — 19-21 cron 触发; 验证 `last_pushed_at` 时间戳
11. **CompanionSettings Form_Variant 切换即时生效** — 安静 30 分钟按钮 → 浮球 60s 内进入 night
12. **Trust3SigningSheet USDC 转账签名** — 通过 PetDetailSheet "试签名" 按钮跑全链路
13. **Trust3SigningSheet 60s timeout 正确** — 无操作 60s 后 sheet 自动 dismiss + 浮球解锁
14. **Remote control desktop Computer Use** — 桌面 / 手表配对后,RemoteControlPanel "启动 Computer Use" → 桌面端确认收到 `remote-control:run` 事件
15. **至少一个 Siri/小爱/小布 系统意图 端到端** — Phase 2 native; JS handlers ready
16. **至少一个 Agentic Commerce auto-execute push** — 启用 + 在限额内 → wallet-delta capsule + push
17. **feature flag 关闭 → fallback 到 legacy IA** — `rolloutPercentage: 0` + master `value: 'false'` 都需要测试
18. **legacy deeplinks 重定向** — `agentrix://home/*` / `agentrix://wallet/*` / `agentrix://agent/chat` 跑 10 项 grep test (legacyRouteTable 已 ship)

## 数据库变更总览

P-9 Phase 1 总共加了 5 张表 + 6 列:

| 表/列 | Migration | Wave |
|---|---|---|
| `sign_requests` (11 cols + 4 indexes) | `1795000000000-CreateSignRequests.ts` | 0 |
| `pet_diary.last_viewed_at` (TIMESTAMPTZ) | `1796000000000-AddPetDiaryPushTracking.ts` | 13 |
| `pet_diary.last_pushed_at` (TIMESTAMPTZ) | 同上 | 13 |
| `pet_diary.consecutive_push_misses` (SMALLINT) | 同上 | 13 |

## Backend Endpoints 总览

| Endpoint | Module | Wave |
|---|---|---|
| `POST /v1/wallet/sign-request` | sign-request | 0.6 |
| `GET /v1/wallet/sign-request/:id` | sign-request | 0.6 |
| `POST /v1/wallet/sign-request/:id/complete` | sign-request | 0.6 |
| `POST /v1/wallet/sign-request/:id/cancel` | sign-request | 0.6 |
| `GET /v1/pet/greet` | pet-companion-engine | 9 |
| `POST /v1/cross-device/token` | remote-control | 10 |
| `WS /remote-control` namespace | remote-control | 10 |
| `GET /v1/feature-flag/pet_companion_redesign` | companion-redesign | 16 |

每个都通过 JwtAuthGuard,生产 401 smoke test 全部 ✅。

## 客户端 Boot 链 (App.tsx)

```
1. initLlamaBridge()
2. bootPetModeBus()
3. initCrashReport / initAnalytics / initIap
4. (auth restored) →
   a. bootPetModeAdapters({ token, deviceId })  // 9 个 presence subscriptions
   b. bootVoiceGreetScheduler()                 // morning/evening/comeback/manual
   c. bootFormVariantWatcher()                  // 15min poll + AppState foreground
   d. bootCompanionHealthWatcher()              // Pedometer + sitting + late reminder
   e. fetchCompanionFlag()                      // pet_companion_redesign rollout state
```

## Phase 2 后续工作

- T11.2 expo-calendar 集成 (会议检测)
- T11.3 expo-health 步数桥
- T12.1 native iOS PetCompanionActivity.swift (Live Activity)
- T13.1/13.2 native Android CompanionOverlayService.kt + Module
- T14.1/14.2 native iOS App Intents + Android actions.xml
- T17.1 native system-wake-word detection (Hey Siri / 小爱) → 调用 `suspendSelfWakeWord(8000)`
- T22.3 movement-relevant Mood_Diary template variant (后端模板根据步数选)
- T23.2 notification large icon (per-pet sprite hosting + manifest)
- T23.4 App icon (商店审核 14d)
