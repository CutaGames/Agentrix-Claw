# 移动端 V4 补全计划

> **日期**：2026-05-11
> **范围**：PRD V4.0 路线图未完成项（8 项）+ Marketplace Ecosystem 差距（10 项）= 18 项待补全
> **排序原则**：先打通跨端链路 → 再做视觉渲染 → 再增强体验 → 最后做原生硬件能力
> **预估总工期**：~8-10 周（5 个 Sprint）

---

## 0. 待补全项汇总

### PRD V4.0 路线图未完成（8 项）

| # | 来源 | 项目 | 类型 |
|---|------|------|------|
| R1 | V4 P2 | Rive 2D 渲染 | 渲染层 |
| R2 | V4 P3 | VRM 3D 高面渲染 | 渲染层 |
| R3 | V4 P4 | NFC 盲盒/卡牌 | 原生模块 |
| R4 | V4 P4 | Pet Companion 默认开启 | 产品逻辑 |
| R5 | V4 P4 | 灵动岛适配 (iOS) | 原生模块 |
| R6 | V5 P5 | 摄像头 AR 扫描 | 原生模块 |
| R7 | V5 P5 | Toy 配对中心 | 原生模块 |
| R8 | V5 P5 | ClawCore SDK 集成 | 原生模块 |

### Marketplace Ecosystem 差距（10 项）

| # | 来源 | 项目 | 类型 |
|---|------|------|------|
| G1 | Audit | 未接入 `GET /api/v1/market/skins` 新端点 | API 对接 |
| G2 | Audit | Deep Link action 未注册 (buy/bid/install_skill/accept_task) | 跨端导航 |
| G3 | Audit | 皮肤购买缺少 AXP 支付选项 | 交易流程 |
| G4 | Audit | 缺少 clan 过滤器和族群标签展示 | UI 增强 |
| G5 | Audit | 缺少 featured 皮肤 showcase 区域 | UI 增强 |
| G6 | Audit | 技能卡片缺少 AXP 收益预估 | UI 增强 |
| G7 | Audit | 任务卡片缺少 AXP 奖励展示 | UI 增强 |
| G8 | Audit | 缺少 like_count/view_count/remix_count 统计展示 | UI 增强 |
| G9 | Audit | AXP 余额未在全局导航栏展示 | UI 增强 |
| G10 | Audit | 官方皮肤 AXP 定价未展示 | UI 增强 |

---

## Sprint 1 · 跨端链路打通（1 周）

**目标**：Web 端生成的 Deep Link 在移动端可正确解析；移动端皮肤市场接入新 API；AXP 可用于皮肤购买。

| # | 任务 | 覆盖项 | 预估 | 涉及文件 |
|---|------|--------|------|----------|
| 1.1 | 注册 Marketplace Deep Link actions | G2 | 4h | `App.tsx` linking config |
| 1.2 | 实现 Deep Link action resolver | G2 | 4h | `src/navigation/legacyRouteTable.ts` |
| 1.3 | 新建 `src/services/marketSkins.api.ts` 接入新端点 | G1 | 2h | 新文件 |
| 1.4 | 更新 `SkinAuctionScreen` 使用新端点 | G1 | 4h | `src/screens/plaza/SkinAuctionScreen.tsx` |
| 1.5 | 皮肤购买流程添加 AXP 支付选项 | G3 | 6h | 新 `SkinCheckoutModal.tsx` + `axp.api.ts` |
| 1.6 | 官方皮肤 AXP 定价展示 | G10 | 2h | 皮肤卡片组件 |
| 1.7 | 端到端测试 Web → Mobile deep link | G2 | 2h | Maestro E2E |

**小计：~24h（3 天密集开发 + 1 天测试）**

**验收标准：**
- [ ] 在 Web 端 `/market/skin/[id]` 点击 "也可在 App 中操作" → 移动端正确打开对应皮肤详情
- [ ] 移动端皮肤市场使用 `GET /api/v1/market/skins` 端点，支持 sort/clan/cursor
- [ ] 用户可以用 AXP 积分购买官方预制皮肤（500-3000 AXP）
- [ ] 皮肤卡片显示 AXP 价格（如 "1000 AXP"）

---

## Sprint 2 · 渲染层 + Pet Companion（1 周）

**目标**：用户看到真实的 2D 动画宠物（而非 emoji 占位）；首次进入 App 默认开启宠物陪伴。

| # | 任务 | 覆盖项 | 预估 | 涉及文件 |
|---|------|--------|------|----------|
| 2.1 | 安装 `rive-react-native` + 配置 Expo plugin | R1 | 2h | `package.json` + `app.json` |
| 2.2 | 创建 `PetRiveRenderer` 组件 | R1 | 8h | 新 `src/components/pet/PetRiveRenderer.tsx` |
| 2.3 | 准备 6 个 Clan 的 .riv 动画文件（或占位） | R1 | 4h | `assets/rive/` |
| 2.4 | 替换 PetCompanionScreen 的 emoji 占位为 Rive | R1 | 4h | `src/screens/pet/PetCompanionScreen.tsx` |
| 2.5 | Home Tab 主宠区域使用 Rive 渲染 | R1 | 4h | `src/screens/home/HomeScreen.tsx` |
| 2.6 | Onboarding 添加宠物设置步骤（默认开启） | R4 | 4h | Onboarding flow |
| 2.7 | PetCreator 内添加专属配额条 | R1(配额) | 2h | `PetCreatorScreen.tsx` |
| 2.8 | 低端机检测 + Rive/SVG fallback 逻辑 | R1 | 2h | `src/utils/deviceCapability.ts` |

**小计：~30h（4 天开发 + 1 天测试）**

**验收标准：**
- [ ] PetCompanionScreen 显示 Rive 2D 动画宠物（非 emoji）
- [ ] Home Tab 主宠区域显示 Rive 动画
- [ ] 首次安装 App 时 Onboarding 第 3 步询问"开启宠物陪伴？"（默认选中）
- [ ] PetCreator 顶部显示"本月已用 2/3 次"配额条
- [ ] 低端机（< 4GB RAM）自动降级到 SVG 渲染

---

## Sprint 3 · AXP 展示增强 + 皮肤体验（1-2 周）

**目标**：技能/任务卡片展示 AXP 信息；皮肤市场有 clan 过滤和 featured 展示；社交统计可见。

| # | 任务 | 覆盖项 | 预估 | 涉及文件 |
|---|------|--------|------|----------|
| 3.1 | 添加 clan 过滤器 UI（6 族群颜色标签） | G4 | 3h | `SkinAuctionScreen.tsx` |
| 3.2 | 添加 featured 皮肤 showcase 轮播区 | G5 | 4h | `PlazaScreen.tsx` Pets preview |
| 3.3 | 皮肤卡片添加社交统计（like/view/remix） | G8 | 3h | 皮肤卡片组件 |
| 3.4 | 技能卡片添加 AXP 收益预估展示 | G6 | 3h | `ClawMarketplaceScreen.tsx` |
| 3.5 | 任务卡片添加 AXP 奖励展示 | G7 | 3h | `TaskMarketScreen.tsx` |
| 3.6 | 全局导航栏 AXP 余额展示 | G9 | 3h | Home header 或 Tab bar |
| 3.7 | 统一搜索接入 `/api/v1/market/search` | G1 | 4h | 新搜索组件 |
| 3.8 | "AXP Accepted" badge 在皮肤卡片展示 | G3 | 2h | 皮肤卡片组件 |

**小计：~25h（3-4 天开发 + 1 天测试）**

**验收标准：**
- [ ] 皮肤市场有 Clan A-F 过滤 pill 按钮
- [ ] Plaza · Pets 顶部有 featured 皮肤轮播
- [ ] 皮肤卡片显示 ❤️ 128 · 👁 1024 · 🔀 12 统计
- [ ] 技能卡片显示 "~20 AXP/次" 收益预估
- [ ] 任务卡片显示 "+500 AXP" 奖励标签
- [ ] Home Tab header 右侧显示 "💎 12,340 AXP"

---

## Sprint 4 · NFC + Toy 配对（2-3 周）

**目标**：用户可以用 NFC 碰触解锁限定皮肤；可以配对 ClawCore Toy 设备。

| # | 任务 | 覆盖项 | 预估 | 涉及文件 |
|---|------|--------|------|----------|
| 4.1 | 安装 `react-native-nfc-manager` + Expo config plugin | R3 | 4h | `package.json` + native config |
| 4.2 | 实现 NFC 读取 + token 解析 | R3 | 8h | 新 `src/services/nfc.service.ts` |
| 4.3 | NFC 兑换 UI（动画 + 皮肤解锁弹窗） | R3 | 6h | 新 `src/screens/pet/NfcRedeemScreen.tsx` |
| 4.4 | 后端 `/api/v1/clawcore/nfc/redeem` 对接 | R3 | 4h | API 调用 |
| 4.5 | Toy 配对中心 UI | R7 | 8h | 新 `src/screens/me/ToyBindingScreen.tsx` |
| 4.6 | BLE 设备发现 + 配对流程 | R7, R8 | 12h | `react-native-ble-plx` 集成 |
| 4.7 | 6 位配对码输入 + 后端验证 | R7 | 4h | 配对流程 |
| 4.8 | 设备管理列表（电量/固件/解绑） | R7 | 6h | `ToyBindingScreen.tsx` |
| 4.9 | ClawCore 帧编解码 + HMAC 验证 | R8 | 8h | `packages/clawcore-mobile/` |

**小计：~60h（2-3 周）**

**验收标准：**
- [ ] iPhone/Android 碰触 NFC 标签 → App 弹出"✨ 解锁了 XXX 皮肤"
- [ ] 每个 NFC token 仅可兑换一次
- [ ] Me · 设备 → "配对新设备" → BLE 扫描 → 输入配对码 → 绑定成功
- [ ] 已绑定设备列表显示电量/固件版本/最后活跃

---

## Sprint 5 · VRM 3D + AR 扫描 + 灵动岛（延后，3-4 周）

**目标**：高保真 3D 宠物渲染；摄像头扫描真实物体生成宠物；iOS 灵动岛适配。

| # | 任务 | 覆盖项 | 预估 | 涉及文件 |
|---|------|--------|------|----------|
| 5.1 | 评估 React Native 3D 方案（expo-three vs react-native-filament） | R2 | 4h | 技术调研 |
| 5.2 | 安装 3D 渲染依赖 + 配置 | R2 | 4h | `package.json` |
| 5.3 | 实现 `PetVrmRenderer` 组件 | R2 | 16h | 新组件 |
| 5.4 | VRM 模型加载 + 表情 blendshape 驱动 | R2 | 12h | 渲染逻辑 |
| 5.5 | AR 扫描引导 UI（绕物体一周拍 8-12 张） | R6 | 12h | 新 `CameraScanScreen.tsx` |
| 5.6 | 多视角图片上传 + 后端 NeRF/SfM 对接 | R6 | 8h | API + 上传逻辑 |
| 5.7 | iOS 灵动岛 Live Activity（Swift 原生模块） | R5 | 16h | `ios/` 原生代码 |
| 5.8 | 灵动岛显示宠物状态（情绪/能量/任务进度） | R5 | 8h | 数据推送 |

**小计：~80h（3-4 周）**

**验收标准：**
- [ ] PetCompanionScreen 可选 VRM 3D 高面渲染（高端机）
- [ ] 用户可绕物体拍 8-12 张照片 → 上传 → 生成 .vrm 宠物
- [ ] iOS 灵动岛显示主宠表情 + 当前任务进度

---

## 总览甘特图

```
Week:  1    2    3    4    5    6    7    8    9    10
       ├────┤
       Sprint 1: 跨端链路
            ├─────┤
            Sprint 2: Rive 渲染 + Pet Companion
                  ├──────┤
                  Sprint 3: AXP 增强 + 皮肤体验
                        ├───────────┤
                        Sprint 4: NFC + Toy 配对
                                    ├──────────────┤
                                    Sprint 5: VRM + AR + 灵动岛 (延后)
```

---

## 依赖关系

```
Sprint 1 (跨端链路) ─┬─→ Sprint 2 (渲染层)
                     └─→ Sprint 3 (AXP 增强)
                              │
Sprint 2 ────────────────────→ Sprint 5 (VRM 是 Rive 的升级)
Sprint 3 ────────────────────→ Sprint 4 (NFC 需要皮肤展示完善)
Sprint 4 ────────────────────→ Sprint 5 (Toy 配对需要 ClawCore SDK)
```

---

## 风险与缓解

| 风险 | 严重度 | 缓解措施 |
|------|--------|----------|
| Rive 在 Expo 54 的兼容性问题 | 中 | 提前做 PoC；fallback 到 Lottie/SVG |
| VRM 在 React Native 性能不足 | 高 | 先用 Rive 2D 作为 MVP；VRM 仅高端机 |
| NFC 需要 development build（非 Expo Go） | 中 | 已有 EAS Build 流程 |
| AR 扫描需要 ARKit/ARCore 原生桥接 | 高 | 延后到 Sprint 5；先用图生模式替代 |
| 灵动岛需要 Swift 原生模块 | 中 | 使用 expo-live-activity 社区包或自建 |
| .riv 动画文件制作需要设计师 | 中 | 先用开源 Rive 社区资源；后续定制 |

---

## 资源需求

| Sprint | 前端开发 | 原生开发 | 设计师 | 后端 |
|--------|----------|----------|--------|------|
| Sprint 1 | 1 人 | 0 | 0 | 0（API 已就绪） |
| Sprint 2 | 1 人 | 0 | 1 人（Rive 动画） | 0 |
| Sprint 3 | 1 人 | 0 | 0 | 0 |
| Sprint 4 | 1 人 | 1 人（iOS/Android NFC） | 0 | 0.5 人（NFC redeem） |
| Sprint 5 | 1 人 | 1 人（Swift ActivityKit） | 1 人（3D 模型） | 0.5 人（NeRF pipeline） |

---

*计划冻结。Sprint 1 即日开始。*
