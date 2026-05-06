# Agentrix 移动端 PRD v4.0（Mobile · iOS + Android）

> **移动 = 钱包 + 嘴巴 + 主宠摇篮 + 摄像头工坊**：V3 的三形态保留，V4 把 Pet Companion 升级为「灵魂×皮肤」承载端，并新增**摄像头扫描真实物体生成宠物**的入口。
>
> 本文件只写移动端 V4 增量。所有跨端契约引用 `agentrix-cross-platform-prd-v4.md`。V3 的三形态、签名中心、系统助手集成等沿用 `mobile-prd-v3.md`。

- 版本: v4.0（与 V3 共存）
- 状态: Draft
- 技术栈: React Native (Expo SDK 54) + 原生模块（iOS App Intents / Android App Actions / NFC / Camera）
- 仓库策略: 代码在 `Agentrix-website/` 主仓 → 公开版同步到 `agentrix-claw`
- 上游: `agentrix-cross-platform-prd-v4.md` / `mobile-prd-v3.md`

---

## 0. V4 vs V3 移动端对照速读

| 维度 | V3 | V4 |
|------|-----|-----|
| 形态 | 三形态（Home Console / Voice Quick / Pet Companion） | 不变 |
| Pet Companion 默认 | 关闭 | **默认开启**（V4 把宠物推为主流卖点） |
| 主宠模型 | 单层 LivingPet | **灵魂 × 皮肤** |
| PetCreator 入口 | 不存在 / 弱 | **首屏 Tab 之一** + 摄像头扫描（V5） |
| Marketplace | 不存在 | 浏览 + 购买 + 装备 + 上架精简版 |
| NFC | 不存在 | **盲盒 / 卡牌 / 贴纸碰触触发** `pet.interaction` |
| Toy 配对 | 不存在 | **OOB 配对中心**（Mobile 是唯一发起端） |
| 签名能力 | Trust 3 唯一签名端 | 不变（强化：Toy / Skin 上架等所有 L2 仍走 Mobile） |
| 系统助手 | iOS / Android / 国内四家 | 沿用 + 4 个 V4 新 Intent |

---

## 1. 一句话定位（V4 升级）

**Agentrix Mobile V4 = 你的 Web3 钱包 + 语音助手 + 可定制主宠 + 物理玩具配对中心**：手机是宠物诞生地（摄像头扫描 / 文生）、签名中心、Toy 唯一配对端，全端唯一 Trust 3。

---

## 2. 三形态（V4 不变 + Pet Companion 升级）

### 2.1 Home Console（V4 调整）

V4 在 Bottom Tab 调整：

| Tab | V3 | V4 |
|-----|-----|-----|
| Home | ✅ | ✅ |
| Agents | ✅ | ✅ |
| **Pet（新）** | – | ✅（融合 PetCreator + Wardrobe + Marketplace 入口） |
| Wallet | ✅ | ✅ |
| Settings | ✅ | ✅ |

> Tab Bar 由 5 项变 5 项（删除原 V3 的「Doer」入口，下沉为 Home 的卡片）。

### 2.2 Voice Quick（V4 不变）

V3 的 Voice Quick 形态完全保留。V4 仅在响应中可触发 `create-pet(prompt)` Intent。

### 2.3 Pet Companion（V4 默认开启 + 新能力）

| 能力 | V3 | V4 |
|------|-----|-----|
| 默认状态 | 关闭 | **开启**（首次进入 onboarding 询问关闭） |
| 渲染 | Live2D 或 emoji | **VRM 高保真 + Rive 2D fallback** |
| 锁屏 / 灵动岛 | ✅ | ✅（皮肤切换会反映） |
| 衣柜 | – | ✅（横滑选择已拥有皮肤） |
| 灵魂切换 | – | ✅（弹 6 族群选择器） |
| 摄像头扫描 | – | ✅ V5（多视角 → 生成 .vrm） |
| Toy 配对入口 | – | ✅ 「我的硬件」子页 |

---

## 3. 三层愿景（V4 修订）

| 层 | 移动主阵地 | V4 增量 |
|----|-----------|--------|
| Living Pet（灵魂） | Pet Companion + 状态徽 | 灵魂模板切换 + 6 族群推荐 |
| Pet（皮肤） | Pet Tab → Wardrobe + PetCreator | 摄像头扫描 + NFC 触发 |
| Doer（Working Agents） | Agents Tab + Voice Quick | 不变 |
| Economy | Wallet Tab | + Skin 收入 + Toy 关联资产 |

---

## 4. PetCreator 移动端（V4 主路径）

### 4.1 入口

- **Pet Tab → 创建** （主入口）
- **首次安装 onboarding 第 3 步**（强引导）
- **Voice Quick** 「Hey Aira, 帮我生成一只穿宇航服的猫」 → 触发 `create-pet` Intent → 跳到 PetCreator

### 4.2 三模式 + 1 移动专属模式

| 模式 | UI | 后端 | 说明 |
|------|----|------|------|
| 文生 | 全屏 prompt 输入 | Meshy/Hunyuan3D | V4 P1 |
| 图生 | 调相册 / 拍照 | Meshy/Hunyuan3D | V4 P2 |
| 双图融合（繁殖） | 选 2 张已有皮肤 | Backend 融合算法 | V4 P3 |
| **摄像头扫描（V5 移动专属）** | 引导用户绕物体一周拍 8-12 张 | NeRF / 多视角 SfM → .glb → .vrm | V5 P5 |

### 4.3 摄像头扫描流程（V5）

```
1. 用户点击「扫描」
2. AR 引导环（Apple ARKit / Google ARCore）显示绕行路径
3. 自动连续抓拍 8-12 张
4. 上传到后端 pet-generation/scan
5. 服务端跑 NeRF 或多视角 SfM 重建
6. 输出 .glb → 自动 rig → .vrm
7. 推送回 Mobile + 任意在线 Desktop
8. Mobile 弹「✨ 设为我的萌宠」
```

### 4.4 配额 UI

| 计划 | 月配额 | 显示位置 |
|------|-------|---------|
| Free | 3 | PetCreator 顶部 progress + 提示「升级解锁」 |
| Pro | 30 | 同上 |
| Pro+ | 无限 | 不显示配额 |

---

## 5. NFC 盲盒 / 卡牌（V4 新增）

### 5.1 触发流程

```
1. 用户购买 Agentrix 盲盒 / 卡牌 / 贴纸
2. 实体含 NFC 标签（NDEF URI: agentrix://nfc/<token>）
3. 用户用 iPhone / Android 碰触
4. App 接收 token → 调 /api/v1/clawcore/nfc/redeem
5. 后端验证 token 唯一性 → 颁发限定皮肤 / Soul / 道具到该用户
6. App 弹动画「✨ 解锁了 XXX 皮肤」
7. 同时上报 `pet.interaction { kind: 'nfc_touch', token }`
8. 主宠表情 3s 内切到 excited
```

### 5.2 实现

- iOS：CoreNFC（NDEF 读，无写）— 后台唤起 App via NFC Tag Reader（iOS 17+）
- Android：android.nfc — Foreground Dispatch + Background NDEF
- 防刷：每 token 仅一次兑换；同 user 24h 内重复 tap 同 token 仅触发情绪

---

## 6. Toy 配对中心（V4 新增 — Mobile 唯一发起端）

### 6.1 OOB 配对流程

```
1. 用户在 Pet Tab → 「我的硬件」 → 「配对新设备」
2. App 列出附近 BLE / Wi-Fi 设备
3. 选中设备 → 后端生成 6 位配对码（60s 时效）
4. 设备屏幕 / 包装盒 / 音箱 TTS 显示配对码
5. 用户输入到 App
6. 后端核对 → 颁发 device JWT + 公钥固化
7. App 弹「✅ 已绑定 [设备名]」
```

### 6.2 设备管理

- 列表：所有已绑定 Toy 设备
- 单项：电量 / 固件版本 / 最后活跃 / OTA 检查 / 解绑

### 6.3 ClawCore SDK 集成

App 内嵌 `clawcore-ios-bridge` / `clawcore-android-bridge`：

- BLE 发现 + 配对
- Wi-Fi 直连 mDNS 发现
- 帧编解码 + HMAC 验证
- 实现位置：`packages/clawcore-mobile/`（V5 W10 新增）

---

## 7. 与跨端 7 大主路径的移动适配

| 路径 | Mobile 行为 | V4 增量 |
|------|-----------|--------|
| Handoff | 全屏 Modal Banner（V3） | 不变 |
| Approval Routing | Trust 3 唯一签名端 | + Skin 上架 / Toy 配对的 L2 |
| Wallet | 完整 WalletScreen + Stripe + USDC | + Skin GMV 收入卡片 |
| Vitals | 提供位置 / 日历 / 锁屏时长 | 不变 |
| Memory | 4 层共享 | 不变 |
| **Pet Creation（V4 新）** | Pet Tab 主入口 + 摄像头扫描 | 全新 |
| **Skin Marketplace（V4 新）** | Pet Tab → Marketplace（精简版） | 浏览 / 购买 / 装备；上架仅限已生成皮肤 |

---

## 8. 与系统助手集成（V4 增量）

V3 §10 的 iOS App Intents / Android App Actions / 小艺 / 鸿蒙意图全部沿用。V4 新增 4 个 Intent（与顿领 §6 同步）：

| Intent | 行为 | 触发示例 |
|--------|-----|---------|
| `CreatePetIntent` | 启动 PetCreator 文生 | "Hey Siri, 让 Aira 帮我生成一只蓝色独角兽" |
| `SwitchSkinIntent` | 切换装备的皮肤 | "Hey Aira, 换上我新买的猫女皮肤" |
| `PetMoodIntent` | 查询主宠当前情绪 | "Hey Aira, 萌宠现在心情怎么样" |
| `MarketSearchIntent` | 启动 Marketplace 搜索 | "Hey Aira, 找个适合圣诞的皮肤" |

---

## 9. 渲染器（V4 移动端）

| 渲染器 | 落地 | V4 节点 |
|--------|-----|--------|
| SVG fallback | 已上线 | – |
| Rive 2D | V4 W3 | rive-react-native |
| VRM 低面 | V4 W5 | three.js + react-three-fiber + three-vrm |
| VRM 高面 + PBR | V4 W6 | 同上 + 高质量贴图 |
| Live2D | 不主推 | – |

低端机（< 4GB RAM）默认走 Rive 2D。

---

## 10. 路线图（V4 移动端）

| 阶段 | 周期 | 交付 |
|------|------|------|
| V4 P1 | W1-W2 | Pet Tab、灵魂切换、6 族群推荐、Wardrobe |
| V4 P2 | W3-W4 | Rive 渲染、PetCreator 文生 + 图生、配额 UI |
| V4 P3 | W5-W6 | VRM 高面、双图融合、Marketplace 浏览/购买 |
| V4 P4 | W7-W8 | NFC 盲盒、Pet Companion 默认开启、灵动岛适配 |
| V5 P5 | W9-W12 | 摄像头扫描（ARKit/ARCore）、Toy 配对中心、ClawCore SDK 集成 |

---

## 11. 与 V3 引用

| V4 主题 | V3 引用 |
|--------|--------|
| 三形态 | `mobile-prd-v3.md` §0 |
| 签名 / Trust 3 | `agentrix-cross-platform-prd-v3.md` §8 |
| 系统助手集成 | `mobile-prd-v3.md` §10 |
| Realtime Topic | `agentrix-cross-platform-prd-v3.md` §7.1 |
