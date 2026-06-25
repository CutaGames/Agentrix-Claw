# Agentrix 跨端产品 PRD v4.0（顿领 · 唯一权威）

> **一只灵魂 + 一副皮肤，跟随用户横穿 6 个屏幕 + N 件硬件。**
>
> 本文件是 Agentrix 跨端体验 V4 版本的单一事实源，**与 V3 共存**（`agentrix-cross-platform-prd-v3.md` 仍为现行落地基线）。V4 在 V3 基础上引入：
>
> 1. **第 6 端 Toy**（玩偶 / 潮玩 / 联名硬件），把 Living Pet 从屏幕带进物理世界
> 2. **「灵魂 × 皮肤」双层架构**，把 V3 的「主宠 = 单一灵魂」升级为「灵魂模板 + 皮肤资产」可独立演进
> 3. **6 族群 × 28 签名宠物**，把单一 Living Pet 扩展为覆盖全人群的灵魂模板库（详见 `PRD_PET_6_CLANS_PERSONA.zh-CN.md`）
> 4. **PetCreator 主路径化**：文生 / 图生 / 摄像头扫描 / 双图融合繁殖，宠物从平台预设变成用户共创资产
> 5. **5 种硬件接入方式**（NFC / BLE / ClawCore SDK / Wi-Fi / 厂商 App SDK）+ **2 层硬件生态**（L2 联名 / L3 认证），Agentrix 不自研硬件
> 6. **Marketplace UGC 经济**：皮肤上架 / 拍卖 / 租赁 / Remix 二创分成
>
> 各端 PRD（`desktop-prd-v4.md` / `mobile-prd-v4.md` / `web-prd-v4.md` / `wearable-prd-v4.md` / `toy-prd-v4.md`）只写本端实现，**不重复跨端层**。

- 版本: v4.0（与 V3 共存，便于对照）
- 状态: Draft（融合自 `PRD_DESKTOP_PET_AGENTRIX_CLAW.zh-CN.md` v2.0 + `agentrix-cross-platform-prd-v3.md` v3.0）
- 落地顺序: 顿领 V4 → 桌面 V4 → 移动 V4 → Web V4 → 可穿戴 V4 → Toy V4
- 上游: V3 跨端 PRD、ClawBuddy 电子宠物 PRD v2.0、6 族群人格、跨端能力矩阵、阶段开发计划

---

## 0. V4 vs V3 对照速读

| 维度 | V3 | V4 |
|------|-----|-----|
| 端数量 | 5（Web / Desktop / Mobile / Watch / Glass） | **6**（+ **Toy**） |
| Living Pet 模型 | 1 user = 1 主宠（单层灵魂） | **灵魂 × 皮肤双层**：1 user 持多个皮肤，可挂载到 28 个签名灵魂模板 |
| 宠物来源 | 平台 6 表情默认形象 | **PetCreator 用户共创**（文生 / 图生 / 摄像头 / 繁殖）+ Marketplace |
| 表情数 | 6 基础（happy / focused / concerned / tired / excited / calm）+ 4 P3 扩展 | **10 个全量上线**（V3 的 6+4 全部 P0），并对齐 `LivingPetService` |
| 经济参与 | 主宠永不参与经济 | **皮肤可买卖 / Remix / 租赁**；灵魂不可让渡（避免 AgentAccount 被劫持） |
| 硬件 | 仅 Watch / Glass 已有 vendor profile | **5 种接入 + 2 层生态**（L2 联名 / L3 认证），新增 ClawCore SDK |
| 主路径 | 5 大（Handoff / Approval / Wallet / Vitals / Memory） | **7 大**（V3 的 5 + **Pet Creation** + **Skin Marketplace**） |
| 系统助手共生 | iOS Siri + Android Gemini + 国内四家 | 不变（V4 沿用 V3 §6） |
| 家庭账号 | P3 引入家庭宠 | V4 把家庭宠也纳入「灵魂 × 皮肤」框架，皮肤可全家共创 |

**未变内容**（V4 直接引用 V3，不重写）：

- §6 与系统 AI 助手共生战略（Brain over Hands）
- §7 数据 / 通信 / 同步契约（Realtime Topic、Presence、API 列表）
- §8 安全模型（Trust 等级、MPC 拓扑、生物认证、审计）
- §9 Agent 经济基础合约（AgentAccount、SplitPlan、Auto-Earn）的核心规则

---

## 1. 一句话定位 + 三层愿景升级

### 1.1 一句话定位（V4）

**Agentrix V4 是一个横穿 Web / 桌面 / 手机 / 手表 / 眼镜 / 玩具 6 端的 AI 宠物操作系统**：你可以一句话生成专属 3D 萌宠，把它住进任意硬件，让它替你工作、社交、赚钱。

V3 的「Living Pet 灵魂伙伴 + Working Agents 团队 + Web3 钱包」三层愿景在 V4 全部保留，只在每一层叠加新维度：

| V3 层 | V4 升级 |
|------|--------|
| Living Agent | **灵魂 × 皮肤解耦** + 28 签名灵魂模板 + 用户共创皮肤 |
| Doer | Working Agents 不变；新增 **Marketplace 上架自制 agent + skin 包** |
| Economy | AgentAccount + SplitPlan 不变；新增 **Skin GMV 30% 抽成 + Remix 分成 + ClawCore 认证费** |

### 1.2 为什么必须升级到 V4

1. **「单一主宠」叙事到达极限**：V3 已让用户感受到「灵魂伙伴」的情感价值，但 28 类目标人群（详见 6 族群文档）无法被单一形象覆盖。V4 用「灵魂模板 + 皮肤」既保留品牌资产一致性，又释放千人千面的 UGC 自由度。
2. **AI 生成 3D 内容已成熟**：Meshy / 腾讯混元 3D 在 2026 年已能在 30-90s 内产出可商用质量的 `.glb`，PetCreator 从「附属工具」升级为「主路径」是正确时机（实现细节已在 `backend/src/modules/pet-generation/` 落地）。
3. **硬件 IP 联名机会窗口**：潮玩 / 毛绒 / 智能音箱 / 学习机厂商急需 AI 卖点，Agentrix 用「不自研、只做协议+认证」的模式抢占跨厂商生态位。
4. **避免与 ChatGPT 全面正面战**：V3 在「全能助手」象限会被 OpenAI 顶死。V4 转向「电子宠物」叙事，跳出语言模型同质化竞争，重新定义品类。

---

## 2. 6 端职责矩阵（V4）

| 维度 | Web | Desktop | Mobile | Watch | Glass | **Toy（新）** |
|------|-----|---------|--------|-------|-------|----------|
| **核心定位** | Console + Marketing | 战场 + Living Agent | 钱包 + 嘴巴 + 主宠陪伴 | 手腕触点 + Vitals | 眼睛视觉 | **物理化身 + 触觉/听觉/位置触点** |
| **主宠表达** | 头像 + 状态徽 | SVG / Rive / VRM 三档 | SVG / Rive / VRM | 6 表情 emoji + 震动 | HUD 字符画 + 简短台词 | **eink/OLED 表情 + LED 心跳 + 震动 + TTS** |
| **PetCreator 入口** | 完整（文生 / 图生 / 双图融合） | 完整 | 完整 + **摄像头扫描**（V5） | × | × | × |
| **Skin Marketplace** | 完整（上架 / 购买 / Remix / 拍卖 / 租赁） | 浏览 + 购买 | 浏览 + 购买 + 装备 | 仅查看推荐 | × | 通过 Mobile/Desktop 切换皮肤 |
| **AgentAccount 钱包** | 完整报表 | AgentEconomyPanel | 钱包签名（唯一） | 当日数字 | HUD 微通知 | 显示余额 + 收益庆祝灯效 |
| **接入方式** | HTTPS | OS App | OS App | watchOS / Wear OS | Glass OS | **NFC / BLE / Wi-Fi / ClawCore SDK / 厂商 App SDK 5 选 1+** |
| **硬件层级** | – | – | – | L1 自有 | L1 自有 | **L2 联名 + L3 认证**（不自研） |
| **签名能力（Trust）** | 0 | 1-2 | **3（唯一）** | 1（仅 L1 审批） | 1 | 0（永远 read+触发，不签名） |
| **Push 主端** | – | 系统通知 | **主 Push** | 震动 | HUD | LED + 震动 + TTS |
| **离线能力** | 弱 | 强 | 中 | 弱 | 弱 | **中**（设备本地缓存最近 N 个表情 + 离线 LED 模式） |

### 2.1 6 端一句话分工（V4 修订）

- **Web = 看台 + 工坊**：跨端全景、Marketplace 主战场（创作者后台、Remix 树）、企业 / 开发者 / 家庭后台。
- **Desktop = 战场**：Pro Mode 编码 + Living Agent 陪伴 + PetCreator 重度创作（高分辨率渲染、批量繁殖）。
- **Mobile = 钱包 + 嘴巴 + 主宠摇篮**：签名、支付、语音、Push 主端、Pet Companion 默认开启、**摄像头扫描入口**。
- **Watch = 手腕**：心率、快速审批、亲密度大数字、6 表情 Living Tile。
- **Glass = 眼睛**：视觉捕获、HUD 微通知、Living Pet 视觉反馈、识别桌面玩具自动联动 Toy 端。
- **Toy（新）= 物理化身**：把同一只灵魂带进客厅、卧室、办公桌；NFC 碰触触发情绪、毛绒玩具拥抱反馈、智能音箱常驻陪伴。

### 2.2 Toy 不做的事（避免越界）

- Toy **不持** AgentAccount 私钥分片 — 永远只是另一个 surface
- Toy **不签名** L1+ 操作 — 一切签名仍回 Mobile
- Toy **不独立**渲染高保真 3D — 它通过协议反映灵魂状态，渲染面在 Mobile/Desktop
- Toy **不强求**屏幕 — 最低实现就是一颗 NFC + 一颗 LED + 一颗振动马达

---

## 3. Living Pet「灵魂 × 皮肤」双层架构（V4 核心升级）

### 3.1 架构总览

```
┌────────────────────────────────────────────────┐
│ 运行时（Runtime） — 6 端适配                     │
│ Web / Desktop / Mobile / Watch / Glass / Toy   │
│ 各端选择合适渲染器 + 适配交互硬件                 │
└──────────────────┬─────────────────────────────┘
                   │
   ┌───────────────┼───────────────┐
   │                               │
┌──▼──────────┐               ┌────▼─────────────┐
│ 皮肤层 Skin  │  mount/swap   │ 灵魂层 Soul       │
│  .vrm/.glb/ │◄─────────────►│ Agent 模板 +     │
│  .riv/.moc3 │               │ 人格 + 钱包       │
│  SVG fallback│              │ (AgentAccount)    │
│             │               │ 6 族群 28 签名    │
│  可买卖     │               │  不可让渡         │
│  可 Remix   │               │                  │
│  可租赁     │               │                  │
└─────────────┘               └──────────────────┘
```

### 3.2 灵魂层（Soul Layer · Agentrix 持有）

- **持久化**：扩展 V3 `LivingPet` 实体，新增 `soulTemplateId / activeSkinId / personality(可覆写)`
- **不可让渡**：每只灵魂绑定 `user_id` 与 1 个 `AgentAccount`，永远不能买卖（避免账户资产劫持）
- **28 签名模板**：6 族群（A 办公 / B 生活 / C 学习 / D 娱乐 / E Web3 / F 家庭）× ~5 个人物，详见 `PRD_PET_6_CLANS_PERSONA.zh-CN.md`
- **可切换**：用户可在任意时刻切换灵魂模板，亲密度、记忆、AgentAccount 余额无损继承（沿用 V3 §3.8 `switchPrimaryAgent` 契约）

```ts
// 扩展 V3 PetState
interface PetStateV4 extends PetState {
  soulTemplateId: SoulTemplateId;       // e.g. 'claw' / 'mochi' / 'whale'
  activeSkinId: string;                  // 用户拥有的某个皮肤
  ownedSkinIds: string[];                // 衣柜
  personalityOverrides?: Partial<Personality>;
  agentAccountId: string;                // 绑定的 AgentAccount
  clan: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
}
```

### 3.3 皮肤层（Skin Layer · 用户共创）

- **格式**：`.vrm`（首选）/ `.glb`（自动 rig 后转 `.vrm`）/ `.riv`（2D 动画）/ `.moc3`（Live2D，保留不主推）/ SVG fallback
- **来源**：PetCreator 文生 / 图生 / 摄像头扫描 / 双图融合繁殖、Marketplace 购买、第三方 VRoid 上传
- **可流通**：上架（一口价 / 拍卖 / 租赁）、Remix（二创，带分成）、赠送
- **审核**：CLIP NSFW + 反向图搜查重 + 人工复核 + DMCA 48h 响应（详见 `PRD_PET_MONETIZATION_QUOTA_MODEL.zh-CN.md`）

### 3.4 灵魂 × 皮肤运行时关系

| 操作 | 影响灵魂 | 影响皮肤 | 跨端广播 |
|------|---------|---------|---------|
| 切换签名灵魂模板 | ✅ 替换 systemPrompt + 默认工具白名单 | ✅ 切换默认外观（用户也可保留当前皮肤） | `pet.state.changed` + `pet.soul.switched` |
| 更换皮肤 | ❌ | ✅ 仅外观 | `pet.state.changed` + `pet.skin.changed` |
| 升级亲密度 | ✅ 灵魂级别保存 xp | ❌ | `pet.intimacy.gained` |
| 任务完成（赚钱） | ✅ AgentAccount +$ | ❌ | `wallet.tx.recorded` |
| 用户购买新皮肤 | ❌ | ✅ 加入 ownedSkins | `pet.skin.acquired` |
| 繁殖（双图融合） | 创建新 LivingPet（新灵魂 + 新皮肤） | 创建新 skin entity 继承父母特征 | `pet.bred` |

### 3.5 V3→V4 数据迁移

迁移脚本（V4 W1 落地）：

```
对每个 V3 LivingPet：
  1. 推断 clan：根据用户首次使用场景（编码 → A 办公；学习类 → C 学习；其他 → A 办公默认）
  2. soulTemplateId = clan 默认模板（A=Claw / B=Sprout / C=Pino / D=Goblin / E=Whale / F=Teddy）
  3. activeSkinId = 'default-svg-orb-v3'（V3 浮球作为内置皮肤保留）
  4. ownedSkinIds = ['default-svg-orb-v3']
  5. agentAccountId = 复用 V3 已绑定的 AgentAccount（迁移前已建则不动）
```

---

## 4. 6 端形态与身份系统（V4 增量）

### 4.1 用户设备图扩展（DeviceGraph V4）

V3 `UserDeviceGraph` 加 Toy 字段：

```ts
interface UserDeviceGraphV4 extends UserDeviceGraph {
  devices: DeviceV3 & {
    surface: 'web' | 'desktop' | 'mobile' | 'watch' | 'glass' | 'toy';
    toy_meta?: {
      claw_core_version?: string;       // ClawCore SDK 版本
      hardware_tier: 'L2' | 'L3';       // 联名 / 认证
      vendor: string;                   // 'agentrix-bandai' / '3rd-party-...'
      capability_flags: ToyCapabilityFlag[];
      pairing_method: 'nfc' | 'ble' | 'wifi' | 'sdk' | 'app';
    };
  }[];
}

type ToyCapabilityFlag =
  | 'screen_eink' | 'screen_oled' | 'led_rgb' | 'haptic' | 'tts'
  | 'mic' | 'touch_sensor' | 'pressure_sensor' | 'gyro' | 'nfc_writer';
```

### 4.2 Trust 等级（不变）

V4 沿用 V3 §4.3 的 4 级 Trust。Toy 始终位于 Trust 0-1 区间（永远不持 MPC share，永远不签名）。

### 4.3 多 Toy 设备策略

- 同一用户允许 N 个 Toy 设备（无上限）
- 同一时刻只有 1 个 Toy 设备处于 `active_secondary_surface`（最靠近用户的那个，由 RSSI / NFC tap 推断）
- 多 Toy 同步：所有 Toy 都收到 `pet.state` 广播，但只有 active 的执行强反馈（震动 + TTS），其余仅 LED

---

## 5. 跨端 7 大主路径（V4 = V3 5 路径 + 2 新增）

### 5.1 ~ 5.5 V3 五大路径

V3 的 Handoff / Approval / Wallet / Vitals / Memory 全部保留，仅在端列表里加入 Toy（Toy 仅作为 Approval 的 read-only 通知接收方、Vitals 的可选源、Memory 的零参与）。**详细契约引用 `agentrix-cross-platform-prd-v3.md` §5.1-5.5**。

V4 在审批路由（V3 §5.2）的 Toy 端追加：

| 风险级 | Toy 行为 |
|:---:|---------|
| L0 | 无感 |
| L1 | LED 蓝色慢闪 + 短震动；用户在 Toy 上**触摸传感器** = 等同 Watch tap 通过；其余必须回手机 |
| L2 | LED 红色快闪 + TTS「主人去手机看一下吧」 — 不可在 Toy 上完成 |
| L3 | 同 L2，并保持闪烁直到主人手机端处理 |

### 5.6 主路径 6（新增）：Pet Creation Flow（PetCreator 跨端）

#### 5.6.1 流程

```
用户输入（任意端）：
  - Web/Desktop/Mobile：文字 prompt 或上传图片
  - Mobile：摄像头扫描真实物体（V5）
  - 任意端：选择 2 张参考图繁殖
        ↓
后端 pet-generation.service：
  - 鉴权 + 配额检查（Free 3/月 / Pro 30 / Pro+ 无限）
  - prompt 关键词审核 + CLIP NSFW
  - 调 Provider（Meshy / 腾讯云 AI3D Hunyuan3D）
  - 异步轮询（@Interval 20s）
  - 生成完成 → 自动 rig（UniRig / Blender headless）→ 输出 .vrm
        ↓
跨端广播 pet.skin.generated：
  - 通知所有在线端预热 .vrm CDN
  - Mobile / Desktop 弹出"装备这只新皮肤?"卡片
        ↓
用户选择灵魂模板（首次创建时）：
  - 弹出 6 族群选择器
  - 默认推荐：根据 prompt 语义（"商务"→A / "学习"→C / "可爱"→B）
        ↓
绑定灵魂 + 装备皮肤 → 跨端切换 → 完成
```

#### 5.6.2 数据契约

```ts
interface PetCreationRequest {
  user_id: string;
  origin_surface: '...';
  mode: 'text' | 'image' | 'camera_scan' | 'breed';
  inputs: {
    prompt?: string;
    imageUrls?: string[];           // breed 模式 = [parentA_skin, parentB_skin]
    cameraScanFrames?: string[];    // base64 或 cdn url 列表
  };
  provider: 'meshy' | 'hunyuan3d';
  resultFormat: 'GLB' | 'OBJ' | 'STL' | 'USDZ' | 'FBX';
  enablePBR: boolean;
  options?: {
    targetClan?: 'A'|'B'|'C'|'D'|'E'|'F';
    targetSoulTemplateId?: string;
    parentSkinIds?: [string, string];
  };
}
```

#### 5.6.3 跨端 UX 一致性

| 端 | PetCreator UI | 进度可见性 | 完成后 |
|----|--------------|----------|-------|
| Mobile | 全屏 PetCreatorScreen + 摄像头模式 | 进度条 + 推送通知 | "✨ 设为我的萌宠" 全屏 modal |
| Desktop | PetCreatorPanel（已上线，详见现有 `desktop/src/components/PetCreatorPanel.tsx`） | 桌面 timeline + 浮球小角标 | 浮球切换动画 + 系统通知 |
| Web | `/console/pet-creator` 完整工坊 | WebSocket 实时进度 | toast + 跳转衣柜 |
| Watch | 不发起，仅通知 | – | 表盘 emoji 切换 |
| Glass | 不发起，仅 HUD 通知 | – | – |
| Toy | 不发起；新皮肤完成后 LED 庆祝灯效 | – | LED 彩虹 1 次 |

### 5.7 主路径 7（新增）：Skin Marketplace Flow（皮肤交易跨端）

#### 5.7.1 三种交易形态

| 形态 | 卖家 | 买家 | 平台抽成 | 二创分成 |
|------|------|------|---------|---------|
| 一口价 | 任意 Pro / Pro+ 用户 | 任意用户 | 30% | 原作者按 r ∈ [10%-50%] 设置 |
| 拍卖 | 同上 | 同上 | 30% | 同上 |
| 租赁（按月） | 同上 | 同上 | 30% / 月 | 同上 / 月 |

#### 5.7.2 跨端契约

| 端 | Marketplace 角色 |
|----|----------------|
| Web | **主战场**：完整 Marketplace（浏览 / 上架 / 购买 / Remix 树 / 拍卖 / 创作者后台 / 排行榜） |
| Mobile | 浏览 / 购买 / 装备；上架精简版（只支持已生成皮肤） |
| Desktop | 浏览 / 购买 / 上架（含 .vrm 编辑器入口）/ 装备 |
| Watch | 仅查看「今日推荐」+ 一键装备 |
| Glass | 不参与 |
| Toy | 不参与（皮肤切换由 Mobile/Desktop 推送） |

#### 5.7.3 Remix 链式分成

详见 `PRD_PET_MONETIZATION_QUOTA_MODEL.zh-CN.md`。链式上限 3 层祖先（A→B→C→D），D 之后归入版权金池。

#### 5.7.4 反盗版

- 反向图搜查重（CLIP embedding + perceptual hash）
- 链上凭证（可选 NFT 绑定，V5+）
- DMCA 48h 响应、假信号惩罚、版权金池托管争议资金

---

## 6. 与系统 AI 助手的共生战略

V4 完全沿用 V3 §6（Brain over Hands）。新增暴露给系统助手的 4 个能力：

| 能力 | App Intent | App Action | 风险等级 |
|------|-----------|-----------|---------|
| `create-pet(prompt)` | CreatePetIntent | CREATE_ITEM_LIST | L0-L1 |
| `switch-skin(skinId)` | SwitchSkinIntent | UPDATE_ITEM | L0 |
| `pet-mood-now()` | PetMoodIntent（V3 已有，扩展返回 skin/clan） | – | L0 |
| `marketplace-search(query)` | MarketSearchIntent | SEARCH_FOR | L0 |

---

## 7. 数据 / 通信 / 同步契约（V4 增量）

### 7.1 新增 Topic

| Topic | 发布方 | 订阅方 | QoS | 用途 |
|-------|--------|--------|-----|------|
| `user.{user_id}.pet.skin.changed` | 后端（PetCreator / Marketplace / 用户切换） | 所有端 | at-least-once | 皮肤切换 → 端预热 .vrm |
| `user.{user_id}.pet.soul.switched` | 后端 | 所有端 | at-least-once | 灵魂模板切换（亲密度无损） |
| `user.{user_id}.pet.gen.progress` | 后端 | 发起端 + Mobile（如不在发起端） | at-least-once | PetCreator 异步任务进度 |
| `user.{user_id}.skin.market.event` | 后端 | 卖家 + 买家 | at-least-once | 上架成功 / 售出 / Remix 分成入账 |
| `user.{user_id}.toy.{device_id}.event` | Toy 设备 / 后端 | 后端 / Mobile | at-least-once | NFC 碰触 / 拥抱传感器 / 电量 / OTA |

### 7.2 新增 API

| API | 方法 | 用途 |
|-----|------|------|
| `/api/v1/pet-generation/submit` | POST | PetCreator 提交（已上线） |
| `/api/v1/pet-generation/tasks` | GET | 列出用户任务（已上线，401 验证通过） |
| `/api/v1/pet-generation/tasks/:taskId` | GET | 单任务状态（已上线） |
| `/api/v1/pet/skins` | GET | 我的衣柜 |
| `/api/v1/pet/skins/equip` | POST | 装备某皮肤 |
| `/api/v1/pet/soul/switch` | POST | 切换灵魂模板 |
| `/api/v1/pet/skins/breed` | POST | 双图融合繁殖 |
| `/api/v1/marketplace/skins` | GET | 浏览皮肤 |
| `/api/v1/marketplace/skins/:id/buy` | POST | 购买（一口价 / 拍卖出价） |
| `/api/v1/marketplace/skins/:id/rent` | POST | 租赁 |
| `/api/v1/marketplace/skins/listing` | POST | 上架 |
| `/api/v1/clawcore/devices` | CRUD | Toy 设备管理 |
| `/api/v1/clawcore/pair` | POST | 配对（OOB challenge） |
| `/api/v1/clawcore/ota/check` | GET | 固件 OTA 检查 |

### 7.3 ClawCore Wire Protocol（v0 草案，详见 §10）

```
传输层：BLE GATT (Nordic UART Service 128-bit UUID) | Wi-Fi TCP + MQTT/TLS
帧格式（JSON-line）：
  { "v": 1, "ts": <unix ms>, "type": "<type>", "payload": <obj>, "sig": <hmac> }

核心 type：
  hello / auth          配对握手
  pet.state.sync        后端 → Toy 推送主宠状态（emotion / intimacy）
  pet.interaction       Toy → 后端 上报交互（nfc_touch / hug / wrist_tap）
  pet.approval.notify   后端 → Toy 显示审批红点
  ota.chunk             OTA 分片
  vitals.report         Toy 上报健康信号（如戒指）
```

---

## 8. 安全模型（V4 增量）

V4 完全沿用 V3 §8。新增 Toy 安全条款：

### 8.1 Toy 不持 MPC share（绝对约束）

- Toy 配对时只交换 device_id + 公钥（NRP secp256r1），永远不获取 wallet share
- Toy 上报的 `pet.interaction` 事件不可触发 L2+ 操作（即使物理触摸也只能产生亲密度 +xp）

### 8.2 OOB 配对（Out-of-Band）

防中间人：

1. 用户在 Mobile/Desktop 发起 `claw-core/pair`
2. 后端生成 6 位一次性配对码 + 时效 60s
3. Toy 屏幕（或音箱 TTS / 包装盒二维码）显示配对码
4. 用户输入到 Mobile App
5. 后端核对，颁发 device JWT + 公钥固化

### 8.3 设备撤销

- 用户可在任意端撤销某个 Toy
- 撤销后该 Toy 的 JWT 立即失效，Topic 订阅被切断
- 物理上 Toy LED 红色 5 次 + TTS 提示「我和主人解除绑定了」

### 8.4 儿童安全（F 族群家庭账号）

- F 族群挂载在家庭账号下时，强制 COPPA 模式：
  - Toy TTS 禁用任何 L2+ 价格 / 支付 / 链上信息
  - 监护人在 Web/Mobile 可看到该 Toy 的所有交互流水
  - PetCreator NSFW 模型阈值降低 20%（更严）

---

## 9. Agent 经济在跨端（V4 增量）

V4 完全沿用 V3 §9，新增以下条款：

### 9.1 经济主体增项

| 主体 | 有 AgentAccount? | 可买卖? | V4 备注 |
|------|----------------|--------|--------|
| Living Pet 灵魂 | ❌（V3 不变） | ❌ | 灵魂不可让渡 |
| **皮肤 Skin** | ❌ | ✅ | V4 新增可流通资产 |
| Working Agent | ✅ | ✅ | V3 不变 |
| Toy 设备 | ❌ | ❌ | 仅 surface，不持账户 |

### 9.2 Skin GMV 收入分配

```
售价 P → Stripe / 钱包扣款
   ├── 平台 Agentrix：       P × 30%
   ├── 原作者（如 Remix）：   P × (70% × r)，r ∈ [10%, 50%]
   └── 二创者：              P × (70% × (1-r))
```

链式上限 3 层祖先（A → B → C → D），D 之后归入版权金池。

### 9.3 ClawCore 硬件生态收入

| 层 | 一次性 | 年度 | GMV 抽成 | 联名分成 |
|:--:|------|------|---------|---------|
| L2 联名（合作方制造） | $5k-10k 入场费 | $1k/年 | 15-25% | 50/50 |
| L3 认证（第三方） | – | $500-5k/SKU/年 | 5-10% | – |

---

## 10. ClawCore SDK v0（V4 新增详细规格）

### 10.1 SDK 分层

| 层 | 必须实现 | 可选实现 | 适用硬件 |
|:--:|---------|---------|---------|
| **L3 认证最小集** | `hello` + `pet.interaction`（单向上报） + 周期广告 | – | NFC 标签 / 简单 BLE Beacon / 第三方贴纸 |
| **L2 联名完整集** | + `pet.state.sync`（双向） + `pet.approval.notify` + OTA + 离线缓存 | `vitals.report` / `tts` / `mic` | 联名毛绒 / 潮玩 / 智能音箱 |

### 10.2 5 种接入方式（详见 `PRD_PET_CROSS_PLATFORM_CAPABILITY_MATRIX.zh-CN.md`）

1. **NFC 标签**（最轻）：盲盒 / 卡牌 / 贴纸 → 碰触 Mobile 触发 `pet.interaction { kind: 'nfc_touch' }`
2. **BLE Beacon**：低成本识别实体存在 → 进/出范围广播
3. **ClawCore 完整 SDK**：双向通信、语音采集、触摸反馈、eink/OLED 显示
4. **Wi-Fi 直连**：音箱 / 桌面固定设备 / 车机 → 长时连接、大流量、TTS
5. **厂商 App SDK**：从对方 App 内唤起 Agentrix 宠物（如学习机厂商 App）

### 10.3 参考实现（Agentrix 不出货固件，仅提供样板）

| 平台 | 仓库 | 维护 | 状态 |
|------|------|------|------|
| ESP32-S3 (Rust + Embassy) | `agentrix/clawcore-esp32-ref` | Agentrix + 社区 | V5 W9 启动 |
| nRF52 (Zephyr) | `agentrix/clawcore-nrf-ref` | 社区 | V5 W11 |
| Android Bridge | `agentrix/clawcore-android-bridge` | Agentrix | V5 W10 |
| iOS Bridge | `agentrix/clawcore-ios-bridge` | Agentrix | V5 W10 |

### 10.4 开发者门户

- 域名：`developer.agentrix.top`
- 内容：SDK 下载、协议文档、认证流程、收入仪表盘、L2/L3 申请表
- 上线节点：V5 W9

---

## 11. 渲染器路线图（V4 跨端统一）

V4 在所有端遵循同一渲染器优先级：

```
priority = ['live2d', 'vrm', 'rive', 'fallback']
（与 desktop/src/services/petSdk.ts :: RENDERER_PRIORITY 一致）
```

各端落地节点：

| 渲染器 | Web | Desktop | Mobile | Watch | Glass | Toy |
|--------|:---:|:-------:|:------:|:-----:|:-----:|:---:|
| SVG fallback | ✅ P0 | ✅ P0 | ✅ P0 | ✅ P0 (emoji 等价) | ✅ P0 (字符画) | ✅ P0 (LED) |
| Rive 2D | V4 W3 | V4 W3 | V4 W3 | – | – | – |
| VRM 3D 低面 | V4 W5 | ✅ 已上线 | V4 W5 | – | – | – |
| VRM 3D 高面 + PBR | V4 W6 | V4 W6 | V4 W6 | – | – | – |
| Live2D（保留不主推） | – | – | – | – | – | – |

---

## 12. 路线图（V4 6 阶段）

> 完整开发任务拆解 → `PRD_PET_PHASED_DEV_PLAN.zh-CN.md`  
> 完整阶段测试计划   → `PRD_PET_PHASED_TEST_PLAN.zh-CN.md`

### Phase 0（V3 已上线，V4 基线）

- 6 端中的 5 端已有 V3 实现
- Living Pet 单灵魂模型已上线
- PetCreator 文生 / 图生（Meshy + 腾讯云 Hunyuan3D）已上线（见本对话已完成的 Tencent Cloud 切换）
- 视觉感知、亲密度、6 表情、Auto-Earn 已上线

### Phase 1（V4 W1-W2）— 灵魂 × 皮肤地基

- 后端：`pet-soul-template` / `pet-skin` / `pet-active-skin` 三表 + 28 签名 seed
- 跨端：6 族群选择器（Web/Desktop/Mobile）
- SSoT：`shared/types/agentrix-presence.ts` 加 `SoulTemplateId / SkinRef`
- **通过条件**：用户切换灵魂不丢亲密度，跨端 5s 内同步

### Phase 2（V4 W3-W4）— Rive + 配额 + 审核

- 全端 Rive 2D 接入；State Machine 与 `EMOTION_MOTION_MAP` 1:1
- 配额面板；CLIP NSFW 100% 拦截
- Pro / Pro+ Stripe 支付走通

### Phase 3（V4 W5-W6）— VRM 标准化 + Marketplace MVP + Web 嵌入

- 自动 rig 管线；`.glb`→`.vrm`
- Marketplace 上架 / 一口价 / 拍卖 / 租赁 / Remix
- Web `/console/marketplace` + iframe 嵌入
- 双图融合繁殖

### Phase 4（V4 W7-W8）— 跨端审批 + Auto-Earn + 6 端能力对齐

- L0-L3 审批跨端 + Mobile 生物认证强制
- Watch Complication + Wear OS Tile
- 经济面板 + 日报 / 周报
- Auto-Earn 5 类品类 + 能量系统
- A2A 宠物雇佣

### Phase 5（V5 W9-W12）— 摄像头扫描 + ClawCore SDK v1 + 首批 Toy

- Mobile 多视角扫描（120s → `.vrm`）
- ClawCore SDK v1（BLE + Wi-Fi + MQTT + JSON 帧）
- 开发者门户 `developer.agentrix.top`
- L2 联名首发 1-2 款（毛绒 / 潮玩，合作方制造）
- L3 认证 3-5 家第三方接入

### Phase 6（V5 W13-W16）— 生态扩张

- 视频 / 桌面 / 车机 / 学习机厂商 App SDK
- 全球排行榜 + 朋友 PK
- 子宠物团队（Lv5+ 解锁 11 个子宠）
- NFT 铭文（Lv9-10 高亲密度专属）

---

## 13. Marketplace Ecosystem + Pet Economy / AXP (V4.1 增量)

> Source: Marketplace Ecosystem spec (`.kiro/specs/marketplace-ecosystem/design.md`) + Mobile Refactor & Ecosystem 白皮书 (`docs/MOBILE_REFACTOR_AND_ECOSYSTEM_PLAN_2026-05.zh-CN.md`)。
>
> 本节作为 V4.1 顿领增量，为各端 PRD 的 Marketplace / Economy 章节提供单一事实源。所有端的 AXP / 订阅 / Remix 分成 / Deep Link 数值以本节为准。

### 13.1 一句话战略

> **Agentrix = 以"宠物 Agent"为载体的跨端经济生态。每个用户是全能公民，既消费也创造，通过 AXP 积分串联留存与裂变。**

"全能公民"取代 V3 的身份包：**一个账号，所有能力**（陪伴 / 发布技能 / 设计皮肤 / 开店 / IP 联名 / 做游戏 / 带公会），订阅档位决定量级而非身份。

### 13.2 Web ↔ Mobile 分工（交易架构最终态）

| 维度 | Web | Mobile |
|------|-----|--------|
| 角色 | **展示 + 发现 + 完整交易闭环** | **陪伴中枢 + 审核 + 分享裂变 + 也可完成交易** |
| Marketplace 深度 | 主战场：浏览 / 上架 / 购买 / Remix 树 / 拍卖 / 租赁 / 创作者后台 / 排行榜 / Showcase | 浏览 / 购买 / 装备 / 简化上架 |
| Checkout | 完整 Cart → Checkout → SmartCheckout（混合支付）→ Order | In-app checkout（Stripe / Crypto via WebBrowser）或跳 Web |
| Deep Link 方向 | 生成 `agentrix://` 推 Mobile | 接收 + 解析 |
| 后端 | 共享 NestJS + PostgreSQL | 同一后端 |
| SEO | SSR + JSON-LD + Open Graph（TTFB < 200ms） | 不适用 |

核心原则：**两端共享同一后台**，Deep Link 是跨端辅助入口不是唯一路径。

### 13.3 18 只官方预制皮肤（Platform Seed）

为向用户展示 AXP 价值 + seed Marketplace：

| 属性 | 值 |
|------|----|
| 总数 | 18（6 族群 × 3 只） |
| 价格 | 500–3000 AXP（约 $0.50–$3.00） |
| 支付 | AXP 积分（部分或全额） |
| 数据库标记 | `source='platform'` / `visibility='public'` / `moderation_status='approved'` / `featured=true` |
| 曝光 | Web `/showcase` carousel 顶部 + `/market` Trending 前 6 + Mobile Plaza · Pets 精选位 |
| 绑定 | 部分皮肤作为 NFC 盲盒 / L2 联名 SKU 的默认资产 |

### 13.4 新增跨端后端 API（V4.1）

| 端点 | 用途 | 认证 | 备注 |
|------|------|------|------|
| `GET /api/v1/market/skins` | 皮肤浏览（sort/clan/cursor 分页） | 公开 | 聚合 `pet_skins` + `marketplace_pet_listings` LEFT JOIN |
| `GET /api/v1/market/search` | 跨表统一搜索（skins + skills + tasks） | 公开 | 返回分组结果与计数 |
| `GET /api/v1/axp/balance` | AXP 余额 | 认证 | 导航栏实时余额展示 |
| `GET /api/v1/axp/ledger` | AXP 流水（FIFO 过期追踪） | 认证 | `AxpCenterScreen` / `/console/axp` |

查询参数（`/api/v1/market/skins`）：`sort=featured|newest|popular` / `clan=A-F` / `limit` / `cursor`。

数据库扩展 — `pet_skins` 表新字段：

```sql
ALTER TABLE pet_skins ADD COLUMN clan VARCHAR(2) DEFAULT NULL;
ALTER TABLE pet_skins ADD COLUMN like_count INTEGER DEFAULT 0;
ALTER TABLE pet_skins ADD COLUMN view_count INTEGER DEFAULT 0;
ALTER TABLE pet_skins ADD COLUMN remix_count INTEGER DEFAULT 0;
ALTER TABLE pet_skins ADD COLUMN featured BOOLEAN DEFAULT FALSE;
```

### 13.5 Mobile Deep Link 统一协议

```
agentrix://{action}?resourceId={id}&userId={uid}&token={tok}
```

| Action | 目标 | 典型来源 |
|--------|-----|---------|
| `agentrix://buy?resourceId={skinId}` | 皮肤购买 | Web `/market/skin/[id]` / 第三方分享 |
| `agentrix://bid?resourceId={auctionId}` | 拍卖出价 | Web `/market/auction/[id]` |
| `agentrix://install_skill?resourceId={skillId}` | 技能安装 | Web `/market/skills/[id]` |
| `agentrix://accept_task?resourceId={taskId}` | 任务接单 | Web `/market/tasks/[id]` |
| `agentrix://co_raising?inviteToken={tok}` | 共养好友主宠落地 | Mobile 分享 → Web landing → 拉回 App |
| `agentrix://greeting?cardToken={tok}` | 贺卡收件 | Mobile 分享 |

已登录用户在 Web 生成 Deep Link 时自动注入 `userId + token`，避免移动端重新登录。未登录用户先走 Web landing（`/co-raising/[token]` 或 `/greeting/[token]`）作为裂变入口。

### 13.6 AXP 积分体系（Phase 1 · off-chain）

#### 13.6.1 两层结构

| 层 | AXP（Agentrix Point） | AX（未来代币） |
|---|---------------------|---------------|
| 形式 | 软积分（off-chain 数据库） | ERC-20 + 治理代币 |
| 锚定 | **1 AXP = $0.001** | 浮动 |
| 合规 | 中国区友好（非证券） | 仅限非受限地区 |
| 上线 | **Phase 1 ✅** | Phase 3+（合规就绪后，1 AX = 100 AXP 预留接口） |

合约接口 Phase 1 部署但 `ADMIN_ONLY` 不开放（`contracts/AXPTokenBridge.sol`）。数据库从 Day 1 完整落库 `user_axp_ledger` / `user_axp_balance_snapshot` / `axp_earned_timestamp` 保证未来兑换可追溯。

#### 13.6.2 六大发放来源（10k MAU 基线）

| # | 来源 | AXP/次 | 月发放 |
|--:|------|--------:|--------:|
| 1 | 每日签到 | 20 avg | 2,000k |
| 2 | 和宠聊 10 轮/日 | 20 | 1,600k |
| 3 | 宠物 Lv↑ | 150 | 150k |
| 4 | 共养好友喂食 | 5 | 135k |
| 5 | 好友通过推广注册 | 500 | 250k |
| 6 | 好友消费 GMV × 1% | 10 | 20k |
| 7 | 集市发帖被赞 | 3 | 9k |
| 8 | 完成任务（金额 × 10） | 5 | 25k |
| 9 | 皮肤 / 商品售出 | 50 | 25k |
| 10 | 游戏参与（共养 / 贺卡 / 大赛） | 30 | 900k |
| 11 | 大赛冠军 | 30 | 159k |
| 12 | 订阅消费返现 | 按档位 | 按消费 |

**月发放 I_m ≈ 5.27M AXP（= $5,270 隐性负债 = $0.527 / MAU）**

#### 13.6.3 五大消耗去处

| # | 场景 | AXP/次 | 月销毁 |
|--:|------|-------:|-------:|
| A | 订阅续费抵扣（最多 20%） | 2000 | 1,280k |
| B | 技能购买抵扣（最多 20%） | 100 | 800k |
| C | 皮肤购买抵扣（最多 20%） | 200 | 400k |
| D | 宠物创作额度（+5 次） | 300 | 300k |
| E | A2A 任务优先匹配 | 500 | 150k |
| F | 集市卡片置顶 24h | 200 | 200k |
| G | 专属皮肤 / NFT 预售资格 | 2000 | 200k |
| H | L3 协签手续费减免 | 1000 | 50k |
| I | 抽奖（100 AXP/次） | 100 | 800k |
| J | 限定皮肤 / 兑换 | 500 | 1,000k |
| K | 过期销毁（12 个月未用） | auto | 500k |

**月销毁 B_m ≈ 5.68M AXP** → B_m / I_m = **108%** → 季度流通池净变 **-1.23M AXP**（轻度通缩）。

#### 13.6.4 消费返现（订阅核心黏性）

| 用户档 | 买 $100 返 AXP | 返现率 |
|-------|---------------:|------:|
| Free | 0 | 0% |
| Lite | 500 | 5% |
| Plus | 1000 | 10% |
| Pro | 1500 | 15% |
| Elite | 2000 | 20% |

订阅 = 解锁更多返现能力，而非买配额。

#### 13.6.5 过期机制（FIFO）

- AXP 发放后 **12 个月自动销毁**
- 每笔 AXP 带时间戳，FIFO 消耗（最早获得的先消耗）
- 过期前 30 天跨端推送提醒

#### 13.6.6 动态调节器

| 信号 | 响应 |
|------|-----|
| 流通池 S_m 月环比 +20% | 降低发放系数 10% |
| S_m 月环比 -10% | 提高发放 10% / 开放限定兑换 |
| 兑换商品连续 30 天售罄 | 上新品 / 涨价 |
| 老用户季度零新获得 | 定向"老友回归"礼包 |
| Free ARPU < $0.02 | 降低签到 AXP / 限频 |

### 13.7 5 档 + Enterprise 订阅（V4.1 冻结）

| 档位 | 月价 | 年价 | LLM 预算 | 宠数 | 技能上架 | 皮肤上架 | 拍卖费 | AXP Cashback |
|-----|----:|----:|---------:|----:|---------:|---------:|------:|-------------:|
| **Free** | $0 | – | $0.30 硬顶 | 2 | 1 | 1 | 2.5% | 0% |
| **Lite** | $4.99 | $49 | $2.5 cloud | 5 | 3 | 3 | 1.8% | 5% |
| **Plus** | $14.99 | $149 | $8 cloud | 15 | 10 | 10 | 1.0% | 10% |
| **Pro** | $29.99 | $299 | $20 cloud | 40 | 30 | ∞ | 0.3% | 15% |
| **Elite** | $69 | $690 | $50 cloud | ∞ | ∞ | ∞ | 0% | 20% |
| **Enterprise** | 合同 | 合同 | 合同 | 合同 | 合同 | 合同 | 合同 | 合同 |

额外权益（V4.1 确认）：
- Auto-Earn 并行执行器槽位随档位扩展（Lite 1 / Plus 2 / Pro 3 / Elite ∞）
- L3 多端协签在 Pro+ 开放
- Pet SDK beta 在 Elite 开放
- 家庭席位在 Plus+ 开放
- Elite 专属季度限定皮肤 + Elite Creator 徽章 + 2h 专属客服 lane
- 首页推荐权重（Free 1× / Lite 1.2× / Plus 1.5× / Pro 2× / Elite 3×）

**超额策略（所有档位）**：AXP 抵扣（1 AXP = $0.001）/ 现金实扣（1.3–1.5× 防滥用）/ BYOK 自带 API key 三选一。

### 13.8 Pet 经济三大闭环（V4.1）

> 所有旧模块（Skill / Task / Predict / Referral / Breeding / NFT / Toy）都是这三个 loop 的组成部分。

**Loop 1 · 陪伴 → 成长 → 亲密度 → 解锁**：
聊天 / 拍照 / 语音 → 记忆 4 层入库 → XP+ → Lv↑ 解锁新技能槽 / 灵魂模板 / 皮肤 → Dreaming 夜间总结 → 晨报 → 回访。

**Loop 2 · 技能 → 任务 → 赚钱 → 宠钱包 → 分账**：
Plaza · 技能 → ⚡装到主宠 → A2A 匹配任务 / 用户手动接 → 主宠执行 → 结算入主宠 MPC 钱包 → Split Rule（User 70% / Creator 20% / Platform 10%） → 用户看到"主宠给我赚了 $X"。

**Loop 3 · 宠物资产 → 设计/养成 → 拍卖/NFT/玩偶 → 裂变**：
PetCreator / 繁育 / 换皮 → 灵魂×皮肤+血统+成就+赚钱记录 = 资产估值 → 拍卖 / 一口价 / 出租 → NFT mint 确权 → 买家获得完整宠物 → 或跳 L2 联名 Landing 定制实体玩偶 → 分享带 ref → 新用户引导 → AXP 返现闭环。

### 13.9 Phase 1 多人游戏（裂变发动机）

决策：**共养 + 贺卡**（零门槛 × 高互动 × 高裂变）。

| 玩法 | 心智 | 裂变路径 | AXP 流动 |
|------|-----|---------|---------|
| **共养好友的宠** | 蚂蚁森林模式 | 分享链接 → Web landing → 未注册也可喂一次 → 注册拿 500 AXP | 喂食 +5 AXP；未来 Task 收益好友得 5% |
| **宠物贺卡** | 节日 / 生日 / 搞笑 | 选模板 → 自定义 → 发给好友 → 收件人 App 收件 | 优质模板 500-2000 AXP 兑换（销毁闭环 J） |

Phase 2 保留清单（不实现）：每日宠物大赛 / 宠物接龙剧场 / 组队 Polymarket / 协作任务分工 / PvP 拍卖 / 游戏工作室 SDK 作品。

### 13.10 LLM 成本控制红线（经济模型的塌房保险）

没有以下 5 条机制，整个经济模型失灵：

1. **硬 Token Budget**：Free 每日 20 轮硬断；付费档预算耗尽弹升级提示
2. **智能路由默认**：`llm-router` 默认最便宜能干活的模型；Opus / GPT-5 仅显式指定或需推理时启用
3. **本地模型降级**：`llama.rn` / `whisper.rn` 常驻；Free 用户 60%+ 对话走本地推理
4. **BYOK 鼓励**：Power user 用自己 API key 不吃平台 LLM 预算
5. **Quota 可视化**：钱包 / AXP 中心显示"本月已用 $12.30 / $20"

### 13.11 单位经济 P&L（10k MAU 成熟期）

| 档位 | 占比 | 毛利/人 |
|------|----:|-------:|
| Free | 85% | -$0.37 |
| Lite | 7% | +$2.10 |
| Plus | 5% | +$5.99 |
| Pro | 2% | +$8.08 |
| Elite | 0.8% | +$15.93 |
| Enterprise ($500 档) | 0.2% | +$200 |

- 加权订阅毛利 / MAU = **+$0.82**
- GMV 抽成（技能 / 皮肤 / 任务 / NFT fee） / MAU = **+$0.47**
- **综合 / MAU = +$1.29 / 月**
- 固定月成本 ~$999 → **Break-even ≈ 775 MAU**
- 规模化：10k MAU → +$155k 年化；100k → +$1.5M；1M → **+$15M**

### 13.12 各端 Marketplace / Economy 对齐

| 维度 | Web | Mobile | Desktop | Watch | Glass | Toy |
|------|:---:|:------:|:-------:|:-----:|:-----:|:---:|
| Marketplace 深度 | 完整主战场 | 浏览+购买+装备+简化上架 | 浏览+购买+上架 | 仅推荐 | – | 不参与 |
| /showcase 画廊 | ✅ 18 官方皮肤曝光主渠道 | Plaza · Pets 精选位 | 可访问 | – | – | – |
| AXP 余额展示 | 导航栏（已登录） | Home + Me + AXP Center | Pet 浮球侧栏 | Tile 子项 | HUD 微通知 | – |
| 订阅 CTA | `/pricing` | Me Tab 升级入口 | Agent Economy Panel | – | – | – |
| Deep Link 生成端 | 主力 | 分享裂变 | 支持 | – | – | – |
| Deep Link 接收端 | 不接收 | 唯一解析端 | – | – | – | – |
| 共养 / 贺卡 | Landing + OG 分享预览 | 发起 + 收件主端 | – | – | – | – |

---

## 14. 与现有 V3 PRD 的引用关系

| V4 主题 | V4 处理方式 | V3 引用位置 |
|---------|-----------|------------|
| 系统助手共生 | 完全沿用 + 4 个新 Intent | V3 §6 |
| Realtime / API 基础 | 沿用 + 5 个新 Topic + 12 个新 API | V3 §7 |
| Trust / MPC / 审计 | 沿用 + Toy 安全约束 | V3 §8 |
| AgentAccount / SplitPlan | 沿用 + Skin GMV 抽成 + ClawCore 收入 | V3 §9 |
| 5 端职责 | 沿用 + 第 6 端 Toy | V3 §1 |
| Handoff / Approval / Wallet / Vitals / Memory | 沿用 + Toy 端追加列 | V3 §5 |
| 家庭账号（P3） | 沿用 + 家庭宠纳入「灵魂×皮肤」框架 | V3 §3.9 |
| **Marketplace / AXP / 订阅** | **§13 单一事实源** | V3 §9（AgentAccount 基础保留） |

---

## 15. 文档地图

```
agentrix-cross-platform-prd-v4.md   ← 本文件（顿领）
├── desktop-prd-v4.md                 桌面 + PetCreator 重度创作
├── mobile-prd-v4.md                  钱包 + 摄像头扫描 + Pet Companion
├── web-prd-v4.md                     Marketplace 主战场 + 创作者后台
├── wearable-prd-v4.md                Watch + Glass + BLE 外设
└── toy-prd-v4.md                     【新】Toy（NFC / BLE / SDK / Wi-Fi / App SDK）

参考（不归 V4 序列，但 V4 强引用）：
├── PRD_DESKTOP_PET_AGENTRIX_CLAW.zh-CN.md  ClawBuddy v2.0（V4 思想源）
├── PRD_PET_6_CLANS_PERSONA.zh-CN.md         28 签名宠物人格细节
├── PRD_PET_CROSS_PLATFORM_CAPABILITY_MATRIX.zh-CN.md  6 端 × 5 接入方式矩阵
├── PRD_PET_MONETIZATION_QUOTA_MODEL.zh-CN.md          配额 / GMV / Remix 分成
├── PRD_PET_PHASED_DEV_PLAN.zh-CN.md                   V4 W1 - V5 W16 任务拆解
└── PRD_PET_PHASED_TEST_PLAN.zh-CN.md                  各阶段通过条件
```
