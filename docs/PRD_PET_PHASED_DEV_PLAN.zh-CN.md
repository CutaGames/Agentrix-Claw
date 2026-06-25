# Agentrix ClawBuddy · 详细分阶段开发计划（前后端 + 多端）

> **版本**：v1.0  
> **日期**：2026-05-06  
> **关联 PRD**：`docs/PRD_DESKTOP_PET_AGENTRIX_CLAW.zh-CN.md`（v2.0）  
> **关联文档**：6 族群人格 / 跨端矩阵 / 商业化与配额 / 阶段测试计划  
> **作者**：@dev + @pm  
> **状态**：草稿，待评审

---

## 0. 计划目的

把主 PRD §6 的 6 个阶段拆解到**周级别 + 任务级别 + 端 / 模块 + 责任方 + 交付物 + 通过条件**。每个 phase 都绑定一组测试用例（见 `PRD_PET_PHASED_TEST_PLAN.zh-CN.md`）作为 exit gate。

读者：所有 IC 工程师、TL、PM、QA、运维、硬件、合规。

---

## 1. 团队角色与责任

| 角色 | 缩写 | 主要负责 |
|------|:-:|------|
| 后端工程师 | `@backend` | NestJS 模块、entity、迁移、Realtime、API |
| 桌面工程师 | `@desktop` | Tauri + React，`desktop/src/` |
| 移动工程师 | `@mobile` | Expo + RN，`src/` 与 `App.tsx` |
| Web 前端 | `@web` | Next.js，`frontend/` |
| 跨端 / 共享 | `@shared` | `shared/types/`，SSoT 契约 |
| 硬件 / 协议 | `@hardware` | ClawCore SDK、固件、wearables |
| 渲染 / 资产 | `@render` | VRM / Rive / 自动 rig 管线 |
| AI / LLM | `@ai` | prompt、模型路由、moderation |
| 安全 / 合规 | `@security` | 钱包、审批、隐私、COPPA |
| 财务 / 经济 | `@treasury` | 配额、订阅、Marketplace 抽成 |
| 设计 | `@design` | UI / 动效 / 营销 |
| QA | `@qa` | 阶段测试、E2E、自动化 |
| DevOps | `@devops` | 部署、监控、CDN、CI |
| PM | `@pm` | 进度、风险、跨团队协调 |
| 增长 | `@growth` | 数据分析、A/B、发布 |
| 法务 | `@legal` | DMCA、disclaimer、合同 |

---

## 2. 全局开发原则

1. **TDD 优先**：每个非平凡模块先写测试再写代码（见测试计划）
2. **小步快跑**：单个 PR < 500 行（迁移除外）
3. **不破坏现有功能**：每个 PR 必须先跑通 Phase 0 已落地功能的 smoke 测试
4. **跨端契约先行**：动 `shared/types/agentrix-presence.ts` 必须开 RFC
5. **特性开关（Feature Flag）**：所有 Phase 1+ 新功能默认 off，通过 backend 配置打开
6. **观测先行**：每个新接口接 Sentry + Prometheus + 业务事件
7. **数据迁移可逆**：所有 migration 必须有 down，并验证过
8. **本地优先**：能本地跑就本地跑，不依赖云端测试环境

---

## 3. 全局基础设施（前置工作，W0）

> 在 Phase 1 开始前必须完成的工作。预计 1 周（2026-05-07 → 2026-05-13）。

### 3.1 后端基础

| 任务 | 责任 | 交付 |
|------|:-:|------|
| Realtime topic 命名规范定稿 | @shared @backend | `shared/types/agentrix-presence.ts` 增 `PresenceTopic` 枚举完整列表 |
| 特性开关基础设施 | @backend | 新增 `feature-flags/` 模块，支持按 user / 按 region / 按百分比开关 |
| 业务事件 schema | @backend | 新增 `analytics-events/`，所有 Phase 1+ 事件先注册 |
| 监控仪表盘骨架 | @devops | Grafana 新增「Pet Platform」dashboard，预留 Phase 1 指标 |
| `pet-` 模块命名规范 | @backend | 所有新模块前缀 `pet-` 或 `pet-soul-` |

### 3.2 桌面基础

| 任务 | 责任 | 交付 |
|------|:-:|------|
| 提取 PetSDK 公共类型到 `shared/types` | @shared @desktop | 现 `desktop/src/services/petSdk.ts` 类型上移到 `shared/types/pet.ts` |
| Tauri permissions 检查 | @desktop | `permissions/desktop-commands.toml` 审计，确保新增命令需显式声明 |

### 3.3 移动基础

| 任务 | 责任 | 交付 |
|------|:-:|------|
| `mobilePetSdk.ts` skeleton | @mobile | 占位文件，对齐 desktop API surface |
| Expo SDK 升级到 v51+（如需） | @mobile | 兼容 react-three-fiber + Skia |
| HealthKit / Health Connect 复审 | @mobile | 确认现有 `vitals-bus` 可用 |

### 3.4 Web 基础

| 任务 | 责任 | 交付 |
|------|:-:|------|
| 创建 `frontend/components/pet/` 目录 | @web | 占位文件 |
| 公开档案页路由占位 `pages/p/[petId]` | @web | 返回 placeholder |

### 3.5 数据基础

| 任务 | 责任 | 交付 |
|------|:-:|------|
| Pet Revenue 数据仓库 schema | @treasury @backend | dbt model `pet_revenue_daily` |
| Pet KPI 数据仓库 schema | @growth | dbt model `pet_kpi_daily` |

### 3.6 设计基础

| 任务 | 责任 | 交付 |
|------|:-:|------|
| 28 只签名宠物视觉草图（Phase 1 用 7 只） | @design | Figma 文件 |
| 6 族群品牌色板 | @design | 设计 token |
| 灵魂选择器 UI mock | @design | Figma 高保真 |

### 3.7 合规 / 法务前置（新增，避免 Phase 4-6 上线被卡）

| 任务 ID | 任务 | 责任 | 交付 |
|:-:|------|:-:|------|
| LG-0.1 | Auto-Earn 营利 / 代发 / 资金流转合规预审（US / EU / CN 三地） | @legal @treasury | 法务意见书 |
| LG-0.2 | Marketplace 创作者分账 × KYC 需求预审（Stripe Connect / Adyen 选型） | @legal @treasury | 选型建议书 |
| LG-0.3 | E 族群 KYC + Web3 disclaimer 话术初稿 | @legal | 合规文本 |
| LG-0.4 | F / C 族群 COPPA / GDPR-K 家长同意流程初稿 | @legal @design | 同意书 mock |
| LG-0.5 | DMCA 反通知 / 平台免责 / TOS / Privacy 推送贴上线前代码 freeze | @legal @web | 文本上线 |

### W0 Exit Gate

- [ ] 所有团队 kickoff 完成
- [ ] `shared/types/agentrix-presence.ts` 类型完整定义并 review
- [ ] Feature flag 服务接通，能在管理后台开关
- [ ] 监控仪表盘可访问且预留 Phase 1 指标位
- [ ] LG-0.1 / LG-0.2 出具意见书，否则 Phase 4 审批 + Auto-Earn 不能入产

---

## 4. Phase 1 — 灵魂 × 皮肤解耦地基（V4 W1-W2，2026-05-14 → 2026-05-27）

### 4.1 Phase 目标

把「灵魂模板 + 皮肤资产」从 v1.0 的隐式概念变成数据库一等公民，让用户能在桌面 / 手机切换灵魂而不丢亲密度。

### 4.2 Phase 入口条件

- W0 全部完成
- @brand 提供 7 只 A 族群宠物的 Persona 数据（来自 `PRD_PET_6_CLANS_PERSONA.zh-CN.md` §3）

### 4.3 W1（5 月 14-20，周一→周日）

#### 后端

| 任务 ID | 任务 | 责任 | 估时 | 依赖 |
|:-:|------|:-:|:-:|------|
| BE-1.1 | 新增 entity `pet-soul-template.entity.ts`（含 §1 全字段） | @backend | 0.5d | — |
| BE-1.2 | 新增 entity `pet-skin.entity.ts`（id/userId/source/skinUrl/vrmUrl/manifest/version） | @backend | 0.5d | — |
| BE-1.3 | 新增 entity `pet-active-skin.entity.ts`（user → activeSkinId 唯一） | @backend | 0.3d | BE-1.2 |
| BE-1.4 | 扩展 `living-pet.entity.ts` 增 `soulTemplateId`、`activeSkinId`、`personalityOverrides` | @backend | 0.3d | BE-1.1 BE-1.3 |
| BE-1.5 | Migration `<ts>-PetSoulSkinPhase1.ts`（含 down） | @backend | 0.5d | BE-1.1-4 |
| BE-1.6 | Migration `<ts>-PetSoulTemplateSeed-A-Clan.ts`（A 族群 7 只 seed） | @backend @ai | 1d | BE-1.1 |
| BE-1.7 | `pet-soul-template.service.ts`（CRUD + 模板版本管理） | @backend | 0.5d | BE-1.1 |
| BE-1.8 | `pet-skin.service.ts`（CRUD + 来源跟踪：generated/purchased/remixed） | @backend | 0.5d | BE-1.2 |
| BE-1.9 | `living-pet.service.ts` 扩展：`switchSoul()` / `activateSkin()` | @backend | 1d | BE-1.4 |

#### 桌面

| 任务 ID | 任务 | 责任 | 估时 |
|:-:|------|:-:|:-:|
| DT-1.1 | `desktop/src/services/petSdk.ts` 引入 `PetSoulTemplate` 类型 + `getCurrentSoul()` / `switchSoul()` API | @desktop | 0.5d |
| DT-1.2 | `desktop/src/services/petCreator.ts` 重构：generation 完成时支持选灵魂 | @desktop | 0.5d |
| DT-1.3 | 新增 `desktop/src/components/SoulPicker.tsx`（族群网格 + 7 只宠物） | @desktop @design | 1d |

#### 移动

| 任务 ID | 任务 | 责任 | 估时 |
|:-:|------|:-:|:-:|
| MB-1.1 | `src/services/mobilePetSdk.ts` MVP（覆盖 getEmotion / setEmotion / getCurrentSoul） | @mobile | 1d |
| MB-1.2 | `src/screens/pet/PetCompanionScreen.tsx` 增灵魂切换入口 | @mobile | 0.5d |

#### Web

| 任务 ID | 任务 | 责任 | 估时 |
|:-:|------|:-:|:-:|
| WB-1.1 | `pages/p/[petId]/index.tsx` 接入 `livingPetService` 数据，展示当前灵魂 + 皮肤 | @web | 1d |
| WB-1.2 | `frontend/components/pet/PetSoulBadge.tsx`（族群 + 名字徽章） | @web @design | 0.3d |

#### 共享

| 任务 ID | 任务 | 责任 | 估时 |
|:-:|------|:-:|:-:|
| SH-1.1 | `shared/types/pet.ts` 新增 `PetSoulTemplateId` / `PetSkinRef` / `PetClan` enum | @shared | 0.5d |
| SH-1.2 | `shared/types/agentrix-presence.ts` 增 `PresenceTopic.pet.soul.changed` / `pet.skin.changed` | @shared | 0.3d |

#### W1 阶段产物

- [ ] BE 三张新表 + 迁移可正反向跑通
- [ ] A 族群 7 只 seed 入库
- [ ] 桌面 SoulPicker 可选灵魂并调用后端 `switchSoul`
- [ ] 移动 / Web 可读取并展示当前灵魂

---

### 4.4 W2（5 月 21-27）

#### 后端

| 任务 ID | 任务 | 责任 | 估时 |
|:-:|------|:-:|:-:|
| BE-2.1 | API：`POST /v1/pet/soul/switch` | @backend | 0.5d |
| BE-2.2 | API：`POST /v1/pet/skin/activate` | @backend | 0.5d |
| BE-2.3 | API：`GET /v1/pet/skins`（我拥有的） | @backend | 0.3d |
| BE-2.4 | API：`GET /v1/pet/souls`（可用模板列表，按计划过滤） | @backend | 0.3d |
| BE-2.5 | Realtime broadcast `pet.soul.changed` / `pet.skin.changed` | @backend | 0.5d |
| BE-2.6 | LLM system prompt 模板渲染器（合并 SoulTemplate + 用户记忆） | @backend @ai | 1d |
| BE-2.7 | 灵魂切换不丢 intimacy 单元测试 | @backend @qa | 0.5d |

#### 桌面

| 任务 ID | 任务 | 责任 | 估时 |
|:-:|------|:-:|:-:|
| DT-2.1 | 桌面 PetCanvas / PetVRM 监听 `pet.soul.changed`，刷新 default emotion | @desktop | 0.5d |
| DT-2.2 | 桌面 SoulPicker 集成到 PetCreatorPanel 流程末端 | @desktop | 0.5d |
| DT-2.3 | 桌面新增「我的皮肤」面板 | @desktop @design | 1d |

#### 移动

| 任务 ID | 任务 | 责任 | 估时 |
|:-:|------|:-:|:-:|
| MB-2.1 | 移动 SoulPicker UI（RN） | @mobile @design | 1d |
| MB-2.2 | 移动监听 `pet.soul.changed`，更新本地状态 | @mobile | 0.5d |
| MB-2.3 | 移动「我的皮肤」简版 | @mobile @design | 1d |

#### Web

| 任务 ID | 任务 | 责任 | 估时 |
|:-:|------|:-:|:-:|
| WB-2.1 | 公开档案页 `/p/[petId]` 完整布局（族群、亲密度、本月任务、皮肤缩略图） | @web @design | 1d |
| WB-2.2 | Open Graph + Twitter Card 元标签 | @web | 0.3d |
| WB-2.3 | 「关注 / 挑战」按钮占位（Phase 4 落地） | @web | 0.2d |

#### 测试 / 文档

| 任务 ID | 任务 | 责任 | 估时 |
|:-:|------|:-:|:-:|
| QA-2.1 | Phase 1 E2E 流程：创建 → 切换灵魂 → 跨端验证 | @qa | 1d |
| QA-2.2 | 单元测试覆盖率 BE 模块 ≥ 80% | @qa @backend | 持续 |
| DOC-2.1 | `docs/api/pet-soul.md` API 文档 | @backend | 0.3d |

### 4.5 Phase 1 Exit Gate

| # | 通过条件 | 验证方法 |
|:-:|------|------|
| 1 | 用户可在桌面 / 手机切换灵魂模板（7 只可选） | 手动 + E2E |
| 2 | 切换灵魂后亲密度 / 记忆 / 钱包 / 任务历史不丢 | 单元 + E2E |
| 3 | 跨端在 5 秒内同步状态 | 手动多端 |
| 4 | 公开档案页 `/p/<id>` 可分享到 X / Discord 显示 OG | 浏览器 + 链接预览 |
| 5 | 后端单测覆盖率 ≥ 80%，无新警告 | CI |
| 6 | 桌面 / 移动 tsc 0 错误 | CI |
| 7 | Migration 反向跑通，能回滚到 v1.0 | 手动 |

---

## 5. Phase 2 — Rive 全量 + 配额 + 审核（V4 W3-W4，2026-05-28 → 2026-06-10）

### 5.1 Phase 目标

让 PetCreator 成为可控、可商业化、合规的主路径。Rive 替代 SVG 成为默认渲染。

### 5.2 W3（5 月 28-6 月 3）

#### 后端

| 任务 ID | 任务 | 责任 | 估时 |
|:-:|------|:-:|:-:|
| BE-3.1 | 新增 entity `pet-gen-quota.entity.ts`（user/month/used/limit/overageBilled） | @backend | 0.3d |
| BE-3.2 | 新增 module `pet-gen-quota` + service（getOrInit / consume / refund / reset） | @backend | 1d |
| BE-3.3 | Cron：每月 1 日 UTC 00:00 重置 | @backend | 0.3d |
| BE-3.4 | `pet-generation.service.ts` 接入配额（pre-check + 失败回滚） | @backend | 0.5d |
| BE-3.5 | 新增 module `moderation`（prompt 关键词 + CLIP 模型 stub） | @backend @ai | 1.5d |
| BE-3.6 | Migration `<ts>-PetGenQuota.ts` | @backend | 0.3d |

#### 桌面 / 移动 / Web

| 任务 ID | 任务 | 责任 | 估时 |
|:-:|------|:-:|:-:|
| RD-3.1 | 渲染层：`@rive-app/canvas` 接入桌面 | @desktop @render | 1d |
| RD-3.2 | 渲染层：`@rive-app/react-native` 接入移动 | @mobile @render | 1d |
| RD-3.3 | 渲染层：Rive web 接入 `frontend/components/pet/` | @web @render | 0.5d |
| RD-3.4 | Default Claw Rive 角色（10 情绪 State Machine） | @design @render | 持续 W3-W4 |
| RD-3.5 | `petAssets.ts` manifest v3 增 `.riv` 类型 | @desktop | 0.5d |

### 5.3 W4（6 月 4-10）

#### 后端

| 任务 ID | 任务 | 责任 | 估时 |
|:-:|------|:-:|:-:|
| BE-4.1 | 接入 Stripe 超额单价 charge（webhook） | @backend @treasury | 1d |
| BE-4.2 | DMCA 投诉表单 API | @backend | 0.5d |
| BE-4.3 | Audit log：所有 PetCreator 提交 + 审核结果上链审计表 | @backend @security | 0.5d |
| BE-4.4 | Provider 自动 failover（Meshy 失败 → Hunyuan3D） | @backend | 1d |

#### 桌面

| 任务 ID | 任务 | 责任 | 估时 |
|:-:|------|:-:|:-:|
| DT-4.1 | PetCreatorPanel 增配额面板（剩余次数 / 升级 CTA） | @desktop @design | 0.5d |
| DT-4.2 | 审核拒绝弹窗（含原因 + 申诉入口） | @desktop @design | 0.5d |
| DT-4.3 | Rive 全部 10 情绪切换在桌面验证 | @desktop @qa | 0.5d |

#### 移动

| 任务 ID | 任务 | 责任 | 估时 |
|:-:|------|:-:|:-:|
| MB-4.1 | PetCreator 移动版（文生 / 图生 / 进度 / 配额） | @mobile @design | 1.5d |
| MB-4.2 | 移动审核拒绝弹窗 | @mobile | 0.3d |

#### Web

| 任务 ID | 任务 | 责任 | 估时 |
|:-:|------|:-:|:-:|
| WB-4.1 | Web PetCreator 简版（提交 + 进度查询） | @web | 1d |
| WB-4.2 | 订阅页：Free / Pro / Pro+ 对比 + Stripe Checkout | @web @treasury | 1.5d |

#### 测试

| 任务 ID | 任务 | 责任 | 估时 |
|:-:|------|:-:|:-:|
| QA-4.1 | Phase 2 E2E：生成 3 次免费 → 第 4 次触发付费 → 失败回滚 | @qa | 1d |
| QA-4.2 | NSFW prompt 拦截覆盖测试集（100 个） | @qa @ai | 1d |
| QA-4.3 | Provider failover 模拟（断 Meshy） | @qa @backend | 0.5d |

### 5.4 Phase 2 Exit Gate

| # | 通过条件 |
|:-:|------|
| 1 | Free 用户每月 3 次生成 + 超额 $0.5 走通 |
| 2 | NSFW 测试集 100% 拦截 |
| 3 | 任意端 Rive 切换情绪 < 200ms |
| 4 | 失败自动退回配额 + 退款 |
| 5 | Stripe webhook 收单成功率 ≥ 99% |
| 6 | DMCA 投诉表单可提交 |

---

## 6. Phase 3 — VRM 标准化 + Marketplace MVP + Web 嵌入（V4 W5-W6，2026-06-11 → 2026-06-24）

### 6.1 Phase 目标

把皮肤变成可流通资产，开启 UGC 经济与 Web 病毒传播。

### 6.2 W5（6 月 11-17）

#### 后端 / 渲染

| 任务 ID | 任务 | 责任 | 估时 |
|:-:|------|:-:|:-:|
| BE-5.1 | 自动 rig 管线 v1（UniRig docker container + Blender headless 兜底） | @render @backend | 2d |
| BE-5.2 | BlendShape 标准映射检查器（VRM 导入时校验 happy/sad/.../busy/earn） | @render @backend | 1d |
| BE-5.3 | 新增 module `marketplace-pet`（独立于 `marketplace/`，避免耦合） | @backend | 1d |
| BE-5.4 | entity `pet-skin-listing.entity.ts`（fixed/auction/rental + price/state/expireAt） | @backend | 0.5d |
| BE-5.5 | entity `pet-skin-royalty.entity.ts`（lineage、Remix 比例、3 层祖先） | @backend | 0.5d |
| BE-5.6 | 反向图搜：CLIP embedding + Faiss index 服务 | @ai @backend | 1.5d |

#### Web

| 任务 ID | 任务 | 责任 | 估时 |
|:-:|------|:-:|:-:|
| WB-5.1 | Marketplace 主页 `pages/marketplace/index.tsx`（搜索 + 列表 + 筛选） | @web @design | 1.5d |
| WB-5.2 | 单品详情页 `pages/marketplace/[id]` | @web | 1d |
| WB-5.3 | `frontend/components/pet/WebPetCanvas.tsx` SVG + Rive | @web | 0.5d |
| WB-5.4 | `frontend/components/pet/WebPetVRM.tsx` three-vrm 渐进加载 | @web @render | 1d |

### 6.3 W6（6 月 18-24）

#### 后端

| 任务 ID | 任务 | 责任 | 估时 |
|:-:|------|:-:|:-:|
| BE-6.1 | API：上架 `POST /v1/marketplace-pet/listings` | @backend | 0.5d |
| BE-6.2 | API：购买 `POST /v1/marketplace-pet/listings/:id/buy` | @backend @treasury | 1d |
| BE-6.3 | API：拍卖出价 `POST /v1/marketplace-pet/listings/:id/bid` | @backend | 0.5d |
| BE-6.4 | API：租赁租用 `POST /v1/marketplace-pet/listings/:id/rent` | @backend @treasury | 0.5d |
| BE-6.5 | Royalty 结算服务（30/70/Remix r 比例计算） | @treasury @backend | 1d |
| BE-6.6 | 双图融合繁殖 API：`POST /v1/pet/skins/breed { skinIdA, skinIdB }` | @backend @render | 1d |
| BE-6.7 | T+7 结算 cron + 退款保险金池 | @treasury @backend | 1d |

#### Web

| 任务 ID | 任务 | 责任 | 估时 |
|:-:|------|:-:|:-:|
| WB-6.1 | Marketplace 上架表单（拖拽 vrm + 设置 Remix 比例 + 价格） | @web @design | 1d |
| WB-6.2 | 公开档案页增「Remix 这只皮肤」按钮 | @web | 0.3d |
| WB-6.3 | iframe 嵌入 SDK：`frontend/components/pet/embed.ts` | @web | 1d |
| WB-6.4 | iframe 路由：`pages/p/[petId]/embed.tsx` | @web | 0.5d |
| WB-6.5 | 文档：合作伙伴嵌入指南 `pages/developers/embed.tsx` | @web | 0.5d |

#### 桌面 / 移动

| 任务 ID | 任务 | 责任 | 估时 |
|:-:|------|:-:|:-:|
| DT-6.1 | 桌面 Marketplace 浏览组件（webview 嵌入或原生） | @desktop @design | 1d |
| MB-6.1 | 移动 Marketplace 浏览（RN 简版） | @mobile @design | 1d |

### 6.4 Phase 3 Exit Gate

| # | 通过条件 |
|:-:|------|
| 1 | 用户可上架皮肤、其他用户可购买、Remix 比例正确分账 |
| 2 | 一行 `<script>` 嵌入宠物到任意网页 |
| 3 | 反向图搜查重命中率 ≥ 90%（自测样本） |
| 4 | T+7 结算自动跑通 |
| 5 | 拍卖反狙击规则正确（截止前 1 分钟 → 延 2 分钟） |
| 6 | VRM auto-rig 失败率 < 5% |

---

## 7. Phase 4 — 跨端审批 + Auto-Earn + 6 端能力对齐（V4 W7-W8，2026-06-25 → 2026-07-08）

### 7.1 Phase 目标

经济飞轮跑起来：宠物开始替用户赚钱，多端审批 + 生物认证形成闭环。

### 7.2 W7（6 月 25-7 月 1）

#### 后端

| 任务 ID | 任务 | 责任 | 估时 |
|:-:|------|:-:|:-:|
| BE-7.1 | `approval-request` 模块完整化（L0-L3 4 级 + biometric token 校验） | @backend @security | 1.5d |
| BE-7.2 | `auto-earn` 模块扩展（5 类品类 + 接单 evaluator + budget gate） | @backend @ai | 2d |
| BE-7.3 | `pet-energy` 服务（恢复速率按计划差异化） | @backend | 0.5d |
| BE-7.4 | A2A：宠物作为发包方 API（`POST /v1/pet/a2a/dispatch`） | @backend | 1d |
| BE-7.5 | 日报 / 周报生成 + 推送 cron | @backend @ai | 1d |
| BE-7.6 | **Auto-Earn 初始任务源接入**：GitHub Issue / Linear / Upwork-like 官方白名单 connector + 付费画像验证 | @backend @ai @bd | 2d |
| BE-7.7 | 任务质量 evaluator 快照：付项验收代码 + 反作弊评分 | @backend @ai @qa | 1.5d |

#### 桌面

| 任务 ID | 任务 | 责任 | 估时 |
|:-:|------|:-:|:-:|
| DT-7.1 | 桌面经济面板（钱包 / 今日 / 本周 / 本月 / 收益曲线） | @desktop @design | 1.5d |
| DT-7.2 | 桌面 Auto-Earn 开关 + 品类选择 UI | @desktop @design | 1d |
| DT-7.3 | 桌面审批卡片升级（含费用 + 风险等级 + 动画） | @desktop @design | 1d |

#### 移动

| 任务 ID | 任务 | 责任 | 估时 |
|:-:|------|:-:|:-:|
| MB-7.1 | 移动 ApprovalSheet 接入 Face ID / Touch ID | @mobile @security | 1d |
| MB-7.2 | 移动审批卡片（推送到达 → 进入 App → 生物认证 → ack） | @mobile | 1d |
| MB-7.3 | 移动经济卡片（Widget 简版） | @mobile @design | 1.5d |

### 7.3 W8（7 月 2-8）

#### 手表

| 任务 ID | 任务 | 责任 | 估时 |
|:-:|------|:-:|:-:|
| WT-8.1 | watchOS Complication（情绪 emoji + 能量条） | @mobile @hardware | 1.5d |
| WT-8.2 | Wear OS Tile（同上） | @mobile @hardware | 1.5d |
| WT-8.3 | 手表 L1 审批：DataLayer push → tap | @mobile @hardware | 1d |
| WT-8.4 | 心率 / 步数自动回传 → 触发 vision_match 替代品 | @mobile | 0.5d |

#### Web

| 任务 ID | 任务 | 责任 | 估时 |
|:-:|------|:-:|:-:|
| WB-8.1 | Web 协签端：WebAuthn / Passkey 接入 L3 审批 | @web @security | 1.5d |
| WB-8.2 | Web 经济视图（嵌入到公开档案页） | @web | 0.5d |

#### 桌面 / 移动 / 玩具占位

| 任务 ID | 任务 | 责任 | 估时 |
|:-:|------|:-:|:-:|
| DT-8.1 | 桌面 L3 协签 UI（多端联合签名进度条） | @desktop @security | 1d |
| MB-8.1 | 移动后台 Auto-Earn 心跳（iOS BGAppRefresh + Android WorkManager） | @mobile | 1.5d |
| HW-8.1 | ClawCore 协议 RFC 草案 review（含 §3.3 SDK 三层） | @hardware | 0.5d |

#### 测试

| 任务 ID | 任务 | 责任 | 估时 |
|:-:|------|:-:|:-:|
| QA-8.1 | Phase 4 E2E：桌面发任务 → 手机生物认证 → 完成 → 入账 | @qa | 1d |
| QA-8.2 | 多端协签 E2E（桌面 + 手机 + Web 三端） | @qa | 0.5d |
| QA-8.3 | Auto-Earn 任务质量评估器准确率（自测 50 个真实任务） | @qa @ai | 1d |

### 7.4 Phase 4 Exit Gate

| # | 通过条件 |
|:-:|------|
| 1 | L2 审批 100% 强制生物认证 |
| 2 | L3 审批协签端数可配置（默认 ≥ 1） |
| 3 | 用户能在 24h 内看到第一笔可见收益 |
| 4 | 能量耗尽自动拒单 |
| 5 | 手表 Complication 5 分钟内同步状态 |
| 6 | Web Passkey 协签可用 |
| 7 | 日报推送送达率 ≥ 95% |

---

## 8. Phase 5 — 摄像头扫描 + ClawCore SDK v1 + 首批硬件（V5 W9-W12，2026-07-09 → 2026-08-05）

### 8.1 Phase 目标

从「软件宠物」走向「住进任意硬件的宠物」。

### 8.2 W9（7 月 9-15）

#### 后端 / AI

| 任务 ID | 任务 | 责任 | 估时 |
|:-:|------|:-:|:-:|
| BE-9.1 | Hunyuan3D 多视角扫描 provider 集成 | @backend @ai | 2d |
| BE-9.2 | `pet-generation.service.ts` 接入扫描模式 | @backend | 1d |
| BE-9.3 | 扫描专属配额（贵 → $1/次）+ 计费 | @treasury @backend | 0.5d |

#### 移动（主入口）

| 任务 ID | 任务 | 责任 | 估时 |
|:-:|------|:-:|:-:|
| MB-9.1 | 移动摄像头扫描 UI：6 视角拍摄向导（前 / 后 / 左 / 右 / 顶 / 底） | @mobile @design | 2d |
| MB-9.2 | Expo Camera + Image preprocessing（去背景 + 增强） | @mobile @render | 1.5d |
| MB-9.3 | 扫描进度页（120s 倒计时 + 提示） | @mobile @design | 0.5d |

### 8.3 W10（7 月 16-22）

#### 硬件 / 协议

| 任务 ID | 任务 | 责任 | 估时 |
|:-:|------|:-:|:-:|
| HW-10.1 | ClawCore proto 定稿（JSON Schema + Protobuf 双格式） | @hardware @shared | 1d |
| HW-10.2 | esp32-rs 骨架（hello / pet.interaction 上报） | @hardware | 2d |
| HW-10.3 | nRF52 Zephyr 骨架 | @hardware | 2d |
| HW-10.4 | Android Bridge SDK（aar） | @hardware @mobile | 1.5d |
| HW-10.5 | iOS Bridge SDK（xcframework） | @hardware @mobile | 1.5d |
| HW-10.6 | 桌面 Tauri Bridge | @hardware @desktop | 1d |

#### 后端

| 任务 ID | 任务 | 责任 | 估时 |
|:-:|------|:-:|:-:|
| BE-10.1 | MQTT broker 接入（EMQX）+ topic 设计 `agentrix/devices/<id>/{up,down}` | @backend @devops | 1d |
| BE-10.2 | 设备注册 / 配对 / token 发放 | @backend @security | 1d |
| BE-10.3 | OTA chunk 服务（仅 L1） | @backend @hardware | 1.5d |

### 8.4 W11（7 月 23-29）

#### L2 联名首发（合作方负责固件与生产，Agentrix 仅提供 SDK + 认证 + 库牌 + 云端）

| 任务 ID | 任务 | 责任 | 估时 |
|:-:|------|:-:|:-:|
| HW-11.1 | L2 示范固件（ESP32-S3 demo）：OLED 情绪渲染（10 状态）作为联名合作方参考 | @hardware | 2d |
| HW-11.2 | L2 示范固件：振动模式 + 物理按键 L1 审批（供联名合作方参考实现） | @hardware | 1d |
| HW-11.3 | L2 联名首发合作方 onboarding（选型、贴牌、联调 BLE pair） | @hardware @bd | 2d |
| HW-11.4 | OTA 升级全流程验证（合作方生产样件 × 5 台） | @hardware | 1.5d |
| HW-11.5 | 合作方营销上口 / 营销需求对接 | @bd | 持续 |

> **变更说明**：Agentrix 不自研硬件，不出货 BOM，不持有库存。L2 首发产品由合作方 ODM 制造，Agentrix 提供设计评审、SDK、云端服务与联名 IP。

#### Glass

| 任务 ID | 任务 | 责任 | 估时 |
|:-:|------|:-:|:-:|
| GL-11.1 | `glassHUDController.service.ts` 接入 PresenceTopics.petState | @hardware | 1d |
| GL-11.2 | Unity / WebGL VRM 渲染（XReal Light 3 试点） | @render @hardware | 2d |
| GL-11.3 | 空间锚点（ARKit anchors / OpenXR） | @hardware @render | 2d |
| GL-11.4 | 桌面 / 手机扫描真实物体生成皮肤的眼镜原生版 | @hardware @render | 1.5d |

### 8.5 W12（7 月 30-8 月 5）

#### 联名 / 认证 / 开发者

| 任务 ID | 任务 | 责任 | 估时 |
|:-:|------|:-:|:-:|
| HW-12.1 | 1-2 个 L2 联名玩具厂商 onboarding（毛绒玩具 / 潮玩） | @hardware @bd | 持续 |
| HW-12.2 | 3-5 个 L3 第三方厂商 onboarding | @hardware @bd | 持续 |
| HW-12.3 | `developer.agentrix.top` 开发者门户 v1：文档 + SDK 下载 + 自助测试 | @web @hardware | 2d |
| HW-12.4 | 自动化认证测试 suite（100 项） | @hardware @qa | 2d |

#### Web 公告 / 营销

| 任务 ID | 任务 | 责任 | 估时 |
|:-:|------|:-:|:-:|
| WB-12.1 | 联名硬件商店页（L2 首发预告 + 合作方企业选型表单） | @web @design | 1.5d |
| WB-12.2 | Phase 5 发布博客 + 视频脚本 | @growth @design | 持续 |

#### 测试

| 任务 ID | 任务 | 责任 | 估时 |
|:-:|------|:-:|:-:|
| QA-12.1 | 摄像头扫描成功率（50 个真实物体） | @qa @mobile | 1.5d |
| QA-12.2 | ClawCore L3 认证 100 项自动化测试通过 | @qa @hardware | 持续 |
| QA-12.3 | Glass HUD 锚定 30 分钟无漂移 | @qa @hardware | 1d |

### 8.6 Phase 5 Exit Gate

| # | 通过条件 |
|:-:|------|
| 1 | 摄像头扫描 95% 成功率 |
| 2 | ClawCore SDK 通过认证试点 ≥ 3 家 |
| 3 | Glass HUD 宠物可空间锚定 30 分钟无漂移 |
| 4 | L2 联名首发合作方产品上架 ≥1 款，pair 成功率 ≥ 99% |
| 5 | OTA 升级成功率 ≥ 99% |
| 6 | 开发者门户可注册 + 下载 SDK + 提交认证 |

---

## 9. Phase 6 — 生态扩张（V6+，2026-08-06 起，季度滚动）

### 9.1 Phase 目标

从产品走向平台。本阶段不再按周拆，而是按月里程碑。

### 9.2 月度里程碑

#### M1（8 月）：6 族群全部上线

- [ ] B 族群 5 只 seed + 营销页
- [ ] C 族群 4 只（含 COPPA 流程）
- [ ] D 族群 4 只（含联名宣发）
- [ ] E 族群 4 只（含 KYC 流程）
- [ ] F 族群 3 只（含家庭账号 + 强制 COPPA）
- [ ] 6 族群营销周（社媒推广 + 影响者）

#### M2（9 月）：宠物团队（V6 Multi-Pet）

- [ ] 主宠 + 11 子宠模型上线（对应 11 Agent 模板）
- [ ] 子宠权限 scope 下发 + 后端校验
- [ ] 桌面多宠并存 UI（避免视觉混乱）
- [ ] 子宠各自钱包 + 主宠总览

#### M3（10 月）：链上身份（NFT 铭文）

- [ ] 高亲密度宠物 mint NFT（可选，不强制）
- [ ] ERC-721 智能合约（含 royalty）
- [ ] 链上数据回显到桌面 / 移动 / Web

#### M4（11 月）：企业定制

- [ ] 企业管理后台（独立子域 `enterprise.agentrix.top`）
- [ ] 私域部署（Docker compose + 文档）
- [ ] 品牌联名宠物（外部公司 = 灵魂模板）
- [ ] 知识库挂载（RAG）

#### M5（12 月）：跨 App 宠物（合作伙伴 SDK）

- [ ] Android / iOS Native SDK 开放
- [ ] 1-2 家合作 App 试点（米哈游 / 网易候选）
- [ ] 嵌入计费模式

#### M6（2027 Q1）：主权宠物

- [ ] 用户自托管钱包模式（MPC 1+1+1）
- [ ] 链上记忆（IPFS / Arweave）
- [ ] 跨链支持（Ethereum / Base / BSC / Solana）

### 9.3 Phase 6 Exit Gate

| # | 通过条件 |
|:-:|------|
| 1 | 6 族群全部上线，每族群 ≥ 100 活跃用户 |
| 2 | 多宠并存稳定（< 0.1% crash） |
| 3 | 3 家以上品牌联名上架 |
| 4 | 首个企业定制项目交付 |
| 5 | 宠物 30 日留存 > 60% |

---

## 10. 跨阶段持续工作

这些工作贯穿全部 6 个阶段，每周 SyncUp 评估：

### 10.1 渲染 / 资产

- 每周新增至少 1 套 Rive 动画（先填 28 只签名宠物）
- 每周新增至少 1 套 VRM 默认皮肤
- BlendShape 一致性回归测试

### 10.2 安全 / 合规

- 每月 bug bounty review
- 每月 DMCA SLA review
- 每季度 COPPA / GDPR 合规复审
- 钱包风控规则迭代

### 10.3 性能 / 监控

- 每周 P95 延迟 review
- 每周 LLM 成本占比 review
- 每月 Realtime topic 流量 review

### 10.4 客服 / 反馈

- 每日客服工单分类 → bug → JIRA
- 每周用户反馈 review meeting
- 每月用户访谈（每族群 ≥ 5 个）

### 10.5 营销 / 增长

- 每周 K-factor / Activation review
- 每月 社媒内容 release
- 每阶段发布博客

---

## 11. 风险与依赖

### 11.1 关键依赖

| 依赖 | 来源 | 风险 |
|------|------|------|
| Meshy / Hunyuan3D API 稳定 | 外部 | T1 |
| 28 只宠物视觉资产 | @design / 外部插画师 | 设计交付延期 |
| ClawCore L2 示范固件 ODM 交付 | @hardware / 外部合作方 | 合作方交付滑期 （不拥有供应链责任但影响阶段营销） |
| Stripe 上线（中国账户） | @treasury / 法务 | 合规 |
| Apple / Google 应用商店审核 | @mobile / 法务 | 平台政策 |

### 11.2 关键风险（来自主 PRD §8 风险矩阵）

阶段对应的最重要风险及应对：

| 阶段 | 主要风险 | 应对 |
|:-:|------|------|
| Phase 1 | P2「灵魂 × 皮肤」概念抽象 | 默认 Claw 兜底，不强制选择 |
| Phase 2 | T1 Meshy 服务波动 | 双 provider failover；T2 自动 rig 失败率 → 兜底静态 |
| Phase 3 | E3 Marketplace 假货 | 反向图搜 + DMCA + 链上凭证 |
| Phase 4 | C3 钱包安全 × 跨境合规 | MPC 默认 + L3 协签 + 异常风控；LG-0.1 预审必须先过 |
| Phase 5 | T5 ClawCore 协议碑裂化 × **联名 ODM 交付滑期** | 强制版本号 + 100 项认证测试；营销口不依赖单一合作方，留两手准备 |
| Phase 6 | C5 跨地区监管差异 | 区域化部署 + 模型白名单 |

### 11.3 工时与调度风险（新增）

| 风险 | 影响 | 应对 |
|------|------|------|
| Phase 5 工时估算偏乐观（摄像头 + Glass + SDK + 联名同期） | W12 可能延期 1-2 周 | Glass 应急预案：推后到 V5b，不阅 P5 Exit Gate |
| 6 人月团队在 Phase 5 并发过高 | 特别是 @hardware 仅 1 人时是瓶颈 | Phase 4 后期外部补充 1 名资深固件临时 contractor |
| @design 28 只宠物原画交付延期 | Phase 1-3 视觉陛贫 | A 族 7 只优先交付；B-F 允许阶段交付 |

---

## 12. 工时估算汇总（人天）

| 阶段 | 后端 | 桌面 | 移动 | Web | 手表 | Glass | 硬件 | 渲染 | QA | 设计 | 合计 |
|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| W0 前置 | 5 | 2 | 2 | 2 | 0 | 0 | 0 | 0 | 1 | 5 | 17 |
| Phase 1 (W1-W2) | 12 | 6 | 5 | 4 | 0 | 0 | 0 | 0 | 3 | 5 | 35 |
| Phase 2 (W3-W4) | 10 | 4 | 6 | 4 | 0 | 0 | 0 | 8 | 4 | 5 | 41 |
| Phase 3 (W5-W6) | 14 | 4 | 3 | 8 | 0 | 0 | 0 | 6 | 4 | 4 | 43 |
| Phase 4 (W7-W8) | 10 | 6 | 8 | 4 | 6 | 0 | 0 | 0 | 4 | 6 | 44 |
| Phase 5 (W9-W12) | 12 | 4 | 8 | 5 | 0 | 8 | 18 | 6 | 6 | 8 | 75 |
| Phase 6 (M1-M6) | 30 | 15 | 15 | 20 | 5 | 10 | 25 | 15 | 15 | 25 | 175 |
| **合计** | **93** | **41** | **47** | **47** | **11** | **18** | **43** | **35** | **37** | **58** | **430 人天** |

按 6 人月（约 22 工作日 × 6 = 132 人天）的团队规模，全部 6 阶段 ≈ 3.3 个团队月。考虑并行度后约 5-6 自然月（含 Phase 6 滚动）。

---

## 13. 交付物清单（最终）

### 13.1 代码交付

| Phase | 后端模块 | 桌面 | 移动 | Web | 硬件 |
|:-:|------|------|------|------|------|
| 1 | 3 entity + service + controller | SoulPicker + petSdk 扩展 | mobilePetSdk + UI | 公开档案页 | — |
| 2 | quota + moderation + payment | Rive + 配额 UI | Rive + PetCreator | Rive + 订阅页 | — |
| 3 | marketplace-pet + royalty | Marketplace 浏览 | Marketplace 简版 | Marketplace + iframe | — |
| 4 | approval + auto-earn + a2a | 经济面板 + 审批 | 生物认证 + 后台 | Passkey 协签 | watchOS / Wear OS |
| 5 | 扫描 + MQTT + OTA | Tauri Bridge | 扫描主入口 | 硬件商店 | ClawCore SDK + L2/L3 认证 + Glass |
| 6 | 多宠 + NFT + 企业 | 多宠并存 | 跨 App SDK | 企业后台 | 联名扩展 |

### 13.2 文档交付

| Phase | 文档 |
|:-:|------|
| 0 | 本计划 + 测试计划 |
| 1 | API 文档 v1 |
| 2 | 配额 / 审核 SOP |
| 3 | Marketplace 创作者指南 |
| 4 | 审批 / 经济用户文档 |
| 5 | ClawCore SDK 文档 + 认证流程 |
| 6 | 企业部署文档 + 合作伙伴 SDK 文档 |

### 13.3 数据 / 运营

| Phase | 数据交付 |
|:-:|------|
| 0 | 监控仪表盘骨架 |
| 1 | 灵魂切换 / 跨端同步 metrics |
| 2 | 配额 / 收入 / 审核命中率 |
| 3 | Marketplace GMV / Remix 链路 |
| 4 | Auto-Earn 收益 / 审批延迟 |
| 5 | 硬件 SKU 数 / 扫描成功率 |
| 6 | 6 族群 DAU / 留存 |

---

## 14. PR / Branch / 发布策略

### 14.1 分支模型

```
main                        # 生产
├─ release/v4.0             # Phase 1 → Phase 4 合集
├─ release/v5.0             # Phase 5 合集
├─ feat/pet-soul-template-phase1  # Phase 1 长期分支
├─ feat/pet-rive-phase2
├─ feat/pet-marketplace-phase3
├─ feat/pet-auto-earn-phase4
├─ feat/pet-clawcore-phase5
└─ feat/pet-multi-phase6
```

### 14.2 PR 规范

- 每个 PR 关联 1 个 Phase 任务 ID（如 `feat(pet): BE-1.1 add pet-soul-template entity`）
- PR 描述必须含「测试计划」「回滚步骤」
- 至少 1 个 reviewer 来自不同子团队（避免单团队闭环）
- 大 migration 必须 @backend TL 二审

### 14.3 发布节奏

- Phase 1-4：每 2 周发一个 release 到 staging，QA 通过后 1 周发 production
- Phase 5：硬件相关每周发 staging（含固件 OTA staging channel）
- Phase 6：月度 release

### 14.4 灰度策略

- 任何 Phase 新功能都默认 feature flag off
- 灰度 1% → 10% → 50% → 100%（每档 ≥ 24h 观察）
- 任何阶段 P0 故障 → 立即回滚 flag

---

## 15. 与现有代码的兼容性约定

### 15.1 不破坏的现有功能

以下功能在 Phase 6 之前必须 100% 保持向前兼容：

- `desktop/src/services/petSdk.ts` 公共 API
- `backend/src/modules/living-pet/` API
- `shared/types/agentrix-presence.ts` 已有类型（仅扩展不修改）
- `backend/src/modules/pet-generation/` API
- `desktop/src/services/desktopSync.ts` 同步契约

### 15.2 弃用计划

如有需要弃用的 API：

```
1. 标 @deprecated + 提供新替代
2. 至少保留 2 个 Phase 的兼容
3. 弃用前 30 天 release notes 公告
4. 弃用后保留接口返回 410 Gone + 替代说明
```

---

## 16. Open Questions / 决策待办

- [ ] **@design** 28 只宠物完整原画交付时间？影响 Phase 1-3 的视觉资产
- [ ] **@brand / @writing** E4 · Doge-X 与 F1 Teddy / F2 Granny / F3 Furry 人格定稿时间（当前 Persona 文件仅完成到 E3，M1 上线前必须补齐）
- [ ] **@qa** `PRD_PET_PHASED_TEST_PLAN.zh-CN.md` 详细用例交付时间；W0 前需出初稿以供各 Phase Exit Gate 引用
- [ ] **@hardware @bd** L2 联名首发 ODM 名单？影响 Phase 5 W11 能否准时首发
- [ ] **@legal** Stripe Connect / Adyen 能否覆盖 Marketplace 创作者全球结算？（LG-0.2）
- [ ] **@legal** Auto-Earn 合规预审（US / EU / CN）能否在 Phase 4 之前完成？（LG-0.1）
- [ ] **@mobile** 是否启动 React Native 0.74 升级，影响 Phase 4 性能？
- [ ] **@brand** 28 只宠物的中 / 英 / 日文官方名最终决定时间？
- [ ] **@growth @ops** Phase 6 M1 “每族群 ≥ 100 活跃用户” 需 sharpen 为：DAU / WAU / MAU？及统计口径？

---

*本计划由 @pm 维护，每周一同步更新。@dev TL 二审。*
