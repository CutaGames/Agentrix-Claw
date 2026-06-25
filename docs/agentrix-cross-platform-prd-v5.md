# Agentrix 跨端产品 PRD v5.0（World Engine · 唯一权威）

> **一只灵魂 + 一副皮肤 + 一个由现实生成的世界，跟随用户横穿 6 屏幕 + N 件硬件。**
>
> v5 在 v4 基础上引入 **Reality AI World Engine**：用户用手机摄像头扫描现实物体，AI 把它变成游戏里的角色、武器、副本，并打通现有 Agent 经济系统。
>
> 与 v4 共存，**v4 仍为现行落地基线**，v5 描述 World Engine 上线后的最终形态。

- 版本: v5.0（与 v4 共存，v4 文件保留为对照）
- 状态: Draft — World Engine Phase 1 已落地，等待生产 secrets + 1% cohort 灰度
- 落地顺序: 后端 ✅ → Mobile UI ✅ → 灰度 → V5 PRD 全平台扩展
- 上游: `agentrix-cross-platform-prd-v4.md` + `.kiro/specs/reality-ai-world-engine/`

---

## 0. v5 vs v4 对照速读

| 维度 | v4 | v5 |
|------|-----|-----|
| 端数量 | 6（Web/Desktop/Mobile/Watch/Glass/Toy） | 6（不变） |
| Living Pet 模型 | 灵魂 × 皮肤 双层 | **灵魂 × 皮肤 × 世界资产** 三层 |
| 宠物来源 | PetCreator 文生/图生/繁殖 | **+ World Engine 摄像头扫描真实物体** |
| AI 生成内容类型 | 仅 .glb/.vrm 宠物模型 | **+ 角色（含 stats/skills/behavior）+ 副本地图 + 武器** |
| 战斗系统 | 不存在（仅 Pet 状态值） | **确定性 Battle Engine**（Mulberry32 PRNG + 20 回合） |
| 副本系统 | 不存在 | **Dungeon Builder**（房间扫描 → 主题副本，6-12 位分享码） |
| Agent 绑定对象 | OpenClaw Agent | **+ World Asset Agent**（共享 maxAgents 配额） |
| Marketplace 商品 | 皮肤 / NFC 卡牌 | **+ World Asset NFT**（两阶段提交 + 乐观锁） |
| 分享对象 | 皮肤 / Pet | **+ 角色卡片 + 战斗 replay + 副本邀请** |
| 主路径 | 7 大（v4 的 5+Pet Creation+Skin Marketplace） | **8 大**（+ **World Engine** 主路径） |
| 经济 GMV | 皮肤 30% 抽成 | **+ World Asset 二次销售 30% 抽成 + 战斗投注（Phase 2）** |

**未变内容**（v5 直接引用 v4，不重写）：
- §6 系统 AI 助手共生战略
- §7 数据 / 通信 / 同步契约
- §8 安全模型（Trust 等级）
- §9 Agent 经济基础合约（AgentAccount 仍是单一钱包）

---

## 1. 一句话定位（v5 升级）

**Agentrix v5 是一个把现实世界数字化进游戏的 AI 操作系统**：用手机摄像头扫描现实物品 → AI 把它变成会战斗、有性格、能交易的游戏角色 → 跟你的 Agent 一起在你的房间生成的副本里冒险 → 把战利品挂到 Marketplace。

v4 的"AI 宠物操作系统"叙事仍然成立，v5 在此之上增加"现实数字化入口"维度。

---

## 2. 三层愿景升级（v5 增量）

| 层 | v4 | v5 增量 |
|----|-----|---------|
| Living Agent（灵魂） | 28 签名灵魂 + 用户共创皮肤 | **+ 用户共创角色**（拍现实生成，每个都有独特 stats/skills/personality/backstory） |
| Doer（Working Agents） | OpenClaw Agent | **+ World Asset Agent**（共享 workspace.maxAgents 配额，与 OpenClaw Agent 等价槽位） |
| Economy | AgentAccount + Skin GMV 30% | **+ World Asset 一级销售（仅原创者）+ 二级销售 30%** |

---

## 3. 6 端职责矩阵（v5 修订）

| 维度 | Web | Desktop | Mobile | Watch | Glass | Toy |
|------|-----|---------|--------|-------|-------|-----|
| **World Engine 入口** | 浏览 share preview | 浏览资产 + 高分辨率 3D 查看（V5.1） | **完整**（扫描 + 库存 + 战斗 + 副本 + 分享）| × | 视觉识别物体推荐扫描（V5.2） | × |
| **扫描** | × | × | ✅ Quick/Detail/Room | × | × | × |
| **3D 查看器** | OBJ/GLB embed | High-res Three.js | React Three Fiber + 缩略图 | × | HUD 简化预览 | × |
| **战斗 UI** | × | Replay 高清查看 | 完整动画战斗 | × | × | × |
| **副本** | × | × | 完整 fog-of-war | × | × | × |
| **分享** | Web fallback page | × | 一键分享到 4 平台 | × | × | × |
| **审核入口** | Admin dashboard（cost + go-live） | × | × | × | × | × |

### 3.1 Mobile 是 World Engine 主战场
- 扫描器（唯一）
- 库存（唯一）
- 战斗 UI（唯一动画体验）
- 副本探索（唯一）
- 分享发起（唯一）
- 首次免责声明确认（合规必须，唯一）

### 3.2 Desktop / Web 的辅助角色
- **Web**：分享 fallback 页面（用户无 app 时的 social preview）
- **Desktop**：未来 V5.1 — 创作者高分辨率管理后台
- **Admin Web**：成本仪表盘 + go-live 仪表盘

### 3.3 Watch / Glass / Toy 暂不参与
- 这是 mobile-first 体验，wearable 端无需介入

---

## 4. 8 大主路径（v5）

v4 的 7 大路径完全保留，新增第 8 路径：

### 4.8 World Engine 主路径（NEW）

**路径**: 用户拍现实物体 → 后端生成 3D + AI 角色 → 绑定到 Agent → 战斗 / 副本 / 分享 / 上架

```
[Mobile Scan] →30s→ [Reconstruction Engine 双轨] →15s→ [AI Interpreter] →15s→ [Character Generator]
                                                                               ↓
[Battle Arena] ← [Agent Binding (XP+技能)] ← [Style Renderer] ← [Quality Gate L1/L2/L3]
       ↓
[Share Card / Marketplace Listing / Dungeon Build]
```

#### 关键 SLA
- Quick Scan 端到端: **15-30 秒**
- Detail Scan 端到端: **60-90 秒**
- 战斗模拟: **<2 秒**（确定性，不需 LLM）
- 分享卡片生成: **5 秒** | 战斗 replay 视频: **10 秒**

#### Trust 等级
- 扫描提交: Trust 0（任何人）
- World Asset 创建: Trust 0（落库）
- Agent 绑定: Trust 1（消耗 maxAgents 配额）
- 战斗发起: Trust 0
- Marketplace 上架: Trust 1
- Marketplace 购买: **Trust 3**（Mobile 签名，与现有钱包 flow 一致）

---

## 5. 经济模型升级

### 5.1 World Asset 抽成
| 交易类型 | 抽成 | 备注 |
|----------|------|------|
| 一级销售（原创者首次出售）| 5% | 鼓励创作 |
| 二级销售（再次转手）| 30% | 与 Skin Marketplace 一致 |
| 跨用户赠送 | 0% | 不限制 |
| 战斗投注（V5.2 Phase 2）| 10% | 大概念，待 PM 决策 |

### 5.2 配额经济
| Tier | Quick Scan/天 | Detail Scan/天 | Room Scan/天 | Character 重生/天 |
|------|---------------|----------------|--------------|-------------------|
| FREE | 5 | 1 | 1 | 10 |
| PRO | 30 | 5 | 3 | 50 |
| BUSINESS+ | 100 | 20 | 10 | 200 |

**额外配额可用 AXP 购买**（30 天有效期，FIFO 消耗）：
- 1 Quick Scan = 10 AXP
- 1 Detail Scan = 50 AXP
- 1 Dungeon = 30 AXP
- 1 Replay Video = 5 AXP

### 5.3 月度成本上限
- FREE 用户：$5 USD/月（80% 软提醒，100% 硬阻断）
- PRO+ 用户：无上限（按订阅档计费）

---

## 6. 内容审核（v5 全平台一致）

5 阶段管线（与 v4 Skin 审核独立但可复用）：

1. **pre_upload_face**（mobile MLKit on-device，>5% 面积拒绝）
2. **pre_upload_copyright**（后端关键词，Disney/Marvel/Pokémon/Nintendo/Sanrio）
3. **post_gen_words**（角色名/技能/背景的违禁词过滤）
4. **pre_listing**（Marketplace 上架前自动审核）
5. **post_publish_report**（用户举报 → 48h SLA）

**cn-region 增量**：在阶段 2 和 4 上叠加 baidu/aliyun 审核 + 合规审计日志（12 个月留存）。

---

## 7. v5 端侧功能矩阵

| 功能 | Web | Desktop | Mobile | Watch | Glass | Toy |
|------|-----|---------|--------|-------|-------|-----|
| 扫描真实物体 | × | × | ✅ | × | × | × |
| 3D 模型生成 | 后端调用 | 后端调用 | 后端调用 | × | × | × |
| AI 角色属性 | × | × | ✅ 详情 | × | × | × |
| 房间副本 | × | × | ✅ | × | × | × |
| 战斗系统 | × | Replay | ✅ 完整动画 | 通知 | × | × |
| Agent 绑定 | × | × | ✅ | × | × | × |
| Marketplace 浏览 | ✅ | ✅ | ✅ | × | × | × |
| Marketplace 购买 | × | × | ✅（签名）| × | × | × |
| 分享发起 | × | × | ✅ | × | × | × |
| Web fallback 预览 | ✅（自动）| × | × | × | × | × |
| 首次免责声明 | × | × | ✅ | × | × | × |
| Admin 成本仪表盘 | ✅ | × | × | × | × | × |
| Admin go-live 仪表盘 | ✅ | × | × | × | × | × |

---

## 8. 数据模型增量（v5）

新增 5 张表（与 v4 Pet 表独立）：
- `world_assets` — 核心资产实体
- `battles` — 战斗记录
- `dungeons` — 副本（含 share_code 唯一索引）
- `scan_sessions` — 扫描会话
- `world_asset_moderation_decisions` — 审核审计

**关键约束**：
- `world_assets.version` 是 `@VersionColumn`，用于两阶段提交的乐观锁
- `dungeons.share_code` 6-12 位字母数字，30 天有效期
- `world_asset_moderation_decisions` 12 个月留存（cron 清理）

---

## 9. 技术决策记录

| 决策 | 选项 | 选择 | 理由 |
|------|------|------|------|
| 3D Provider | 自建 GPU vs Hunyuan3D vs Meshy | **Hunyuan3D 主 + Meshy 备份** | Phase 1 不自建 GPU，Hunyuan3D 已在生产使用 |
| 战斗 PRNG | Math.random vs Mulberry32 | **Mulberry32** | 确定性可重放（Property 1） |
| 配额存储 | Redis vs PostgreSQL | **Phase 1 in-memory，Phase 2 Redis** | 1% cohort 不需要分布式存储 |
| 移动 3D 渲染 | React Three Fiber vs VRM Viewer | **R3F + 静态缩略图** | 设计 §8：库存网格用预渲染 PNG/GIF，详情才用 R3F |
| 风格渲染 | Blender Python vs metadata-driven | **Phase 1 metadata-driven** | 客户端渲染，Phase 2 Blender 管线 |
| 分享视频 | FFmpeg server vs client | **Phase 1 placeholder** | 设计 §10：Phase 2 真实 FFmpeg |

---

## 10. 后续路线图

### V5.1（Q3 2026）
- Desktop 高分辨率 World Asset 浏览器
- Style Renderer 真实 Blender 管线
- GPU fallback pool（Lambda Labs / RunPod）
- 战斗 replay 实际 FFmpeg 渲染

### V5.2（Q4 2026）
- Glass 视觉识别 → 推荐扫描
- 跨用户战斗匹配（不仅是好友异步挑战）
- 战斗投注经济（10% 抽成）
- Manual review dashboard 前端

### V6（2027）
- AR 副本叠加现实（手机看见自己房间里的怪物）
- 多人副本（4 人协作）
- Web3 NFT 桥接（World Asset on-chain）

---

## 11. v5 文档清单

| 文件 | 状态 | 说明 |
|------|------|------|
| `agentrix-cross-platform-prd-v5.md` | ✅ 本文档 | 跨端总览 |
| `mobile-prd-v5.md` | 待创建 | Mobile World Engine 详细规格 |
| `web-prd-v5.md` | 待创建（仅 admin 仪表盘）| Web Console |
| `desktop-prd-v5.md` | V5.1 创建 | Desktop World Asset 浏览器 |
| `wearable-prd-v5.md` | 不需要 | Wearable 不参与 World Engine |
| `toy-prd-v5.md` | 不需要 | Toy 不参与 World Engine |

---

**v5 sign-off**: 待 World Engine 1% cohort 灰度后，PM 签字升级 v5 → "Active"。


---

## 2026-05-24 双人群对齐补丁

> 触发:`.kiro/specs/positioning-revision-2026-05/`(commit `f93365552`)
> 主决策文档:`docs/agentrix-positioning-2026-05.zh-CN.md`(2026-05-24 修订版)

**SSOT 声明**:本 PRD 的所有用户画像 / 商业模型 / 路线图条款,**以
`docs/agentrix-positioning-2026-05.zh-CN.md` (2026-05-24 修订版) 为准**。
任何与该主文档冲突的具体段落,本次**不重写正文**,仅在此处登记 follow-up。

### 已知需要回看的段落(follow-up TODO)

| 段落主题 | 当前状态 | follow-up |
|---------|---------|-----------|
| 用户画像章节 | 仅强调"非编程优先",没有 U5 程序员显式入位 | TODO: 重写,加入 U5 占比 ≥ 15%、Coding_Plan_Revenue 商业基本盘说明 |
| 商业模型章节 | 未明确写"Unified_Agent_Plan 单一订阅" | TODO: 加入 Unified_Agent_Plan + 否定独立 Coding Plan SKU |
| 路线图章节 | 未列入 P3 sprint 的 VS Code / Cursor 扩展 + IdeBridge 完整化 | TODO: 在 v5 路线图末尾追加 P3 (2026-08+) |
| Pro Mode 跨端契约 | 未声明 Pro Mode 仅桌面端暴露,移动端不暴露 | TODO: 加入"Pro Mode = 桌面专属;移动端保持 Simple/Standard 等价"约束 |

### 本次不做

- 不重写本 PRD 的任何既有正文(避免与正在进行的 sprint 冲突)
- 不修改 `desktop-prd-v5.md` / `mobile-prd-v5.md` / `wearable-prd-v5.md` /
  `toy-prd-v5.md` / `web-prd-v5.md` 的实质内容(各自有独立的对齐补丁)

### 对应 spec

`.kiro/specs/positioning-revision-2026-05/{requirements.md, tasks.md}`
`.kiro/specs/pro-mode-coding-views-2026-05/{requirements.md, tasks.md}`(本次 sprint)
