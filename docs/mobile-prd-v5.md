# Agentrix 移动端 PRD v5.0（Mobile · World Engine 主战场）

> **移动端 v5 = v4 三形态 + World Engine 现实数字化入口**：扫描真实物体 → 生成 AI 角色 → 战斗 / 副本 / 分享 / 上架。本文件只写 Mobile World Engine 增量，跨端契约见 `agentrix-cross-platform-prd-v5.md`。

- 版本: v5.0（与 v4 共存）
- 状态: Draft — Phase 1 已落地，等待 1% cohort 灰度
- 技术栈: React Native (Expo SDK 54) + 原生模块（expo-camera + expo-haptics + expo-notifications + MLKit Face Detector）
- 上游: `mobile-prd-v4.md` + `.kiro/specs/reality-ai-world-engine/`

---

## 1. v5 vs v4 对照速读

| 维度 | v4 | v5 |
|------|-----|-----|
| 形态 | 三形态（Home Console / Voice Quick / Pet Companion） | **不变** |
| Pet Tab 子页 | 9 个（含 NfcRedeem） | **+ 4 个**（WorldEngineScanner / WorldAssetInventory / WorldBattleArena / WorldDungeonExplorer） |
| 摄像头扫描 | V5 标记为"待实现" | ✅ **已实现**（Quick / Detail / Room 三模式） |
| 内置游戏循环 | 不存在 | ✅ **战斗 + 副本** |
| Marketplace 入口 | 仅皮肤 | **+ World Asset 列表/购买** |
| 分享深度链接 | `agentrix://pet/<id>` | **+ `agentrix://world-engine/{asset|battle|dungeon}/<id>`** |
| 推送通知 | 系统通知 | **+ 生成完成通知**（用户离开 app 时） |
| 设备能力检测 | 无 | ✅ **degraded mode**（2-4GB RAM / iOS 15 / Android 11） |

---

## 2. World Engine 在 Mobile 的位置

### 2.1 入口位置
| 入口 | 路径 | 默认可见 |
|------|------|---------|
| **Pet Hub 卡片"🌍 世界扫描"** | Pet Tab → 滚动到底部 | ✅ |
| **Pet Hub 卡片"🎒 世界资产"** | Pet Tab → 滚动到底部 | ✅ |
| **首次免责声明拦截弹窗** | 首次进入 Scanner 时 | ✅（待 V5 sprint 实现） |
| **战斗深度链接** | 收到分享链接打开 | 自动 |
| **副本分享码输入** | DungeonExplorer → 输入 6-12 位码 | ✅ |

### 2.2 路由注册（已落地）
```typescript
// PetStackNavigator.tsx
WorldEngineScanner: undefined;
WorldAssetInventory: undefined;
WorldBattleArena: { challengerAssetId?, defenderAssetId? };
WorldDungeonExplorer: { shareCode? };
```

### 2.3 与 PetCreator 的关系
- **PetCreator**（v4）: 文生 / 图生 / 双图融合 → 生成 .vrm 宠物皮肤
- **World Engine**（v5）: 摄像头扫描 → 生成 .glb 游戏角色（含 stats/skills）
- **共存关系**: 两者独立，但都消耗 `workspace.maxAgents`（绑定 Agent 时）

---

## 3. 三模式扫描详细规格

### 3.1 Quick Scan（快速扫描）
- **UI**: 中心虚线方框引导（200×200pt）
- **拍摄数**: 1-3 张
- **目标**: 单个物品（玩具、杯子、装饰品）
- **端到端**: 15-30 秒
- **后端管线**: Hunyuan3D 单图模式（imageUrl）

### 3.2 Detail Scan（精细扫描）
- **UI**: AR overlay + 8 位置环引导（绿/灰）
- **拍摄数**: 8 张（每个角度一张）
- **目标**: 复杂物品（手办、模型、艺术品）
- **端到端**: 60-90 秒
- **后端管线**: Hunyuan3D 多视角模式

### 3.3 Room Scan（房间扫描）
- **UI**: 360° 全景进度条
- **拍摄数**: 12 张
- **目标**: 整个房间（用于副本生成）
- **端到端**: 90-120 秒
- **后端管线**: 房间扫描 + Dungeon Builder

---

## 4. 三层 Quality Gate（已实现）

### 4.1 Layer 1 — 实时预览引导
| 指示器 | 阈值 | UI |
|--------|------|-----|
| 距离 | 15-50 cm | 距离过近/远警告 badge |
| 光线 | ≥50 lux | 橙色警告 overlay |
| 稳定 | <20% 运动模糊 | 暂停拍摄提示 |
| 遮挡 | <30% 手部覆盖 | "请移开手指"提示 |

**性能要求**: 全部检测 ≤2ms/帧（R10.9）

### 4.2 Layer 2 — 每帧评分
| 维度 | 范围 | 显示 |
|------|------|------|
| Sharpness（清晰度）| 0-100 | 颜色边框：绿≥70 / 黄 40-69 / 红<40 |
| Exposure（曝光）| 0-100 | 同上 |
| Angle Novelty（角度新颖度）| 0-100 | 同上 |

**反馈**: 
- 全部 >70 → 正向 haptic + 绿色对勾
- 任一 <40 → 重拍提示 + 具体原因

### 4.3 Layer 3 — 提交前预测
- **1-5 星评级**（基于 coverage / 平均 sharpness / 光线一致性 / 角度多样性）
- **<3 星时显示具体改进建议**（不阻塞提交）
- **始终允许 Generate**（用户知情决策）

---

## 5. 人脸检测拦截（合规）

### 5.1 On-device 检测（已实现）
- **库**: `expo-camera` + MLKit Face Detector（iOS Vision / Android ML Kit）
- **阈值**: 单帧任一人脸 >5% 面积 → 拒绝
- **性能**: <2ms/帧，每 200ms 检测一次
- **数据保留**: 被拒帧不上传，立即丢弃

### 5.2 警告 UI
- 顶部红色 overlay: "⚠️ 检测到人脸 — 不允许扫描人物"
- 拍摄按钮 disable
- Haptic warning feedback

### 5.3 中英文文案
```typescript
zh: { title: '检测到人脸', message: '不允许扫描人物。请仅扫描物品。已丢弃捕获的图像。' }
en: { title: 'Face Detected', message: 'People scanning is not allowed. Please scan objects only. The captured image has been discarded.' }
```

---

## 6. 库存（World Asset Inventory）

### 6.1 网格视图
- 2 列 FlatList，每张卡片显示：3D 缩略图 + 名称 + 等级 + 战绩
- 已绑定 Agent 的资产显示 🤖 角标

### 6.2 筛选与排序
| 维度 | 选项 |
|------|------|
| 类别 | 全部 / 角色 / 副本 / 武器 |
| 来源 | 全部 / 自扫描 / 已购买 / 礼物 |
| 排序 | 最新 / 等级 / 战斗数 |

### 6.3 长按上下文菜单
- 重命名（max 30 字符）
- 重新生成（消耗"重生"配额）
- 绑定/解绑 Agent
- 上架出售（仅原创者）
- 赠送（V5.1）
- 删除（active listing 时禁止）

### 6.4 空状态
- 大图标 🌍 + 引导文案 + "📷 开始扫描" CTA

---

## 7. 战斗 UI（World Battle Arena）

### 7.1 战斗发起
- 从库存选择 challenger
- 选择 defender（自己 / 好友 / 副本敌人）
- 异步挑战：72h 有效，分享链接邀请

### 7.2 战斗演出
- 左右双角色 + VS 中央
- HP 条动画（react-native Animated.timing）
- 伤害弹出（damage popup，Mulberry32 PRNG 后端确定性）
- 暴击 haptic Heavy / 普通 haptic Light

### 7.3 结果界面
- 胜利者大图 + XP 奖励
- "再战一次" + "返回" 双按钮
- 分享按钮 → 战斗 replay 视频

---

## 8. 副本探索（Dungeon Explorer）

### 8.1 入口
- 输入 6-12 位 share code
- 或 "📷 扫描房间生成副本" → 跳到 Scanner Room 模式

### 8.2 探索界面
- Fog of war 网格（探索过的房间高亮，未探索的灰色 ?）
- 当前房间高亮边框（紫色）
- 房间信息: 主题（🔥火焰 / 💫梦境 / 💻数据 / ⬜中性） + 敌人数 + Boss / Loot 标记

### 8.3 战斗触发
- 进入有敌人的房间 → 自动触发战斗
- 击败 boss → 解锁 loot

---

## 9. 分享与社交

### 9.1 一键分享目标
| 平台 | URL Scheme | Fallback |
|------|-----------|----------|
| WeChat | `weixin://dl/moments` | 系统分享 |
| Douyin | `snssdk1128://` | 系统分享 |
| Instagram | `instagram://library` | 系统分享 |
| Twitter | `twitter://post` | 系统分享 |
| 系统 | `Sharing.shareAsync()` | 剪贴板 |

### 9.2 分享卡片类型
- **Character Card**: 3s 1080×1080 GIF + 名称 + 前 3 属性
- **Battle Card**: 战斗回放缩略图 + 胜者
- **Dungeon Card**: 副本预览 + 难度 + 创建者

### 9.3 深度链接 schema
```
agentrix://world-engine/asset/{uuid}
agentrix://world-engine/battle/{uuid}
agentrix://world-engine/dungeon/{6-12 alphanumeric}
```

### 9.4 Web fallback
- 用户无 app 时 → `https://app.agentrix.io/world/{base64-token}`
- 后端返回带 og: 标签的 HTML preview
- 包含"下载 Agentrix"CTA

---

## 10. 配额与限流（用户可见）

### 10.1 配额状态查询
- API: `GET /api/v1/world-engine/quota/status`
- 返回: 4 种 daily quota 剩余 + monthly cost 状态

### 10.2 429 错误 UI
- 显示重置时间（UTC 午夜）
- 提供"购买额外配额"CTA → AXP 购买流程
- 软警告（80% 月成本）显示金币图标 + 警告文字

### 10.3 AXP 购买
- 流程: Quota Service → 扣 AXP → 30 天有效期
- 消耗顺序: 免费配额优先 → 已购买配额（FIFO by expiry）

---

## 11. 设备能力与降级模式

### 11.1 检测条件（worldEngineCache.ts）
```typescript
degradedMode = totalRamMb < 4096 || iOS<=15 || Android<=11
```

### 11.2 降级行为
- **正常**: AR overlay + R3F 详情视图
- **降级**: 静态扫描引导 + 2D 预览（无 3D 旋转）

---

## 12. 缓存策略

### 12.1 LRU 缓存（500MB）
- 路径: `expo-file-system cacheDirectory/world-engine-assets/`
- 索引: `index.json`（持久化）
- 类型: glb / gif / png
- 驱逐: 按 lastAccessedAt 最旧优先

### 12.2 进度轮询
- 间隔: 3 秒
- 全局超时: 3 分钟
- 用户离开 app: 触发推送通知

---

## 13. v5 落地清单

### ✅ 已完成
- [x] 4 屏幕实现 + 路由注册
- [x] 3 工具模块（faceDetection / worldEngineShare / worldEngineCache）
- [x] Pet Hub 入口卡片
- [x] 后端 API 全部就绪
- [x] 部署到生产（PM2 online）

### ⚠️ V5 sprint 头部必做（P0）
- [ ] **首次免责声明弹窗 UI**（合规阻塞）
- [ ] **质量门控 L2 可视化边框**（每帧评分颜色边框）
- [ ] **API 接入真实 backend**（当前 4 屏部分仍用 mock 数据）
- [ ] **完整 E2E 冒烟测试**（scan→generate→bind→battle→share→list→purchase）

### 🔜 V5.1 跟进（P1）
- [ ] 战斗 replay 实际 FFmpeg 视频
- [ ] 分享卡片 GIF 实际渲染
- [ ] 赠送流程
- [ ] 战斗投注 UI（V5.2）

---

## 14. 与 v4 的关系

- **代码共存**: 4 个新屏不影响现有 Pet 屏
- **数据库独立**: 5 张 world_engine 表不与 living_pets / family_pets 共享
- **配额共享**: Agent 绑定时 OpenClaw + Pet + World Asset 三类共享 maxAgents
- **路由共存**: 都在 PetStackNavigator 下，不冲突
- **Marketplace 共存**: `/api/v1/marketplace/world-assets` 子路由独立

**v5 不会破坏 v4 任何已有功能。**

---

**v5 sign-off**: 待 World Engine 1% cohort 灰度成功后，PM 签字。


---

## 2026-05-24 双人群对齐补丁

> 触发:`.kiro/specs/positioning-revision-2026-05/`(commit `f93365552`)
> 主决策文档:`docs/agentrix-positioning-2026-05.zh-CN.md`(2026-05-24 修订版)

**SSOT 声明**:本 PRD 的所有用户画像 / Mode 行为 / push 通知逻辑,**以
`docs/agentrix-positioning-2026-05.zh-CN.md` (2026-05-24 修订版) 为准**。
任何与该主文档冲突的具体段落,本次**不重写正文**,仅在此处登记 follow-up。

### 移动端在双人群定位中的承诺

- **移动端不暴露 Pro Mode coding 视图**——raw diff / Open in IDE / `@symbol`
  mention 是桌面专属,移动端继续以 Simple / Standard 为限。
- 移动端**保持跨端任务镜像**——桌面 Pro Mode 用户在长任务后台运行时,
  移动端 push 推送任务状态,但 push 文案**用人话不用 raw diff**。
- 移动端**不引入独立的"程序员视图"**——移动端的目标是"在路上看进度 /
  审批 / 接力",不是"在路上写代码"。

### 已知需要回看的段落(follow-up TODO)

| 段落主题 | 当前状态 | follow-up |
|---------|---------|-----------|
| 用户画像 | 仅强调"非编程友好" | TODO: 加入 U5 程序员的"移动端只用于跨端接力"角色定义 |
| Push 通知 | 通用文案 | TODO: 区分 Coding 类任务(Pro Mode 用户) vs 创作类任务(Simple Mode 用户)的 push 文案模板 |
| 跨端契约 | 未与新 positioning §3.3 段位机制对齐 | TODO: 加入 "桌面 Pro Mode 状态 → 移动端用 standard 等价 UI 呈现" 的契约 |
| 共养 / 贺卡 / 裂变 | 与新定位无冲突,继续保持 | 无需更新 |

### 本次不做

- 不修改任何已有 mobile screen / component / e2e flow
- 不引入移动端的 Pro Mode 入口(违背"移动端不暴露 coding 视图")
- 不修改 push 通知 backend 模板(等 follow-up TODO 立项)

### 对应 spec

`.kiro/specs/positioning-revision-2026-05/{requirements.md, tasks.md}`
`.kiro/specs/pro-mode-coding-views-2026-05/{requirements.md, tasks.md}`(本次 sprint)
