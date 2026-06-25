# 跨端宠物升级审计 · 2026-05-20

> 在 desktop 端宠物升级到 **v9 真透明 sprite + 全屏 overlay 透明窗口** 之
> 后,梳理一遍所有 6 端的宠物表达层完成度,确认每端是否需要再次跟进。

## 0. 本周(W4 sprint)宠物侧主要落地

| 提交 | 内容 |
|------|------|
| `5105216b` | Rust 端 pet-companion 改为全屏 overlay + GPU rasterization env var + `set_pet_passthrough` 命令 |
| `b56627f2` | **本次重写**:`PetCompanionWindow.tsx` 切到全屏 overlay 模式(CSS 移动 hitbox / 鼠标进出切 passthrough),`PetSpriteCanvas.tsx` 删除 white→alpha 抠图改用 RGBA 直接合成 |
| `2f32db97` | memories: 记录全屏 overlay 落地的 root cause + acceptance criteria |
| `2f74bda1`(早些时候) | 移动端 Phase C C-1..C-10 一次性落地(sprite animator / haptic+audio fx / tap mini-game / pet diary / missed-you cron) |

---

## 1. 端侧宠物表达完成度

| 端 | 渲染层 | 完成度 | 本次升级是否需要后续动作 |
|----|------|------|----------------------|
| **Desktop (Tauri)** | 全屏透明 overlay + `PetSpriteCanvas`(v9 RGBA sprite,6 动作) | ✅ 100%(本次完成) | **冒烟**:本地 build 完跑一次 happy path,确认无雪花 / 宠物可移动 / 点击穿透 |
| **Mobile (Expo)** | `PetSpriteAnimator`(共享同一份 v9 sprite 资产)+ haptic + audio fx | ✅ 100% | 重新 build APK 让用户拿到 v9 形象(未上线) |
| **Web (Next.js)** | 不渲染活动宠物,只有 PetCreator 工坊 + Marketplace 缩略图 | ✅ 设计性"无"(`agentrix-cross-platform-prd-v4.md` §2 已对齐) | 无 |
| **Watch / Glass** | emoji + complication 缩略图 | ✅ 设计性"硬件不支持 sprite" | 无 |
| **Toy** | OLED/eink 表情 + LED 心跳 | ✅ 设计性"硬件不渲 VRM/Rive" | 无 |

> **结论**:本次 v9 sprite + 全屏 overlay 升级覆盖了**所有应该承载 sprite 的端**。
> Wearable / Toy 不渲染 sprite 是 PRD 已签字的设计决定(硬件性能 + 屏幕尺寸 + 电量约束)。

---

## 2. Desktop 仍需后续动作(本次)

### 2.1 必须冒烟(本机)

- [ ] 启动新 build 的 .exe → 确认:
  1. 无雪花 / 无棋盘格;
  2. 宠物可在屏幕上自由移动(wander loop);
  3. 鼠标在宠物身上时可以拖拽 / 点击 / 长按 / 双击;
  4. 鼠标在宠物身外时点击穿透到桌面或后面的应用;
  5. 右键菜单弹出 / 点击关闭;
  6. 喂食按钮触发 eat 动作(sprite 切换到 `eat.png` 4 帧循环 6 fps)。

### 2.2 短期跟进(下个 sprint)

- [ ] **D-P0-3** Windows SmartScreen 弹窗:本次 build 仍未签名,首启会被
  Windows 拦截。需要 EV 证书或 Azure Trusted Signing。
- [ ] **D-P1-2** 多显示器 + 高 DPI 下 hitbox 精度:全屏 overlay 模式下
  bounds 是当前 `primary_monitor()` 的物理像素,跨屏拖拽尚未测试。
- [ ] **D-P1-4** Vite chunk warning 25+ 处既被 dynamic import 又被 static
  import:此次 build 仍有(每次 + 每次提示),不影响功能但影响 bundle 大小。
- [ ] **D-P2-1** 真实 VRM/Rive 资产仍未下发:目前活动宠物用 sprite,
  PetVRM 渲染器只在 PetCreator 生成 .glb / .vrm 后才被激活。下一个 sprint
  做 PetCreator → seed 默认 VRM URL → PetVRM 自动接管的端到端冒烟。

### 2.3 暂不阻塞 GA

- [ ] D-P2-2 Spotlight 视觉风格(设计师任务)
- [ ] D-P2-3 Cargo 3 处 `dead_code` warning(本次 build 仍有,无影响)

---

## 3. Mobile 仍需后续动作

### 3.1 必须做(让用户拿到 v9 形象)

- [ ] **重新 build APK**:`assets/pets/sprites/default/*.png` 已经被同步成
  v9 RGBA(commit 早就推过去了),但 mobile 上次 build 是 v8 旧 sprite,所以
  用户当前安装包里仍是旧形象。
  - 触发方式:推到 `CutaGames/Agentrix-Claw` 镜像仓即可触发 APK CI。
- [ ] **iOS TestFlight build**:同样需要重新 build 一次。

### 3.2 短期跟进

- [ ] M-P1-4 VRM 高面 PBR 渲染管线(后端 KTX2 / Draco CDN 待补)
- [ ] M-P1-5 Watch / 灵动岛 / 锁屏 widget(若决定做)

---

## 4. Wearable / Toy(无需 sprite 升级,仅记录)

### 4.1 Wearable 当前能力(per `wearable-prd-v4.md`)

- Watch 主宠表达 = 6 emoji + 震动 + Complication 缩略图(本次 v9 sprite **不**应当上 Watch,屏幕太小 + 电量不允许)
- Glass HUD = 字符画 + 简短台词(同上,光学屏幕不渲 sprite)
- 渲染器:**保持 emoji + HUD 字符,不改**

### 4.2 Toy 当前能力(per `toy-prd-v4.md`)

- 物理化身,OLED/eink 表情 + LED + 震动 + TTS
- 不接受 .vrm / .glb / .png sprite;仅接受表情索引(0..9)+ 颜色码 +
  TTS 文本(per §3.1 协议)
- 不需要任何升级

---

## 5. 跨端一致性核对(per cross-platform PRD V4 §4.2 Pet Continuity)

| 项 | Desktop | Mobile | Web | Watch | Glass | Toy | 一致? |
|----|---------|--------|-----|-------|-------|-----|-------|
| 灵魂 ID(`soulTemplateId`) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 当前皮肤 ID(`activeSkinId`) | ✅ | ✅ | ✅ | ⚠️ 缩略图 | ⚠️ HUD emoji | ⚠️ 表情索引 | ✅ 设计性 |
| 6 表情(walk/idle/sleep/sit/jump/eat) | ✅ v9 sprite | ✅ v9 sprite | ✗(无活动宠物) | emoji | HUD | 表情索引 | ✅ |
| 亲密度 XP | ✅ | ✅ | ✅(console/pet) | ✅ Tile | ✅ HUD | LED 心跳频率 | ✅ |
| 主动陪伴(proactive) | `PetProactiveBubble` | `MobilePetProactiveBanner` | ✗ | Tile 一行 | HUD 微通知 | LED + 震动 | ✅ |
| 喂食 / 互动 +XP | 右键菜单"喂食" | 长按 + Tap mini-game | ✗ | ✗ | ✗ | NFC 触碰 | ✅ |
| 日记(diary) | ✗(本次未拉过来) | `PetDiaryCard` | ✗ | ✗ | ✗ | ✗ | ⚠️ 桌面端可补 |
| missed-you cron | 服务端共用 | ✅ 接收 banner | ✗ | ✅ Tile 通知 | ✅ HUD | ✅ LED + 震动 | ✅ |

### 5.1 唯一对齐缺口

桌面端目前**没有把 `PetDiaryCard` 拉过来**(右键菜单或宠物窗口的卡片层都
可以放)。这是非阻塞的小缺口,如果用户希望桌面也能看 mood 日记,可以做一个
轻量级的桌面 PetDiaryCard 组件复用 `/v1/pet/diary/recent` 接口。

---

## 6. 下一步建议(优先级排序)

1. **(本机当下)** 等 desktop build 出 .exe → 跑冒烟 → 截图 / 录屏给团队
2. **(W5 sprint)** 触发 mobile mirror push 让用户的 APK 拿到 v9 形象
3. **(W5 sprint)** 做桌面端 PetDiaryCard(对齐 mobile 的「每日心情」功能)
4. **(W6 sprint)** 重新跑 desktop go-live audit,把过期的 `DESKTOP_GO_LIVE_AUDIT_2026-05-15.zh-CN.md` 替换成 0520 版本
5. **(GA 阻塞)** D-P0-3 Windows SmartScreen / 代码签名

---

## 7. 文件索引

- `desktop/src/components/PetCompanionWindow.tsx` — 全屏 overlay 模式,本次重写
- `desktop/src/components/PetSpriteCanvas.tsx` — 直接 RGBA 合成,本次精简
- `desktop/src-tauri/src/pet_window.rs` — 全屏 overlay Rust 端
- `desktop/public/pets/sprites/default/*.png` — v9 RGBA sprite(在 desktop 资产目录)
- `assets/pets/sprites/default/*.png` — 同一份 sprite 镜像到 mobile expo 资产目录
- `src/components/pet/PetSpriteAnimator.tsx` — 移动 sprite 渲染器
- `src/components/pet/PetDiaryCard.tsx` — 移动每日日记
- `src/components/pet/PetTapGameModal.tsx` — 移动 mini-game
- `src/services/petInteractionFx.ts` — 移动 haptic + audio fx
- `backend/src/modules/pet-companion-engine/pet-companion-engine.service.ts` — missed-you cron
- `backend/src/modules/living-pet/pet-diary.*` — 日记后端

---

> 本文档由本次 sprint(W4)结束后生成,作为下个 sprint 起跑前的对齐基线。
