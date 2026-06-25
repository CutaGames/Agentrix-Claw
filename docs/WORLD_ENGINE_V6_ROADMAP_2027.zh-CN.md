# World Engine V6 路线图（2027）

> **本文档定义 2027 年 World Engine 的战略方向。** P3 项目，落地时间不早于 V5 全量发布后 3 个月。

---

## 0. 三个核心叙事升级

| V5（2026） | V6（2027） |
|------------|------------|
| 用手机扫现实物体 → 生成游戏角色 | **手机摄像头叠加 AR 副本，看见现实房间里的怪物** |
| 异步好友挑战（72h 链接） | **多人实时副本（4 人协作通关）** |
| 资产仅在 Marketplace 二级销售 | **可选 Web3 NFT 桥接**（用户主动选择是否上链） |

V6 不替换 V5，三条新增路径**并行运行**于 v5 体验之上。

---

## 1. AR 副本叠加现实

### 1.1 用户故事
> "我把手机相机对准客厅，APP 把我之前扫的乐高块变成了 BOSS 站在沙发上。"

### 1.2 技术路径
| 层 | iOS | Android |
|----|-----|---------|
| AR SDK | ARKit 6 (LiDAR + scene reconstruction) | ARCore 1.40+ (Geospatial API + Depth API) |
| 房间识别 | 重用 V5 Room Scan 的 layout + Pose 锚点 | 同上 |
| 怪物渲染 | Reality Composer Pro / SceneKit | Sceneform-EQR / Filament |
| 性能预算 | 60 FPS @ 1920×1080，全屏 AR 模式 | 30+ FPS @ 1080p（min-spec） |

### 1.3 设计前置条件
- V5 Room Scan 必须先生成稳定的 `RoomLayout` 数据（含 walls / floor / furniture 锚点）
- ARKit/ARCore 的世界坐标 ↔ V5 layout 坐标转换矩阵需要一次性校准
- 怪物 .glb 必须 < 2MB（移动端 AR 渲染预算）

### 1.4 风险
- iOS 设备 LiDAR 仅高端机型有（iPhone 12 Pro+）— 非 LiDAR 设备需降级到普通 ARKit world tracking
- ARCore Depth API 在低端 Android 设备上不可靠 — 需要 fallback 到 Plane Detection
- 用户隐私：AR 摄像头可能拍到他人面部 — 必须保留 V5 的 5% 面积人脸检测拦截

---

## 2. 多人实时副本（4 人协作）

### 2.1 用户故事
> "我和 3 个朋友同时进入我的厨房副本，一起打火焰房间的 BOSS。"

### 2.2 技术路径
| 组件 | 选型 |
|------|------|
| 实时网络 | WebSocket（已有 OpenClaw Gateway 扩展） + UDP fallback for state diffs |
| 状态同步 | Server-authoritative（已有 Battle Engine 确定性结果可用作 anti-cheat 参考） |
| 房间分配 | Redis pubsub channel `dungeon:{shareCode}` |
| 队伍上限 | 4 人（避免 N² 状态广播开销） |

### 2.3 多人战斗规则
- 4 人 vs 1 BOSS：每人独立行动，BOSS HP 池缩放（×3 而非 ×4，鼓励合作）
- PvE 副本：所有玩家共享 loot 池
- PvP 房间（V6.1，可选）：2v2 队战，沿用 Mulberry32 PRNG（玩家共同 seed）

### 2.4 经济
- 多人副本通关战利品分配：贡献度排序（dmg dealt + heal done + dmg taken）
- BOSS 击杀奖励：4 人各得一份（XP + 一个 loot 物品）

### 2.5 反作弊
- Server-authoritative：客户端只发送"意图"（move、attack），服务器解算后果
- 可选：用 V5 的 Battle Engine PRNG 作为校验源 — 任何客户端"自作主张"的状态变更被拒绝

---

## 3. Web3 NFT 桥接（可选）

### 3.1 设计原则
- **用户主动选择**：默认所有 World Asset 是 off-chain（数据库行）
- **桥接是单向的**：链上 → 链下回退需要明确的"销毁链上 NFT"步骤
- **Agentrix 不强制**：不上链不影响游戏内体验

### 3.2 技术路径
| 层 | 选型 |
|----|------|
| 链 | Ethereum L2（Base / Arbitrum） + Solana（Phantom 用户群） |
| 桥接服务 | LayerZero / Wormhole 风格的 oracle |
| 元数据存储 | IPFS + Arweave 双备份（避免单点失败） |
| 钱包对接 | 现有 AgentAccount 钱包 + WalletConnect |

### 3.3 桥接流程
```
[用户在 Mobile 选择资产]
  ↓
[确认 gas 估算 (~$2-5 per NFT)]
  ↓
[平台调用桥接合约，写入链上 NFT]
  ↓
[Asset 标记为 "on_chain", ownerId 改为 wallet address]
  ↓
[OffChain → OnChain marketplace 自动联动]
```

### 3.4 法律 / 合规
- **不在大陆地区开放** — 仅美国、新加坡、欧盟
- **KYC 要求**：用户必须完成实名（已通过 AgentAccount 完成）
- **税务**：NFT 销售按用户所在地税法处理（平台不代扣）

---

## 4. Glass 视觉识别推荐扫描

### 4.1 用户故事
> "我戴着 Agentrix Glass，看到桌上的乐高，HUD 弹出'要扫描这个吗？'"

### 4.2 技术路径
- Glass 端：on-device CV 识别物体（YOLO-v8n 量化版本，~5MB）
- 识别结果通过 BLE 发送到 Mobile 触发扫描
- 不在 Glass 端做扫描（功耗 + 散热问题）

### 4.3 V6 不做的事
- 不在 Glass 端直接生成 3D（仍然依赖 Mobile + 后端管线）
- 不做 Glass 端的战斗 UI（HUD 仅展示通知，操作仍在 Mobile）

---

## 5. 时间线

| 季度 | 里程碑 |
|------|--------|
| Q1 2027 | V5 全量发布稳定（前提条件） |
| Q2 2027 | AR 副本 alpha（仅 LiDAR 设备） |
| Q3 2027 | 多人副本 beta（仅好友模式） |
| Q4 2027 | NFT 桥接（仅美区，需法务审批） |
| 2028+ | Glass 视觉推荐 |

---

## 6. 关键决策点（PM 需在 2026Q4 之前确认）

- [ ] **NFT 桥接是否在 V6 范围内？** 法务/合规风险大，可推迟到 V7
- [ ] **多人副本的反作弊投入预算？** 服务端 authoritative 需要 Battle Engine 重构
- [ ] **AR 副本的最低支持设备？** 仅 LiDAR (iPhone 12 Pro+) vs 全 ARKit/ARCore 设备

---

## 7. 引用

- `docs/agentrix-cross-platform-prd-v5.md` — V5 跨端 PRD
- `docs/WORLD_ENGINE_AUDIT_2026-05-20.zh-CN.md` — V5 落地审计
- `.kiro/specs/reality-ai-world-engine/` — 完整 spec
