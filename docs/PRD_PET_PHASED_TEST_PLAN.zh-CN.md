# Agentrix ClawBuddy · 阶段测试计划

> **版本**：v1.0  
> **日期**：2026-05-06  
> **关联 PRD**：`docs/PRD_DESKTOP_PET_AGENTRIX_CLAW.zh-CN.md`（v2.0）  
> **关联文档**：`PRD_PET_PHASED_DEV_PLAN.zh-CN.md`  
> **作者**：@qa + @dev  
> **状态**：草稿，待评审

---

## 0. 文档目的

为 ClawBuddy v2.0 6 个阶段的开发提供**强约束的测试计划**：每个 Phase 的 Exit Gate 测试用例 → 测试类型 → 工具 → 责任方 → 通过标准 → 自动化覆盖率目标。

读者：QA、所有开发、PM、运维。

---

## 1. 全局测试策略

### 1.1 测试金字塔

```
                  ┌──────────────────┐
                  │  Manual / UAT    │  10%（手动）
                  ├──────────────────┤
                  │  E2E（多端）      │  20%（自动化为主）
                  ├──────────────────┤
                  │  Integration     │  30%
                  ├──────────────────┤
                  │  Unit            │  40%（基础）
                  └──────────────────┘
```

### 1.2 各端测试工具栈

| 端 | 单元 | 集成 | E2E |
|------|------|------|------|
| 后端 | Jest + Supertest | Jest + Testcontainers (Postgres / Redis) | Jest E2E + nock provider mock |
| 桌面 | Vitest | Vitest + Tauri Mock | Playwright + Tauri WebView |
| 移动 | Jest + RN Testing Library | Detox (iOS / Android) | Maestro（已有） |
| Web | Vitest | Vitest + MSW | Playwright |
| 共享类型 | Vitest + tsd | — | — |
| 渲染 / VRM | Vitest + @react-three/test | Playwright pixel diff | 手动视觉回归 |
| 硬件 / SDK | Cargo test (Rust) / Zephyr ztest | 物理设备试 + protocol fuzz | HIL（Hardware-in-the-Loop） |

### 1.3 必须覆盖率门槛

| 模块 | Phase 1 | Phase 4 | Phase 6 |
|------|:-:|:-:|:-:|
| 后端 service / controller | 80% | 85% | 90% |
| 桌面 services | 70% | 80% | 85% |
| 移动 services | 60% | 75% | 85% |
| Web 关键路径 | 60% | 70% | 80% |
| ClawCore SDK | — | — | 90%（Rust） |
| 共享类型契约 | 100% | 100% | 100% |

### 1.4 关键自动化场景（贯穿所有 Phase）

```
冒烟（每次 PR）：
  1. 浮球渲染 + 切换情绪 < 200ms
  2. PetCreator 文生流程不报 500
  3. 桌面 / 移动 tsc 0 错误
  4. 后端 migration up + down 跑通

回归（每次 release 候选）：
  1. Phase 0 已落地功能（10 情绪 / 6 亲密度 / 6 交互）
  2. 跨端同步 P95 < 1s
  3. 后端 P95 < 300ms
  4. 桌面启动时间 < 1.5s
  5. 内存占用基线
```

---

## 2. 测试环境矩阵

### 2.1 后端环境

| 环境 | 用途 | 数据库 | 部署 |
|------|------|------|------|
| `local` | 开发 | docker-compose Postgres | `npm run start:dev` |
| `ci` | CI/CD | Testcontainers | GitHub Actions |
| `staging` | QA + 灰度 | 独立 Postgres staging | 47.130.176.148:8081 |
| `prod` | 生产 | RDS Postgres | api.agentrix.top |

### 2.2 端测试设备矩阵

| 端 | 测试设备（必测） |
|------|------|
| 桌面 | Windows 11 + 10 / macOS 14+ / Ubuntu 22.04 |
| 移动 iOS | iPhone 15 Pro / iPhone 12 / iPhone SE 3 |
| 移动 Android | Pixel 8 / 三星 S23 / 千元红米 |
| 手表 | Apple Watch Series 9 / Pixel Watch 2 |
| 眼镜 | XReal Light 3 / Quest 3 / 备用 Vision Pro |
| 玩具 | ClawStick prototype / 联名样品 |
| Web | Chrome 124+ / Safari 17+ / Firefox 125+ / 360 浏览器 |

### 2.3 网络条件

| 条件 | 工具 |
|------|------|
| 4G 弱网 | Charles + 网络限速 |
| 高延迟 RTT 800ms | tc qdisc |
| 丢包 5% | tc qdisc |
| 完全离线 | 网卡禁用 |

---

## 3. Phase 0 基线回归测试

> 任何 Phase 1+ 修改都不能破坏 Phase 0 已有功能。这套测试是 PR gate。

### 3.1 已有功能必测清单

| 测试 ID | 描述 | 类型 | 期望结果 |
|:-:|------|:-:|------|
| P0-1 | 桌面浮球启动可见 | E2E | 启动后 1.5s 内浮球出现 |
| P0-2 | 桌面 10 情绪状态机覆盖 | Unit | `petSdk.ts :: EMOTION_MOTION_MAP` 全部 10 种正确映射 |
| P0-3 | 桌面 6 亲密度等级正确扣减 | Unit | xp 公式 `100 * 2^lv` |
| P0-4 | 桌面 6 类交互正确触发 | E2E | tap/double/hover/vision/voice/task_done 全部产生事件 |
| P0-5 | PetCreator 文生提交成功 | Integration | nock provider，提交 → polling → setActivePet 全链 |
| P0-6 | PetCreator 图生提交成功 | Integration | 同上 |
| P0-7 | 后端 LivingPet 衰减 | Unit | `EMOTION_DECAY_MS` 准确 |
| P0-8 | 后端 broadcast PresenceTopics.petState | Integration | 客户端能收到推送 |
| P0-9 | 移动浮球展示 | Maestro | 启动 → 浮球可见 |
| P0-10 | 视觉感知默认关闭 | Unit | 用户不显式开启 → 永远不采样 |

### 3.2 性能基线

| 指标 | 基线 | 检测 |
|------|:-:|------|
| 桌面冷启动 | < 1.5s | Playwright timing |
| L0 SVG 帧率 | 60 FPS | Chrome DevTools |
| L2 VRM 帧率（Win 10 中端） | ≥ 30 FPS | DevTools |
| 后端 GET /v1/pet/state P95 | < 200ms | Prometheus |
| Realtime broadcast 延迟 | < 500ms | 自动化测试 |

---

## 4. Phase 1 测试计划：灵魂 × 皮肤解耦

### 4.1 Phase 1 必测用例

#### 后端单元测试

| 测试 ID | 描述 | 用例 |
|:-:|------|------|
| BE-T1.1 | `pet-soul-template.service.ts` CRUD | 创建 / 读取 / 更新 / 列表 |
| BE-T1.2 | `pet-skin.service.ts` 来源跟踪 | source = generated / purchased / remixed |
| BE-T1.3 | `pet-active-skin` 唯一约束 | 同一 user 多次激活只保留 1 个 active |
| BE-T1.4 | `living-pet.service.ts :: switchSoul()` | 不丢 intimacy / xp / wallet / tasks |
| BE-T1.5 | seed 数据正确性 | 7 只 A 族群 seed 入库后字段完整 |
| BE-T1.6 | `switchSoul` 不可切到不存在的模板 | 抛 NotFoundException |
| BE-T1.7 | Free 用户只能切到 Claw | 调用其他 → 抛 ForbiddenException |
| BE-T1.8 | Pro 用户可切 6 族群任意 1-3 只 | 第 4 只 → ForbiddenException |
| BE-T1.9 | Pro+ 用户可切 28 只 | 全部通过 |
| BE-T1.10 | Migration up + down | 跑通且数据可逆 |

#### 后端集成测试

| 测试 ID | 描述 | 用例 |
|:-:|------|------|
| BE-I1.1 | `POST /v1/pet/soul/switch` E2E | 鉴权 → 切换 → 广播 |
| BE-I1.2 | `POST /v1/pet/skin/activate` E2E | 鉴权 → 激活 → 广播 |
| BE-I1.3 | Realtime topic `pet.soul.changed` | WebSocket subscribe → 收到事件 |
| BE-I1.4 | LLM system prompt 渲染 | 模板 + 用户记忆 → 拼接正确 |
| BE-I1.5 | 性能：100 并发切换 | P95 < 500ms |

#### 桌面单元 / 集成

| 测试 ID | 描述 |
|:-:|------|
| DT-T1.1 | `petSdk.ts :: getCurrentSoul()` 返回当前灵魂 |
| DT-T1.2 | `petSdk.ts :: switchSoul(id)` 调用后端 + 本地缓存 |
| DT-T1.3 | SoulPicker 渲染 7 只宠物（A 族群） |
| DT-T1.4 | SoulPicker 选中 → 调用 switchSoul |
| DT-T1.5 | 监听 `pet.soul.changed` 事件后浮球默认情绪刷新 |

#### 移动单元 / 集成

| 测试 ID | 描述 |
|:-:|------|
| MB-T1.1 | `mobilePetSdk.ts` 与桌面 API 形态对齐 |
| MB-T1.2 | PetCompanionScreen 加载当前灵魂 |
| MB-T1.3 | 移动 SoulPicker 切换灵魂 |

#### Web 单元 / 集成

| 测试 ID | 描述 |
|:-:|------|
| WB-T1.1 | `/p/[petId]` SSG 渲染含 OG 元标签 |
| WB-T1.2 | PetSoulBadge 显示族群 + 名字 |
| WB-T1.3 | 公开档案页支持未登录访问 |

#### 跨端 E2E

| 测试 ID | 描述 |
|:-:|------|
| E2E-1.1 | 桌面切灵魂 → 移动 5 秒内同步 |
| E2E-1.2 | 移动切灵魂 → 桌面 5 秒内同步 |
| E2E-1.3 | 桌面切灵魂 → Web 公开档案页刷新可见 |
| E2E-1.4 | 切灵魂前后亲密度 / xp / 钱包余额一致 |
| E2E-1.5 | 离线时切灵魂 → 上线后同步 |

#### 异常 / 边界

| 测试 ID | 描述 |
|:-:|------|
| EX-1.1 | 同一 user 多端同时切灵魂 → 后端时间戳后到为准 |
| EX-1.2 | 灵魂模板 v1 → v2 升级时 user 选择不升级 → 保留 v1 prompt |
| EX-1.3 | switchSoul 后 LLM 仍用旧 prompt → 必须强制 refresh |

### 4.2 Phase 1 Exit Gate 测试清单

| # | Exit Gate | 测试 ID | 通过判据 |
|:-:|------|------|------|
| 1 | 用户可切灵魂模板 | DT-T1.4 / MB-T1.3 | 手动 + E2E 通过 |
| 2 | 不丢亲密度 | BE-T1.4 / E2E-1.4 | 单测 + E2E 通过 |
| 3 | 跨端 5s 同步 | E2E-1.1 / E2E-1.2 | P95 < 5s |
| 4 | 公开档案页 OG | WB-T1.1 | Twitter / Facebook 链接预览正确 |
| 5 | 单测覆盖率 ≥ 80% | CI | Jest report |
| 6 | tsc 0 错误 | CI | tsc --noEmit |
| 7 | Migration 反向 | BE-T1.10 | 手动 down 验证 |

---

## 5. Phase 2 测试计划：Rive + 配额 + 审核

### 5.1 后端测试

| 测试 ID | 描述 | 类型 |
|:-:|------|:-:|
| BE-T2.1 | `pet-gen-quota.service.ts :: consume()` 正确扣减 | Unit |
| BE-T2.2 | `pet-gen-quota.service.ts :: refund()` 失败回滚 | Unit |
| BE-T2.3 | 月度重置 cron 正确执行 | Integration |
| BE-T2.4 | Free 配额 3 次后第 4 次必须触发 overage | Integration |
| BE-T2.5 | overage 单价 $0.5 准确收单 | Integration（Stripe mock） |
| BE-T2.6 | `moderation` 关键词过滤集 100% 准确 | Unit（自带 100 词测试集） |
| BE-T2.7 | CLIP 审核 NSFW 拦截率 ≥ 99% | Integration（100 测试图） |
| BE-T2.8 | Provider failover：Meshy 5xx → Hunyuan3D 接力 | Integration（nock） |
| BE-T2.9 | DMCA 投诉表单提交记录 | Integration |
| BE-T2.10 | Audit log 完整性 | Integration |

### 5.2 渲染 / Rive 测试

| 测试 ID | 描述 | 类型 |
|:-:|------|:-:|
| RD-T2.1 | Rive State Machine ↔ 10 情绪 1:1 映射 | Unit |
| RD-T2.2 | 桌面 Rive 切换情绪 < 200ms | Performance |
| RD-T2.3 | 移动 Rive 切换情绪 < 200ms | Performance |
| RD-T2.4 | Web Rive 切换情绪 < 200ms | Performance |
| RD-T2.5 | Rive 文件加载失败 → 自动降 SVG fallback | E2E |
| RD-T2.6 | Default Claw 全 10 情绪动画连贯（视觉） | 手动 + 像素回归 |

### 5.3 跨端 E2E

| 测试 ID | 描述 |
|:-:|------|
| E2E-2.1 | 用户生成 3 次免费 → 第 4 次显示付费弹窗 |
| E2E-2.2 | 用户拒绝付费 → 不扣费、不生成 |
| E2E-2.3 | 用户付费 $0.5 → Stripe webhook → 生成成功 |
| E2E-2.4 | 生成失败 → 配额自动退还 |
| E2E-2.5 | NSFW prompt → 立即拒绝 |
| E2E-2.6 | 用户上传违规图片生图 → CLIP 拦截 |
| E2E-2.7 | 跨端 Rive 切情绪同步 < 1s |

### 5.4 性能 / 压力

| 测试 ID | 描述 | 通过 |
|:-:|------|:-:|
| PF-2.1 | 100 并发提交 PetCreator | 后端 P95 < 500ms |
| PF-2.2 | 1000 用户同时配额查询 | < 200ms |
| PF-2.3 | Rive 资产 CDN 加载 | P95 < 2s |

### 5.5 Phase 2 Exit Gate

| # | Exit Gate | 关键测试 |
|:-:|------|------|
| 1 | Free 月 3 次 + 超额 $0.5 | E2E-2.1 / E2E-2.3 |
| 2 | NSFW 100% 拦截 | BE-T2.6 / BE-T2.7 |
| 3 | Rive 切换 < 200ms | RD-T2.2-4 |
| 4 | 失败自动退 | E2E-2.4 |
| 5 | Stripe webhook ≥ 99% 收单成功 | BE-T2.5 |
| 6 | DMCA 表单可用 | BE-T2.9 |

---

## 6. Phase 3 测试计划：VRM 标准化 + Marketplace MVP + Web 嵌入

### 6.1 后端测试

| 测试 ID | 描述 |
|:-:|------|
| BE-T3.1 | 自动 rig 管线：100 个 .glb → .vrm 成功率 ≥ 95% |
| BE-T3.2 | BlendShape 校验：缺 happy / sad / angry / surprised / neutral 时拒绝 |
| BE-T3.3 | `marketplace-pet` 上架 / 购买 / 拍卖 / 租赁 4 流程 |
| BE-T3.4 | Royalty 计算正确：30 / 70 / Remix r |
| BE-T3.5 | Royalty 3 层祖先正确截断 |
| BE-T3.6 | 反向图搜：90% 已知图片成功命中 |
| BE-T3.7 | 双图融合繁殖：3 次自测无报错 |
| BE-T3.8 | T+7 结算 cron 准确入账 |
| BE-T3.9 | 拍卖反狙击：截止前 1 分钟出价 → 延 2 分钟 |
| BE-T3.10 | 租期到期自动归还 |

### 6.2 Web 测试

| 测试 ID | 描述 |
|:-:|------|
| WB-T3.1 | Marketplace 主页搜索 / 筛选正确 |
| WB-T3.2 | 单品详情页含三档（一口价 / 拍卖 / 租赁） |
| WB-T3.3 | Web VRM 渐进加载（先低面 → 高面） |
| WB-T3.4 | iframe 嵌入 SDK：跨域 sandbox 不破坏母页 |
| WB-T3.5 | 一行 `<script>` 嵌入：合作伙伴页面正常显示 |
| WB-T3.6 | 公开档案页含 Remix 按钮 |

### 6.3 安全 / 合规

| 测试 ID | 描述 |
|:-:|------|
| SC-T3.1 | iframe sandbox 防 XSS（注入测试） |
| SC-T3.2 | 上架皮肤恶意 .vrm（含 JS payload）→ 拒绝 |
| SC-T3.3 | 反盗版：5 个已知盗版样本 100% 命中 |
| SC-T3.4 | DMCA 假信号惩罚：模拟 3 次假投诉 → 限流 |

### 6.4 跨端 E2E

| 测试 ID | 描述 |
|:-:|------|
| E2E-3.1 | 用户上架 → 其他用户购买 → 创作者钱包入账 |
| E2E-3.2 | A 上架 r=20% → B Remix → 售出后正确分账 |
| E2E-3.3 | 拍卖出价 → 反狙击 → 成交 |
| E2E-3.4 | 租赁 1 月 → 到期自动归还 |
| E2E-3.5 | 双图融合 → 子皮肤 vrm 可正常加载 |

### 6.5 Phase 3 Exit Gate

| # | Exit Gate | 关键测试 |
|:-:|------|------|
| 1 | 上架 / 购买 / Remix 流程 | E2E-3.1 / E2E-3.2 |
| 2 | iframe 嵌入 | WB-T3.5 |
| 3 | 反向图搜 ≥ 90% | BE-T3.6 |
| 4 | T+7 结算 | BE-T3.8 |
| 5 | 拍卖反狙击 | BE-T3.9 |
| 6 | VRM auto-rig < 5% 失败 | BE-T3.1 |

---

## 7. Phase 4 测试计划：跨端审批 + Auto-Earn + 6 端能力对齐

### 7.1 后端测试

| 测试 ID | 描述 |
|:-:|------|
| BE-T4.1 | L0-L3 审批四级正确路由 |
| BE-T4.2 | L2 必须 biometric token，缺则拒绝 |
| BE-T4.3 | L3 协签端数可配置，达不到 → 拒绝 |
| BE-T4.4 | Auto-Earn 接单 evaluator 准确率 ≥ 80%（自测 50 任务） |
| BE-T4.5 | Auto-Earn 单宠物日预算上限触达 → 拒单 |
| BE-T4.6 | 能量系统：每小时恢复 10%，归零拒单 |
| BE-T4.7 | A2A 派单：宠物作为发包 + 子任务回收 |
| BE-T4.8 | 日报 / 周报 cron 准确推送 |
| BE-T4.9 | 异常风控：1 小时 100 次 LLM 调用 → 暂停 + 告警 |

### 7.2 桌面测试

| 测试 ID | 描述 |
|:-:|------|
| DT-T4.1 | 经济面板：钱包 / 今日 / 本周 / 本月正确显示 |
| DT-T4.2 | Auto-Earn 开关 → 后端正确接收 |
| DT-T4.3 | 审批卡片含费用 + 风险等级 + L0-L3 视觉 |
| DT-T4.4 | L3 协签 UI 正确显示 ≥ 1 端进度 |

### 7.3 移动测试

| 测试 ID | 描述 |
|:-:|------|
| MB-T4.1 | Face ID 通过 → biometric token 后端校验通过 |
| MB-T4.2 | Face ID 失败 5 次 → fallback 密码 |
| MB-T4.3 | Touch ID（兼容）正常 |
| MB-T4.4 | Android 指纹 / 面容（CryptoObject）通过 |
| MB-T4.5 | Widget 显示当前状态 |
| MB-T4.6 | 后台 Auto-Earn 心跳：iOS BGAppRefresh 真机测试 |
| MB-T4.7 | Android WorkManager 心跳真机测试 |

### 7.4 手表测试

| 测试 ID | 描述 |
|:-:|------|
| WT-T4.1 | watchOS Complication 渲染 + 5 分钟内同步 |
| WT-T4.2 | Wear OS Tile 渲染 + 同步 |
| WT-T4.3 | 手表 L1 审批 tap → 主机收到 |
| WT-T4.4 | 心率自动回传 |
| WT-T4.5 | 表盘 Always-On 模式不跑动画（节能） |

### 7.5 Web 测试

| 测试 ID | 描述 |
|:-:|------|
| WB-T4.1 | WebAuthn / Passkey 注册 |
| WB-T4.2 | Web 协签 L3 审批，返回签名 token |
| WB-T4.3 | 公开档案页嵌入经济视图 |

### 7.6 跨端 E2E

| 测试 ID | 描述 |
|:-:|------|
| E2E-4.1 | 桌面发 L2 任务 → 手机推送 → Face ID → 完成 |
| E2E-4.2 | 桌面 L3 任务 → 手机 + Web 双协签 → 通过 |
| E2E-4.3 | Auto-Earn 接单 → 完成 → 钱包入账 |
| E2E-4.4 | 能量耗尽 → 接到新单自动拒 |
| E2E-4.5 | 用户睡觉模式 → 8 小时 → 能量满 |

### 7.7 性能 / 压力

| 测试 ID | 描述 | 通过 |
|:-:|------|:-:|
| PF-4.1 | 1000 审批并发 | 后端 P95 < 500ms |
| PF-4.2 | 100 个 Auto-Earn 任务并行 | 不会任一互相阻塞 |
| PF-4.3 | 单宠物日 LLM 成本上限触达 | 立即停止，告警 < 10s |

### 7.8 Phase 4 Exit Gate

| # | Exit Gate | 关键测试 |
|:-:|------|------|
| 1 | L2 100% 生物 | BE-T4.2 / MB-T4.1 |
| 2 | 24h 内可见收益 | E2E-4.3 |
| 3 | 能量自动拒单 | BE-T4.6 / E2E-4.4 |
| 4 | 手表 5 分钟同步 | WT-T4.1 / WT-T4.2 |
| 5 | Web Passkey 协签 | WB-T4.2 |
| 6 | 日报 ≥ 95% 送达 | BE-T4.8 |

---

## 8. Phase 5 测试计划：摄像头扫描 + ClawCore SDK + 首批硬件

### 8.1 摄像头扫描

| 测试 ID | 描述 | 通过 |
|:-:|------|:-:|
| MB-T5.1 | 6 视角拍摄向导（前 / 后 / 左 / 右 / 顶 / 底） | UI 测试 |
| MB-T5.2 | 真实物体扫描成功率（50 个样本） | ≥ 95% |
| MB-T5.3 | 扫描过程图像预处理（去背景 / 增强） | 视觉抽样 |
| MB-T5.4 | 120s 内出 .vrm | P95 < 150s |
| MB-T5.5 | 扫描失败 → 配额回滚 + 提示 | 单元 |
| MB-T5.6 | 扫描贵配额（$1）正确扣 | 集成 |

### 8.2 ClawCore SDK 测试（Rust + 协议）

| 测试 ID | 描述 |
|:-:|------|
| HW-T5.1 | proto JSON Schema 校验 |
| HW-T5.2 | esp32-rs 单测 hello / pet.interaction 帧 |
| HW-T5.3 | nRF52 单测同上 |
| HW-T5.4 | Android Bridge：BLE pair 100 次成功率 ≥ 99% |
| HW-T5.5 | iOS Bridge：BLE pair 100 次成功率 ≥ 99% |
| HW-T5.6 | 桌面 Bridge：BLE pair |
| HW-T5.7 | MQTT 双向通信 |
| HW-T5.8 | OTA chunk 升级（L1） |
| HW-T5.9 | sig HMAC 校验，篡改帧拒绝 |
| HW-T5.10 | L3 认证测试 suite 100 项通过 |

### 8.3 ClawStick 硬件测试

| 测试 ID | 描述 |
|:-:|------|
| HW-T5.11 | OLED 10 情绪正确渲染 |
| HW-T5.12 | 振动模式 4 种正确 |
| HW-T5.13 | 物理按键 L1 审批响应 < 100ms |
| HW-T5.14 | BLE pair → Wi-Fi provisioning 一键 |
| HW-T5.15 | OTA 升级 100 次成功率 ≥ 99% |
| HW-T5.16 | 离线 1 小时 → 重连后状态恢复 |
| HW-T5.17 | 续航：纽扣电池 6 个月（仿真） |
| HW-T5.18 | 跌落 1m 不损坏 |
| HW-T5.19 | 工作温度 -10°C → 50°C |

### 8.4 Glass HUD

| 测试 ID | 描述 |
|:-:|------|
| GL-T5.1 | XReal Light 3 HUD 渲染 |
| GL-T5.2 | 空间锚 30 分钟无漂移 |
| GL-T5.3 | 眼动追踪 gaze > 1s = `hover_long` |
| GL-T5.4 | 手势单击批准（≤ 200ms 延迟） |
| GL-T5.5 | 60 FPS（< 60 拒绝上线） |

### 8.5 Phase 5 Exit Gate

| # | Exit Gate | 关键测试 |
|:-:|------|------|
| 1 | 扫描 95% 成功率 | MB-T5.2 |
| 2 | ClawCore 认证 ≥ 3 家 | HW-T5.10 |
| 3 | Glass 锚 30 分钟无漂移 | GL-T5.2 |
| 4 | ClawStick pair 99% | HW-T5.14 |
| 5 | OTA 99% 成功率 | HW-T5.15 |
| 6 | 开发者门户可用 | 手动 |

---

## 9. Phase 6 测试计划：生态扩张

由于 Phase 6 按月里程碑滚动，测试也按里程碑：

### 9.1 M1：6 族群上线

| 测试 | 通过 |
|------|------|
| 28 只宠物 seed 入库 | 全部 |
| 6 族群 prompt 风格人工 review | @writing 签收 |
| C 族群 COPPA 流程 100% 强制 | 测试覆盖 |
| E 族群 KYC 流程 100% 强制 | 测试覆盖 |
| F 族群 COPPA + 家长账号 | 测试覆盖 |

### 9.2 M2：多宠并存

| 测试 | 通过 |
|------|------|
| 主宠 + 11 子宠模型创建 | E2E |
| 子宠 scope 越权访问父宠钱包 → 必须拒绝 | E2E + 安全测试 |
| 桌面 12 宠并存 UI 不卡 | 60 FPS |
| 子宠各自钱包余额隔离 | 单元 |

### 9.3 M3：链上身份 NFT

| 测试 | 通过 |
|------|------|
| ERC-721 mint 流程 | 链上测试网 |
| Royalty 在二手市场转售生效 | 链上测试 |
| 跨平台显示 NFT | E2E |

### 9.4 M4：企业定制

| 测试 | 通过 |
|------|------|
| 私域部署 docker compose 一键启动 | 手动 |
| 品牌定制宠物 prompt 入库 | E2E |
| 知识库 RAG 准确率 ≥ 80% | 自测集 |

### 9.5 M5：跨 App SDK

| 测试 | 通过 |
|------|------|
| Android SDK aar 体积 < 8 MB | CI |
| iOS xcframework 体积 < 8 MB | CI |
| 嵌入合作伙伴 App 不破坏对方 UI | 手动 + 试点 |
| 钱包功能在 SDK 内不可访问 | 安全 |

### 9.6 M6：主权宠物

| 测试 | 通过 |
|------|------|
| 用户自托管 MPC 1+1+1 模式 | 链上测试 |
| 链上记忆 IPFS 写入 / 读取 | 集成 |
| 多链跨链转账 | 链上测试 |

---

## 10. 持续测试与监控

### 10.1 CI / CD 触发

```yaml
# .github/workflows/pet-platform.yml
on:
  push:
    paths:
      - 'backend/src/modules/living-pet/**'
      - 'backend/src/modules/pet-generation/**'
      - 'backend/src/modules/pet-soul-template/**'
      - 'backend/src/modules/pet-skin/**'
      - 'backend/src/modules/marketplace-pet/**'
      - 'desktop/src/services/petSdk.ts'
      - 'desktop/src/services/petCreator.ts'
      - 'desktop/src/components/Pet*.tsx'
      - 'src/services/mobilePetSdk.ts'
      - 'src/components/GlobalFloatingBall.tsx'
      - 'src/screens/pet/**'
      - 'frontend/components/pet/**'
      - 'shared/types/agentrix-presence.ts'
      - 'shared/types/pet.ts'
jobs:
  - phase0-regression  # 每次必跑
  - unit-tests
  - integration-tests
  - e2e-cross-platform  # 仅 release 候选
```

### 10.2 生产监控告警

| 指标 | 阈值 | 通知 |
|------|:-:|------|
| Pet API P95 > 500ms | 持续 5min | PagerDuty (P1) |
| Realtime 同步 P95 > 2s | 持续 5min | PagerDuty (P1) |
| PetCreator 成功率 < 80% | 持续 30min | PagerDuty (P0) |
| LLM 单宠物日成本超限 | 即时 | Slack + 自动暂停 |
| Auto-Earn 任务失败率 > 30% | 持续 1h | Slack |
| Marketplace 拍卖结算延迟 > 1h | 即时 | PagerDuty |
| ClawCore 设备掉线率 > 5% | 持续 30min | Slack |

### 10.3 用户体验监控

| 指标 | 工具 |
|------|------|
| 桌面 Crash | Sentry + Rust panic hook |
| 移动 Crash | Sentry + Crashlytics |
| Web Error | Sentry browser SDK |
| 帧率 (FPS) | 自定义 telemetry |
| 用户投诉 | 客服系统 + 自动分类 |

---

## 11. 测试数据管理

### 11.1 测试用户账户矩阵

| 账户 | 计划 | 用途 |
|------|:-:|------|
| `qa-free@agentrix.top` | Free | 配额边界测试 |
| `qa-pro@agentrix.top` | Pro | 主力测试 |
| `qa-pro-plus@agentrix.top` | Pro+ | 无限测试 |
| `qa-enterprise@agentrix.top` | 企业 | 私域测试 |
| `qa-coppa-parent@agentrix.top` | F 族群家长 | COPPA 测试 |
| `qa-coppa-child@agentrix.top` | F 族群孩子 | COPPA 子账户 |

### 11.2 测试 Provider mock

```typescript
// tests/mocks/meshy-mock.ts
class MockMeshyProvider {
  submit(req): Promise<{ providerRequestId: string }>;
  status(id): Promise<{ status: 'queued' | 'processing' | 'succeeded' | 'failed', glb_url?: string }>;
}

// 使用：tests/integration/pet-generation.spec.ts
beforeEach(() => useMeshyMock(scenarios.success));
```

### 11.3 NSFW 测试集

```
tests/fixtures/nsfw-prompts.txt    # 100 个 NSFW prompt
tests/fixtures/nsfw-images/        # 100 张 NSFW / borderline 图片
tests/fixtures/safe-prompts.txt    # 100 个安全 prompt（用于反向）
```

> NSFW fixture 使用 hash 而非原始内容，原始内容存放在私有 S3，CI 时下载。

### 11.4 性能基准 fixture

```
tests/perf/baselines/
  ├─ desktop-cold-start.json
  ├─ rive-emotion-switch.json
  ├─ vrm-load-time.json
  ├─ realtime-broadcast.json
  └─ ...
```

每次 release 候选自动 diff 基线，> 10% 退化即报警。

---

## 12. 用户验收测试（UAT）

### 12.1 每个 Phase 末

- 内部 dogfooding：员工 + 公司朋友 5-10 人，2 周
- 收集体验反馈：宠物的"灵魂"是否符合期待、流程是否顺畅、配额是否合理、价格是否接受
- 反馈 → 必修必改清单

### 12.2 Phase 5+ 增加用户访谈

- 每族群 ≥ 5 人深度访谈（视频访谈）
- 访谈大纲：
  1. 你给宠物起的名字 / 印象
  2. 你最喜欢的 3 个交互
  3. 你不愿付费的原因（如适用）
  4. 你希望增加什么能力
  5. 1-10 分推荐给朋友的可能性

---

## 13. 安全 / 合规专项测试

### 13.1 钱包安全

| 测试 | 工具 | 频率 |
|------|------|:-:|
| MPC 私钥分片正确 | 单测 | 每 PR |
| 子宠物越权访问父宠物钱包 | E2E + 安全 | 每 release |
| L3 协签可绕过 | 渗透测试 | 季度 |
| 异地大额触发风控 | E2E | 每 release |

### 13.2 隐私

| 测试 | 工具 | 频率 |
|------|------|:-:|
| 视觉感知数据本地永远不上传 | 网络抓包 + 代码审计 | 每 release |
| 用户数据导出 | E2E（GDPR 合规） | 每月 |
| 用户数据删除 | E2E | 每月 |

### 13.3 内容审核

| 测试 | 工具 | 频率 |
|------|------|:-:|
| 100 NSFW prompt 100% 拦截 | 自动 | 每 PR |
| 100 NSFW 图片 ≥ 99% 拦截 | 自动 | 每 PR |
| DMCA 流程 48h SLA | 模拟 | 每月 |
| 假信号惩罚生效 | 自动 | 每 release |

### 13.4 COPPA / GDPR / 区域化

| 测试 | 工具 | 频率 |
|------|------|:-:|
| F 族群强制家长账号 | E2E | 每 release |
| F 族群禁用支付 | E2E | 每 release |
| GDPR 数据导出 | 手动 | 每季度 |
| 中国地区模型白名单 | 手动 + 自动 | 每 release |
| 美国 / 欧盟地区合规 | 法务 review | 每 release |

---

## 14. 回滚演练

每 Phase 末必须演练一次回滚：

1. 模拟生产 P0 故障
2. 触发 feature flag off
3. 5 分钟内回滚到上一版本
4. 数据库迁移反向跑通（如适用）
5. 用户感知影响评估
6. 演练报告

---

## 15. 测试自动化覆盖率目标（统计入 CI）

| Phase | 后端 | 桌面 | 移动 | Web | E2E | 整体 |
|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Phase 1 | 80% | 70% | 60% | 60% | 关键链路 100% | ≥ 70% |
| Phase 2 | 82% | 72% | 65% | 65% | 关键链路 100% | ≥ 73% |
| Phase 3 | 84% | 75% | 70% | 70% | 关键链路 100% | ≥ 76% |
| Phase 4 | 85% | 80% | 75% | 70% | 关键链路 100% | ≥ 78% |
| Phase 5 | 87% | 80% | 80% | 75% | 关键链路 100% | ≥ 80% |
| Phase 6 | 90% | 85% | 85% | 80% | 关键链路 100% | ≥ 85% |

---

## 16. 责任与节奏

| 角色 | 职责 |
|------|------|
| @qa | 用例编写 + 自动化 + UAT 组织 + 报告 |
| @backend | 单测 + 集成测覆盖率 |
| @desktop / @mobile / @web | 端单测 + Maestro / Playwright 用例 |
| @hardware | 协议测试 + HIL + 物理测试 |
| @security | 渗透 + 合规 + 风控 |
| @devops | CI 集成 + 监控 + 回滚演练 |
| @pm | 每 Phase Exit Gate review 主持 |

### 16.1 测试 / 开发节奏

```
Day 1-2     测试用例先行（非平凡模块）
Day 3-7     开发 + 单测
Day 8       集成测试 + bug 修复
Day 9       E2E + UAT
Day 10      Exit Gate Review，签收 → 进入下 Phase
```

### 16.2 Bug 优先级

| 级别 | 定义 | SLA |
|:-:|------|:-:|
| P0 | 生产故障 / 安全漏洞 | < 4h |
| P1 | 主流程不可用 / 核心 KPI 影响 | < 24h |
| P2 | 体验问题但有 workaround | < 1 周 |
| P3 | 低频 / 优化建议 | 入下个 Phase |

---

## 17. Open Questions

1. ClawCore L3 认证 100 项测试的具体清单是否在 Phase 4 末完成？依赖硬件协议定稿
2. Glass 端的自动化测试如何做？目前以手动 + HIL 为主
3. Web Passkey 在不同浏览器（Safari / Chrome / Firefox）的兼容性矩阵
4. 多宠并存的 12 宠 fps 测试设备级别（中端 vs 旗舰）

---

*本测试计划由 @qa 与 @dev 共同维护。任何 PR 必须先验证 Phase 0 基线回归未破坏。每 Phase Exit Gate 必须 @qa + @pm 双签。*
