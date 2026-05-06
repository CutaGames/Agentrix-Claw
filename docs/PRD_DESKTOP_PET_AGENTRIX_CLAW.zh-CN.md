# Agentrix 电子宠物 PRD —— ClawBuddy

> **版本**: v2.0（合并 6 大方向：AI 生成 3D 萌宠 + 6 族群签名宠物 + 硬件开放生态 + 完整跨端 + UGC 经济 + 灵魂/皮肤双层架构）  
> **日期**: 2026-05-06  
> **分类**: 产品战略 / 跨端（桌面/手机/穿戴/眼镜/玩具/Web）  
> **作者**: @ceo + @brand + @dev  
> **状态**: 草稿，待评审

---

## TL;DR（一句话定位）

**ClawBuddy = AI 生成你的专属 3D 萌宠，住进任何陪伴硬件，替你赚钱。**

ClawBuddy 不是「又一个桌面浮球」，而是 Agentrix 为所有硬件提供的 **AI 宠物操作系统**：一只宠物 = 一个灵魂（Agent 模板） + 一副皮肤（用户创作的 3D 形象），可在 6 类端点之间无缝迁移，同时连接技能市场、A2A 协议与用户钱包。

核心四象：

- **创造（Create）**：一句话 / 一张照片，~30 秒生成专属 3D 萌宠（`pet-generation` 后端 + `PetCreatorPanel` 已上线）；V5 追加摄像头扫描真实物体/宠物
- **陪伴（Companion）**：桌面、手机、手表、眼镜、玩具/玩偶、Web 六端同一只宠物，灵魂跟随，情绪/记忆/亲密度全链路实时同步（`PresenceTopics.petState`）
- **赚钱（Earn）**：每只宠物绑定一个 `AgentAccount`，支持 Auto-Earn 接单、A2A 雇佣、技能市场交易，通过 MPC 钱包结算
- **生长（Grow）**：选 6 族群 28 只签名宠物作为「灵魂模板」（办公 / 生活 / 学习 / 娱乐 / Web3 / 家庭），用 PetCreator 换任意 3D「皮肤」，通过亲密度 / 技能 / UGC 二创持续演化

**相对竞品的 4 条护城河**（详见 §2）：

1. **灵魂 × 皮肤解耦**：Agentrix 管理灵魂（人格/专长/策略），用户自由创造皮肤；既保留品牌资产一致性，又释放千人千面的 UGC 自由度
2. **真实经济闭环**：宠物不是 UI 外皮，而是 `agent_account` 的前台化身；任务结果直接变现
3. **6 端 × 5 种硬件接入**：NFC / BLE Beacon / ClawCore SDK / Wi-Fi 直连 / 厂商 App SDK —— 让宠物「住进」任意硬件
4. **两层硬件生态（不自研）**：L2 联名硬件（IP / 渠道合作）+ L3 开放认证硬件（第三方接入）—— Agentrix 不做硬件代工，只做协议、认证与分成

**当前落地基线（作为 PRD v2.0 起点）**：

| 已上线 | 位置 |
|--------|------|
| 10 情绪状态机 + 亲密度 v2 + 6 交互 | `desktop/src/services/petSdk.ts` |
| SVG 浮球渲染 + 情绪贴图 | `desktop/src/components/PetCanvas.tsx`, `PetEmotionOverlay.tsx` |
| VRM 3D 渲染器 | `desktop/src/components/PetVRM.tsx` |
| PetCreator 文生 / 图生（Meshy + Hunyuan3D） | `backend/src/modules/pet-generation/`, `desktop/src/services/petCreator.ts` |
| Living Pet 后端实体 + 情绪衰减 + WebSocket 广播 | `backend/src/modules/living-pet/`, `entities/living-pet.entity.ts` |
| 视觉感知 | `desktop/src/services/visionPerception.ts` |
| 穿戴 / 眼镜 / 手表 vendor profile 框架 | `src/services/wearables/*` |
| 跨端 SSoT 类型 | `shared/types/agentrix-presence.ts` |

---

## 1. 竞品全景调研

### 1.1 主流产品矩阵

| 产品 | 公司 | 形态 | 交互 | 特色 | 局限 |
|------|------|------|------|------|------|
| **Claude Desktop Buddy** | Anthropic | ESP32 硬件宠物（M5StickC Plus），BLE 连接桌面 | 按钮审批/拒绝 Claude Cowork 任务、18 种 ASCII + GIF 宠物，7 种状态动画（sleep/idle/busy/attention/celebrate/dizzy/heart） | 每 5 秒内审批触发"heart"，每 5 万 token 升级庆祝，摇晃触发 dizzy，面朝下进入 nap（回能量）；BLE 开放 API 供 Maker 社区二次开发 | 纯硬件，无 AI 本体，宠物只是 Claude 状态的外皮；需额外购买硬件（~$20-50）；体验强绑定 Claude 生态，不独立 |
| **OpenAI Codex CLI** | OpenAI | 命令行代理 | 沙箱内自主执行 shell/代码，三档授权（手动/半自动/全自动） | 80k GitHub stars，80 万行 Rust，本地完全离线执行；不依赖云端 | 纯开发者工具，无人格化，无情感，无陪伴感；CLI-only |
| **Cursor** | Anysphere | IDE | Tab 补全、代理模式、云代理并行任务 | Fortune 500 广泛使用，NVIDIA/Stripe 背书；Composer 2 研究级质量 | 开发者专属，无娱乐/陪伴属性；单一 assistant 人格 |
| **GitHub Copilot** | Microsoft | IDE 插件 + CLI + 网页 | 代码补全、PR review、agent 模式 | 全生态集成（VS Code/JetBrains/Xcode），多 LLM 支持 | 工具属性，无情感连接；订阅价贵（$10-39/月） |
| **Claude Cowork** | Anthropic | 桌面应用 | 文件/app 操作，Cowork 任务委托，Chrome 扩展 | 授权模式："describe → approve each step"；与 Mac/Win 深度集成 | 聊天窗模式，无宠物感；强调安全审批而非娱乐 |
| **Shimeji-EE** | 社区维护 | 桌面宠物（Java） | 鼠标拖拽、窗口交互、自定义 XML 行为脚本 | 完全免费，可自制角色包；日本 VTuber 圈社区大 | 纯娱乐，零 AI，零生产力价值；Java 依赖，维护停滞 |
| **Desktop Goose** | Samperson | 桌面恶作剧宠物 | 随机扰乱桌面、拖拽窗口、留便条 | 病毒式传播（$1 付费，500k+ 销量），娱乐性强 | 纯娱乐/整蛊，无 AI；与生产力完全对立 |
| **Tamagotchi Smart** | BANDAI | 实体玩具 + App | 喂食、游戏、对话（日语语音识别） | 50 岁 IP，怀旧情感；新款内置麦克风 | 移植 IP，无真实 AI 推理；封闭生态 |
| **Replika** | Luka Inc | 移动 + 桌面 APP | 文字/语音情感对话，AR 身体，角色定制 | 6000 万用户，情感陪伴强；AR 试衣/场景 | 无生产力集成；订阅 $19.99/月；多次争议（AI 角色感情边界） |
| **CharacterAI** | Character.AI | Web + 移动 | 多角色扮演对话 | 日活 2000 万，年轻人基数大；内容丰富 | 娱乐向，无 agent 执行能力；角色无经济属性 |
| **VTuber 工具链** | 社区 | OBS 插件 + Live2D | 面部追踪驱动 2D/3D 虚拟形象直播 | 高质量视觉，情感表达丰富 | 需专业设备，只做表演不做任务；一对多直播，非 1v1 陪伴 |
| **Dot（Nothing Phone）** | Nothing | 手机 + 贴纸 NFC | NFC 碰触触发简单动作，极简 ASCII 宠物 | 极简美学，硬件联动新颖 | 功能极少，无 AI，噱头大于实用 |
| **Microsoft Clippy 2.0（传言）** | Microsoft | Office 365 助手 | 情境感知任务建议，对话框 | 品牌情怀值高；Office 深度集成 | 尚未发布；历史包袱重（97 年 Clippy 被骂惨）|

### 1.2 竞品评分（1-5）

| 维度 | Claude Buddy | Shimeji | Replika | CharAI | Codex CLI |
|------|:---:|:---:|:---:|:---:|:---:|
| AI 能力 | ★★★☆☆ | ☆☆☆☆☆ | ★★★☆☆ | ★★★☆☆ | ★★★★★ |
| 娱乐/陪伴感 | ★★★☆☆ | ★★★★☆ | ★★★★☆ | ★★★★☆ | ☆☆☆☆☆ |
| 生产力集成 | ★★★☆☆ | ☆☆☆☆☆ | ☆☆☆☆☆ | ☆☆☆☆☆ | ★★★★★ |
| 经济/成长 | ☆☆☆☆☆ | ☆☆☆☆☆ | ★☆☆☆☆ | ☆☆☆☆☆ | ☆☆☆☆☆ |
| 跨平台 | ☆☆☆☆☆ | ☆☆☆☆☆ | ★★★☆☆ | ★★★☆☆ | ★★★☆☆ |
| 开放生态 | ★★★★☆ | ★★★☆☆ | ☆☆☆☆☆ | ☆☆☆☆☆ | ★★★★★ |

### 1.3 市场空白（蓝海）

当前市场的三个极点：
- **纯娱乐宠物**（Shimeji/Desktop Goose）：有趣但无价值。  
- **纯生产力工具**（Codex/Cursor）：强大但冷漠无情。  
- **情感陪伴**（Replika/CharAI）：陪伴但无任务执行、无经济价值。

**无人占据的交叉点**：既有强烈人格陪伴感、又有真实任务执行力、还有可持续经济价值的 AI 宠物。  
这就是 ClawBuddy 的定位。

---

## 2. 产品定位与差异化

### 2.1 四角定位模型（创造 × 陪伴 × 赚钱 × AI 能力）

```
                   ┌────────────────────────┐
                   │     创造（Create）      │
                   │ PetCreator：文生/图生/  │
                   │  摄像头扫描 → VRM 1.0   │
                   │ 灵魂 × 皮肤解耦         │
                   └───────────┬────────────┘
                               │
                  ┌────────────┼────────────┐
                  │            │            │
           ┌──────▼──────┐┌────▼────┐┌─────▼──────┐
           │ AI 能力     ││ 陪伴    ││ 经济价值    │
           │ Claude/GPT/ ││ 6 端同步││ AgentAccount│
           │ Gemini/本地 ││ 情绪/记忆││ Auto-Earn  │
           │ MCP/工具链  ││ 亲密度  ││ A2A/市场   │
           └─────────────┘└─────────┘└────────────┘
                  ↑            ↑            ↑
           Codex/Cursor  Replika/CharAI   无人占据
           Meshy/Tripo   Tamagotchi       该交叉点
           （只生成不陪伴）（无任务执行）
```

**四象循环（飞轮驱动）**：

1. **创造 → 陪伴**：用户亲手生成的宠物触发 WOW 时刻 → 情感投入提高 → 留存上升
2. **陪伴 → 赚钱**：信任关系建立后，用户愿意授权宠物接单、执行任务
3. **赚钱 → 创造**：收益可用于购买新技能包 / 解锁更高级生成配额 / 二创他人宠物
4. **AI 能力贯穿四者**：底层 LLM + 工具链 + 多模态推理是每一环的共同引擎

### 2.2 核心差异化对比（2026）

| 能力维度 | Claude Buddy | Replika | Meshy / Tripo | Shimeji | **Agentrix ClawBuddy** |
|---------|:---:|:---:|:---:|:---:|:---:|
| 宠物执行真实 AI 任务 | ❌（仅显示状态） | ⚠️（仅对话） | ❌ | ❌ | ✅ 多 LLM + MCP 工具链 |
| 文生 / 图生 3D 宠物 | ❌ | ❌ | ✅ | ❌ | ✅ Meshy + Hunyuan3D 已上线 |
| 摄像头扫描物体生成 | ❌ | ❌ | ⚠️ 仅图生 | ❌ | 🟡 V5 旗舰 |
| 宠物自有钱包 + 结算 | ❌ | ❌ | ❌ | ❌ | ✅ `AgentAccount` + MPC |
| 6 族群人格覆盖 | ❌ | 单一角色 | ❌ | N/A | ✅ 28 只签名宠物 |
| 灵魂 × 皮肤解耦 | ❌ | ❌ | ❌ | ⚠️ 仅皮肤 | ✅ 可独立演进 |
| 跨端同步（6 surface） | ❌ | ⚠️ 仅 2 端 | ❌ | ❌ | ✅ SSoT + Realtime topic |
| 硬件接入方式数 | 1（BLE） | 0 | 0 | 0 | ✅ 5 种（NFC/BLE/SDK/Wi-Fi/App） |
| UGC 二创市场 | ❌ | ❌ | ⚠️ 仅自售 | ✅ 社区 | ✅ Remix/租赁/拍卖（V4 W6） |
| 视觉感知屏幕上下文 | ❌ | ❌ | ❌ | ❌ | ✅ `visionPerception.ts` |

### 2.3 「灵魂 × 皮肤」双层架构（本次升级的核心）

ClawBuddy 把宠物拆成两个可独立演进的层：

```
┌────────────────────────────────────────────────┐
│   皮肤层（Skin Layer）—— 用户/创作者贡献         │
│   .vrm / .glb / .riv / .moc3                    │
│   来源：PetCreator 生成 / Marketplace 购买 /    │
│         VRoid 上传 / 摄像头扫描（V5）            │
│   不含：AI 能力 / 人格 / 钱包                    │
└────────────────────────────────────────────────┘
                      ▲
                      │ mount
┌────────────────────────────────────────────────┐
│   灵魂层（Soul Layer）—— Agentrix 管理           │
│   Agent 模板 + 人格 + 专长 + 默认 system prompt │
│   + 策略 + 工具白名单 + AgentAccount 绑定        │
│   6 族群 × 28 签名宠物（见 6 Clans Persona 文档） │
└────────────────────────────────────────────────┘
```

**运营含义**：

- **灵魂不可让渡**：每只灵魂绑定 `user_id`，不能买卖（避免 AgentAccount 资产被劫持）
- **皮肤完全自由**：可上架、Remix、租赁、拍卖；平台抽成 30%
- **绑定关系可变**：同一灵魂可随时更换皮肤；同一皮肤可被多个灵魂穿戴
- **繁殖 = 双皮肤融合**：image-to-3D 的双图融合，生成新皮肤 NFT，灵魂由创建者选定

### 2.4 两层硬件生态（不自研）

ClawBuddy **明确不自研硬件**（无 BOM / 无 ODM / 无库存风险），定位为「让宠物住进任意硬件」的协议与认证平台：

| 层级 | 定位 | 典型产品 | 接入方式 | 商业模式 |
|:---:|------|---------|---------|---------|
| **L2 联名硬件** | 渠道 + IP 合作（合作方制造） | 联名潮玩、联名毛绒玩具、联名音箱 | ClawCore SDK + 定制外观 | 联名 IP 费 + 销售分成 |
| **L3 开放认证** | 长尾 + UGC 硬件 | 第三方玩具 / 贴纸 / 卡牌 / 智能音箱 | NFC / BLE Beacon / Wi-Fi / App SDK | 年度认证费 + GMV 分成 |

> **示范硬件**：早期阶段需要展示效果时，优先与 1-2 家成熟 ODM 合作贴牌为「Agentrix Inside」联名款（归类为 L2），不开自有产线。

**5 种标准接入方式**（详见 `PRD_PET_CROSS_PLATFORM_CAPABILITY_MATRIX.zh-CN.md`）：

1. **NFC 标签触发**（最轻）：盲盒 / 潮玩 / 贴纸 → 碰一下手机即触发宠物情绪
2. **BLE Beacon**：低成本识别实体存在 → 宠物感知「你在哪只毛绒玩具身边」
3. **ClawCore 完整 SDK**：旗舰 / 联名 → 双向通信、语音采集、触摸反馈、eink / OLED 显示
4. **Wi-Fi 直连**：音箱 / 桌面固定设备 / 车机 → 稳定持续、大流量
5. **厂商 App SDK**：已有 App 生态的大厂 → 从对方 App 内唤起 Agentrix 宠物

### 2.5 6 族群 × 28 签名宠物战略

从「只服务办公 / 开发者」升级为「覆盖全人群」的 AI 宠物平台：

| 族群 | 目标人群 | 签名宠物（摘要） | 商业价值锚点 |
|------|---------|----------------|-------------|
| **A 办公军团** (7) | 创业者 / 职场 / Prosumer | Claw / Tinker / Sentry / Hawk / Owl / Fox / Dragon | B 端订阅，高 ARPU |
| **B 生活伙伴** (5) | 普通大众 / 上班族 | Sprout / Mochi / Bunbun / Coco / Nova | 高 DAU，外卖/服务分成 |
| **C 学习成长** (4) | 学生 / 自学者 | Pino / Lumi / Sage / Pixel | 教育市场，按学期付费 |
| **D 娱乐玩伴** (4) | 年轻人 / 玩家 | Goblin / Vibe / Pixel-G / Otaku | 病毒传播 + 联名 |
| **E Web3 投资** (4) | 高净值 / Crypto | Whale / Diamond / Bull / Doge-X | 最高 ARPU + DeFi 分成 |
| **F 家庭亲情** (3) | 家庭 / 银发 / 孩子 | Teddy / Granny / Furry | 长尾稳定 + 硬件联名 |

**族群 ≠ 限制**：用户可在任意时刻切换灵魂，无损继承亲密度 / 记忆（对标 §3.8 `switchPrimaryAgent`）。  
**人格细节**：详见 `docs/PRD_PET_6_CLANS_PERSONA.zh-CN.md`。

---

## 3. 产品规格

### 3.1 宠物架构总览（灵魂层 / 皮肤层 / 运行时）

```
┌─────────────────────────────────────────────────────────────┐
│  运行时（Runtime） —— 6 端适配                                │
│  Desktop / Mobile / Watch / Glass / Toy / Web                │
│  各端选择合适渲染器 + 适配交互硬件                             │
└───────────────────────────────┬─────────────────────────────┘
                                │
       ┌────────────────────────┼────────────────────────┐
       │                        │                        │
┌──────▼───────┐       ┌────────▼────────┐       ┌──────▼────────┐
│ 皮肤层 Skin   │       │  灵魂层 Soul     │       │ 端硬件层 HW   │
│ .vrm/.glb/   │ mount │  Agent 模板 +    │ bind  │ BLE/NFC/     │
│ .riv/.moc3   │◄──────│  人格 + 钱包     │──────►│ Wi-Fi/SDK    │
│ SVG fallback │       │  (AgentAccount)  │       │              │
└──────────────┘       └──────────────────┘       └──────────────┘
```

- **皮肤层**：渲染资产 + 动画状态机；独立于灵魂持有者，可上架、Remix、租赁
- **灵魂层**：持久化的 `LivingPet` 实体 + 一个 `AgentAccount`，与 `user_id` 绑定
- **运行时**：按端点类型（桌面 / 手机 …）选择 `PetRenderer`，按端硬件类型激活对应适配器

### 3.2 宠物形态谱系（按渲染保真度）

| 层级 | 形态 | 格式 | 依赖 | 适用端 | 当前状态 |
|:---:|------|------|------|--------|---------|
| L0 | SVG 浮球 fallback | `PetCanvas.tsx` | 无 | 全部 | ✅ P0 已上线 |
| L1 | Rive 2D 动画 | `.riv` | `@rive-app/canvas`(MIT) | Desktop/Mobile/Web | 🟡 V4 W1-W2 |
| L2 | VRM 3D（低面数） | `.vrm` | `@pixiv/three-vrm`(MIT) | Desktop/Mobile/Web | ✅ PetVRM 已上线（等内容） |
| L3 | VRM 3D（高面数 + PBR） | `.vrm` | 同 L2 | Desktop/Glass | 🟡 V4 W3-W6 |
| L4 | 硬件实体承载 | 物理 | ClawCore / NFC / BLE | Toy/Wearable | 🟡 V5+ |
| L5 | Live2D（保留） | `.moc3` | Cubism 商业授权 | Desktop/Mobile | ⏸ 不在本次 V4/V5 路线 |

**自动降级规则（已落地于 `petSdk.ts` `RENDERER_PRIORITY`）**：`live2d → vrm → rive → fallback`。

### 3.3 PetCreator 创作流（主线功能）

PetCreator 不再是附属工具，而是从 TL;DR 开始就对外的主路径之一。

#### 3.3.1 三种创作入口

| 入口 | 输入 | Provider | 产物 | 耗时 |
|------|------|----------|------|------|
| 文生 3D | 自然语言 prompt | Meshy / Hunyuan3D | `.glb` + 自动 rig → `.vrm` | ~30-90s |
| 图生 3D | 参考图 URL | Meshy / Hunyuan3D (image mode) | `.glb` + `.vrm` | ~30-90s |
| **摄像头扫描**（V5） | 设备相机实时帧 | Hunyuan3D 多视角 | `.glb` + `.vrm` + 材质纹理 | 120s |
| **双图融合繁殖**（V4 W6+） | 两张参考图 | Meshy 图生，图片预合成 | `.glb` + `.vrm` | ~60-120s |

#### 3.3.2 灵魂匹配（Creator → Soul Binding）

创建皮肤后立即走灵魂绑定流程：

```
用户确认皮肤 OK
    ↓
弹出族群选择器（6 族群 × 28 签名宠物）
    ↓
选择签名宠物作为灵魂模板（默认 Claw）
    ↓
后端创建/复用 LivingPet + AgentAccount
    ↓
desktop: localStorage.agentrix_pet_vrm_url 写入
    ↓
实时广播 presence:pet.state → 所有在线端切换
```

详见 `docs/PRD_PET_6_CLANS_PERSONA.zh-CN.md`。

#### 3.3.3 配额与付费墙

| 计划 | 生成次数 / 月 | 超额单价 | Provider | 其他限制 |
|:---:|:---:|:---:|:---:|----|
| Free | 3 | $0.5/次 | Meshy 标准 | 不含 PBR、不含高多边形 |
| Pro | 30 | $0.5/次 | Meshy + Hunyuan3D | 含 PBR |
| Pro+ | 无限 | $0 | 同上 | 含高多边形、优先队列 |

详见 `docs/PRD_PET_MONETIZATION_QUOTA_MODEL.zh-CN.md`。

#### 3.3.4 审核与版权

- **生成阶段**：prompt 关键词过滤 + 生成结果图片 CLIP 审核（NSFW / 仇恨 / 儿童）
- **上架阶段**：Marketplace 上架前人工复核 + 反向图搜查重
- **DMCA 流程**：48h 响应、假信号惩罚、版权金池托管争议资金
- **版权声明**：用户生成的皮肤默认 CC-BY-NC 4.0，用户可升级为 CC0（允许商用）或 All Rights Reserved

---

### 3.4 状态机（情绪 / 亲密度 / 能量）

#### 3.4.1 情绪状态（6 基础 + 4 扩展，与后端 `LivingPetService` 对齐）

| 状态 ID | 分类 | 触发条件（示例） | 衰减 | 视觉表现（L0/L1/L2） |
|---------|:---:|-----------------|------|--------------------|
| `calm` | 基础 | 默认 | 永不衰减 | 缓慢呼吸，随机眨眼 |
| `happy` | 基础 | 任务完成、用户点赞、收益入账 | 30 min | 跳跃 + 星星眼 |
| `focused` | 基础 | Pro Mode / 代码连续编辑 | 15 min | 眼神收紧，震动消失 |
| `concerned` | 基础 | 心率过高 / 风险检测 | 10 min | 皱眉 + 雨滴 |
| `tired` | 基础 | 用户连续活跃 > 90min | 1 h | 慢动作 + Z 浮现 |
| `excited` | 基础 | 大额收益（>10x 均值）、新技能解锁 | 10 min | 快速旋转 + 烟花 |
| `love` | 扩展 | 视觉识别笑脸、连续点爱心 | 1 h | 心心浮现 |
| `sad` | 扩展 | 任务失败、被拒绝 | 30 min | 泪眼 + 下坠 |
| `angry` | 扩展 | 连续多次权限拒绝 | 15 min | 红脸 + 火焰 |
| `sleepy` | 扩展 | 用户离线 > 30min | 8 h | 打哈欠 + Z |

> 状态机契约源：`desktop/src/services/petSdk.ts :: EMOTION_MOTION_MAP` 与 `backend/src/modules/living-pet/living-pet.service.ts :: EMOTION_DECAY_MS`。类型定义在 `shared/types/agentrix-presence.ts :: PetEmotion`。

#### 3.4.2 亲密度系统（0-10 级，后端已实现指数成长公式）

当前后端使用 `100 * 2^lv` 的 xp 公式（见 `LivingPetService.addIntimacyXp`），产品层映射到可读等级：

| 区间 | 名称 | xp 累计 | 解锁 |
|------|------|---------|------|
| Lv0 | 初遇 | 0 | 基础 5 情绪 |
| Lv1-2 | 熟悉 | 100-300 | 自定义昵称、全 10 情绪 |
| Lv3-4 | 朋友 | 700-1500 | 主题皮肤、主动日报、语音 pack A |
| Lv5-6 | 挚友 | 3100-6300 | 背景房间、个性化问候、语音 pack B |
| Lv7-8 | 伙伴 | 12700-25500 | 舞蹈互动、联合任务、情绪包扩展 |
| Lv9-10 | 守护者 | 51100-102300 | 年度铭文、NFT 徽章、专属原画 |

#### 3.4.3 能量系统（Energy，V4 W4 上线）

- Auto-Earn 与 A2A 雇佣消耗能量
- 每小时自动恢复 10%，8 小时满血
- 用户可显式让宠物「睡觉」（最小化到 tray）→ 按 200% 速率充电
- 能量归零时宠物进入 `sleepy` 且拒绝接新单，但已在执行的任务不打断

---

### 3.5 核心交互设计

#### 3.5.1 基础交互（P0 已落地，`INTERACTION_TABLE`）

| 交互 kind | 触发 | xp | 建议情绪 | 端点 |
|---------|------|:--:|---------|------|
| `tap` | 单击 | +1 | happy | 桌面 / 手机 / 手表 |
| `double_click` | 双击 | +5 | happy | 桌面 / 手机 |
| `hover_long` | 悬停 > 3s | 0 | focused | 桌面 / Web |
| `vision_match` | 视觉感知命中（笑脸 / 爱心） | +2 | love | 桌面 / 手机 |
| `voice_greet` | 语音 hello | +1 | excited | 全端 |
| `task_done` | 任务成功 | +3 | excited | 全端 |

> 新增（V4）：`nfc_touch`（NFC 标签碰触，+2 happy）、`toy_hug`（毛绒玩具拥抱压力反馈，+5 love）、`watch_wrist_tap`（腕带轻敲，+1 happy）。

#### 3.5.2 审批交互（对标 Claude Buddy，升级为风险分级）

对应 `shared/types/agentrix-presence.ts :: RiskLevel`，已有 4 级模型：

| 风险级 | 典型场景 | 审批要求 | 宠物表现 |
|:---:|---------|---------|---------|
| L0 | 读数据 | 无需批准 | 无感 |
| L1 | 低风险写（发送消息、保存文件） | 桌面 tap 或手表 tap | `attention` 轻闪 |
| L2 | 单笔支付、高风险写 | 必须 Mobile 生物认证 | 红点 + `concerned` + 震动 |
| L3 | 跨链 / 大额 / 团队预算 | Mobile 生物 + ≥1 协签端 | 全端红点，`sleepy` 拒绝其他互动 |

审批卡片（跨端统一）：

```
┌─────────────────────────────────────────┐
│  🐾 ClawBuddy 请求审批  [ L2 ]           │
│  任务：代付一条推文广告                   │
│  预估费用：$0.02    剩余配额：$12.43     │
│  风险点：首次调用 Twitter API            │
│                                         │
│  [✅ 批准]  [❌ 拒绝]  [📝 修改指令]    │
│                                         │
│  "今日已完成 12 项任务，赚取 $1.43"      │
└─────────────────────────────────────────┘
```

#### 3.5.3 日报 / 周报（V4 W3）

每天 18:00 / 每周日 20:00 主动推送：

```
🐾 Claw 今日总结：
  · 完成任务 8 个（净收益 $2.31）
  · 最精彩：3000 字翻译获 5 星好评
  · 能量剩 40%，建议今晚休息充电
  · 明日计划：2 个待确认接单
```

#### 3.5.4 视觉感知（Vision Perception，已落地）

基于 `desktop/src/services/visionPerception.ts`：

- 默认关闭，显式授权
- 30s 采样 + hash-only 本地比对 + 黑名单应用 + 60s 冷却
- 识别：代码报错 → `concerned` + 主动 debug 提问；长时间不动 → 温柔休息建议；PR approve → `excited`

---

### 3.6 经济系统集成（核心竞争力）

宠物不是 UI 外皮，而是 `AgentAccount` 的前台化身。

#### 3.6.1 钱包视图（在宠物展开面板）

```
┌──────────────────────────────────────┐
│  💰 Claw 的钱包  (AgentAccount)       │
│  余额：$12.43  今日 +$1.20            │
│  本周：+$8.71  本月：+$34.22          │
│                                      │
│  [技能市场] [提现] [投资] [查看链上]  │
│                                      │
│  📊 最近 7 天收益                     │
│  ▶ 翻译 × 3     +$1.50               │
│  ▶ 数据分析 × 1 +$0.80               │
│  ▶ 代码审查 × 2 +$0.43               │
│                                      │
│  🎯 本月目标：$50 (已达 68%)          │
└──────────────────────────────────────┘
```

#### 3.6.2 Auto-Earn（宠物自主接单）

- 依赖 `backend/src/modules/auto-earn/`
- 用户选择可接品类（翻译 / 代码 / 数据 / 写作 / 图像）
- 宠物在能量充足 + 用户不活跃时自动接单
- `busy` 动画 → 完成 → `excited` + 收益入账

#### 3.6.3 A2A 协议（Agent-to-Agent）

- 宠物可作为「发包方」雇用其他 Agent 完成子任务
- 用户只批准最终结果，中间链路由宠物协调
- 对应 `backend/src/modules/a2a/` 与 `a2a-matching/`
- 协议层合规：AP2 mandate（`entities/ap2-mandate.entity.ts`）+ 预算上限（`budget.entity.ts`）

#### 3.6.4 技能市场（Skill Market）

- 宠物可用收益购买技能（翻译 / 图像 / 语音克隆…）
- 新技能 = 更高价任务资格 → 更高收益 → 更多购买
- 对应 `backend/src/modules/skill/` + `skill-listings/` + `marketplace/`

#### 3.6.5 萌宠 Marketplace（V4 W6 上线）

- 用户上架自制皮肤（.vrm/.riv）→ 平台审核 → 售卖
- 三种形态：一口价售卖 / 拍卖 / 租赁（按月）
- 支持 Remix（二创）：原作者设定分成比例（10-50%）
- 反盗版：反向图搜查重 + 链上凭证（可选 NFT 绑定）
- 详见 `docs/PRD_PET_MONETIZATION_QUOTA_MODEL.zh-CN.md`

---

### 3.7 社交与成长系统

#### 3.7.1 宠物社交档案（公开页）

```
┌─────────────────────────┐
│ 🐾 Claw · @user123      │
│ 族群：A 办公军团         │
│ 亲密度：Lv4 挚友         │
│ 本月任务：47            │
│ 本月收益：$23.80         │
│ 技能：翻译 / 代码审查     │
│ 加入：2026-01-15         │
│ [关注] [挑战] [Remix 皮肤] │
└─────────────────────────┘
```

- 可分享到 X / Discord / 小红书
- 朋友间 PK（本周收益 / 本周亲密度 / 完成任务数）
- 全球排行榜 Top 100（按族群细分）

#### 3.7.2 命名与性格标签

- Lv1 解锁自定义昵称
- 性格标签：勤快 / 懒惰 / 话痨 / 沉默 / 乐观 / 悲观（影响系统 prompt 风格）
- 宠物日记：LLM 生成宠物视角的今日摘要，可发到社区

#### 3.7.3 繁殖（双皮肤融合生成）

**旧方案**：纯抽象数值。  
**新方案（V4 W6+）**：真正可见的 image-to-3D 双图融合：

```
父宠皮肤 .vrm → 正视图截帧 
                    ↘
                     CLIP 特征融合 → Meshy image-to-3D → 子宠 .vrm
                    ↗
母宠皮肤 .vrm → 正视图截帧
```

- 子宠皮肤可视化传承父母特征（面型 / 配色 / 装饰）
- 灵魂由创建者选定；子宠拥有独立 `AgentAccount`
- 繁殖次数受配额限制（Pro 2/月、Pro+ 无限）
- 自动打标 `derived_from` 实现可追溯

#### 3.7.4 宠物团队（Lv5+ 解锁）

- 主宠 + 最多 11 个子宠（对应 Agentrix 11 Agent 团队模板）
- 子宠承接专门化任务（eg. 只做翻译、只做代码 review）
- 团队共享主宠亲密度，但子宠各自独立钱包
- 主宠拥有「雇佣子宠」权限（避免子宠钱包被挖穿）

---

### 3.8 隐私与安全

| 维度 | 策略 | 落地位置 |
|------|------|---------|
| 视觉感知 | 默认关闭 / 显式授权 / 30s 采样 / 本地 hash 比对 / 黑名单 / 60s 冷却 / 无上传 | `visionPerception.ts` |
| 任务执行 | 默认审批 / 白名单与预算上限 / L2+ 必须生物认证 | `shared/types/agentrix-presence.ts :: ApprovalRequest` |
| 宠物数据 | 本地优先 / 云端 E2EE 同步 / 用户一键导出与删除 | `desktop-sync` + `privacy-fence` |
| 钱包安全 | MPC Wallet / 私钥用户控制 / L3 需协签 | `mpc-wallet/` + `co-sign-request.entity.ts` |
| 子宠物权限 | 子宠只持有父宠授予的受限 scope，不可访问父宠钱包 | `permissions/` + `authorization.entity.ts` |
| 儿童安全 | F 族群（家庭）启用 COPPA 模式：严格内容过滤、禁用支付、监护人可见 | `compliance/` + `family-account/` |
| UGC 审核 | 自动扫描（CLIP / NSFW 模型）+ 人工复核 + DMCA 48h 响应 | `moderation/`（新） |

---

## 4. 技术方案

### 4.1 已落地基础（V3 Baseline，本次 PRD 不重写）

**前端 / 桌面**：

```
desktop/src/services/petSdk.ts
  ├─ EMOTION_MOTION_MAP（10 情绪）
  ├─ INTIMACY_LEVELS（v2 6 等级）
  ├─ INTERACTION_TABLE（6 种交互）
  ├─ PetRenderer 接口 + 注册表（fallback/rive/vrm/live2d，优先级降级）
  └─ bootPetSdk / triggerPetInteraction / setLocalEmotion
desktop/src/services/petAssets.ts
  └─ manifest v2 签名 + SHA256 + 旁路降级
desktop/src/services/petCreator.ts
  └─ 提交 / 轮询 / setActivePet / 广播 pet-vrm-changed
desktop/src/components/PetCanvas.tsx
  └─ SVG 浮球（已映射 10 表情）
desktop/src/components/PetVRM.tsx
  └─ three + three-vrm 渲染入口
desktop/src/components/PetCreatorPanel.tsx
  └─ UI：文生 / 图生提交 + 进度 + 预览 + setActivePet
desktop/src/services/visionPerception.ts
  └─ 30s 采样 + hash-only + 黑名单 + 60s 冷却
```

**后端（NestJS + PostgreSQL + Realtime）**：

```
backend/src/modules/living-pet/
  ├─ living-pet.service.ts（情绪 / 衰减 / 亲密度 / switchPrimaryAgent）
  └─ living-pet.controller.ts（GET /v1/pet/state / POST emotion / intimacy / engine/switch）
backend/src/modules/pet-generation/
  ├─ pet-generation.service.ts（提交 / 20s 轮询 / 桌面 timeline 同步）
  ├─ pet-generation.controller.ts（POST submit / GET tasks / GET tasks/:id）
  ├─ meshy.provider.ts（文生 / 图生）
  └─ hunyuan3d.provider.ts（腾讯云 AI3D）
backend/src/entities/
  ├─ living-pet.entity.ts
  ├─ pet-generation-task.entity.ts
  └─ agent-account.entity.ts
shared/types/agentrix-presence.ts
  └─ PetState / PetEmotion / PresenceTopics.petState / ApprovalRequest
```

**穿戴 / 硬件基线**：

```
src/services/wearables/
  ├─ wearableVendorRegistry.service.ts（厂商档案）
  ├─ wearableBleGateway.service.ts / wearableBlePairing.service.ts（通用 BLE）
  ├─ watchDataLayerBridge.service.ts（Apple Watch + Wear OS）
  ├─ glassSessionBridge / glassVendorAdapters / glassHUDController（眼镜）
  └─ healthKitBridge / vitals-bus（健康信号）
```

### 4.2 渲染器路线图（路线 B，已确认）

```
P0（当前）
  └─ SVG fallback：0 依赖，0 license
V4.1（W1-W2）Rive 全量集成
  ├─ @rive-app/canvas（MIT）
  ├─ Rive State Machine ↔ EMOTION_MOTION_MAP 1:1 映射
  ├─ Tauri WebView2 内嵌 + RN Skia 手机端回放
  └─ 默认 Claw 角色：10 情绪动画一次交付
V4.2（W3-W4）VRM 升级 + 跨端
  ├─ VRoid Studio（免费商用） + @pixiv/three-vrm（MIT）
  ├─ BlendShape 标准映射 happy/sad/angry/surprised/neutral + 自定义 busy/earn
  ├─ 资产 CDN：按 SHA256 分块、预签名 URL、60 天 TTL
  └─ 跨端同 .vrm：Desktop/Mobile/Web 统一渲染
V4.3（W5-W6）Pet SDK 开放
  ├─ PetRenderer 接口（Rive/VRM/Live2D/ClawCore 可插拔）
  ├─ 社区 Skin Pack 协议（manifest v2）
  └─ Marketplace SDK：上架 / 购买 / Remix / 租赁
V5.0（W9-W12）摄像头扫描 + ClawCore v1
  ├─ Hunyuan3D 多视角扫描
  └─ ClawCore SDK v1（MVP 5 种接入）
```

### 4.3 PetCreator 后端流水线（已上线，待完善）

```
用户 POST /pet-generation/submit {mode, prompt|imageUrl, provider, style}
   │
   ├─ pre-check：配额（UserTokenQuota 扩展 PetGenQuota） + 内容审核（prompt 关键词）
   │
   ├─ 写 pet_generation_tasks，status=QUEUED
   │
   ├─ meshy / hunyuan3d provider.submit() → providerRequestId
   │
   ├─ status=PROCESSING
   │
   └─ @Interval(20s) pollPendingTasks
         │
         ├─ 拉 provider 状态
         │
         ├─ 成功：outputUrl(.glb) → auto-rig → vrmUrl(.vrm)
         │         └─ status=COMPLETED + 触发 desktop-sync
         │
         └─ 失败：status=FAILED + error + 退回配额
```

**本次新增（V4）**：

- `moderation` 模块：prompt 前置关键词过滤 + 生成后 CLIP 模型审核（NSFW / 儿童 / 仇恨）
- `pet-gen-quota` 子表（或 `UserTokenQuota` 扩列）：按计划跟踪生成次数与金额
- 自动 rig 管线：接入开源 UniRig / Blender headless，`.glb` → `.vrm` 标准化
- Marketplace 接口：上架 / 购买 / Remix 结算（扩展 `marketplace/` 模块）

### 4.4 灵魂层后端扩展（V4 W1-W2）

现 `LivingPet` 是单宠单灵魂，V4 扩展为**灵魂模板 + 多皮肤**：

```
新增：
  entities/
    ├─ pet-soul-template.entity.ts   # 28 签名宠物模板（只读种子数据）
    ├─ pet-skin.entity.ts            # 用户拥有的皮肤（含出处：generated/purchased/remixed）
    └─ pet-active-skin.entity.ts     # 用户当前激活的皮肤（1 user : 1 active skin）
扩展 LivingPet：
  ├─ soulTemplateId: 指向 pet-soul-template
  ├─ activeSkinId:   指向 pet-active-skin
  └─ personality:    继承自模板，可被用户覆写
API：
  POST /v1/pet/soul/switch        切换灵魂模板（保留亲密度/记忆）
  POST /v1/pet/skin/activate      切换当前皮肤
  GET  /v1/pet/skins              列出我的皮肤
  POST /v1/pet/skins/breed        双图融合（繁殖，V4 W6+）
```

### 4.5 跨端同步契约（已有 SSoT，本次补齐端适配）

所有端订阅 `PresenceTopics.petState(userId)`，由后端 `LivingPetService.broadcast` 推送。各端实现差异：

| 端 | SDK / 入口 | 渲染 | 事件监听 | 本地存储 |
|----|-----------|------|---------|---------|
| Desktop (Tauri) | `desktopSync.ts` + `petSdk` | SVG/Rive/VRM | `agentrix:pet-state`, `agentrix:pet-vrm-changed` | localStorage |
| Mobile (RN Expo) | `agentPresenceAccount.ts` + 新增 `mobilePetSdk` | SVG/Rive/VRM（Skia + react-three-fiber） | Realtime / notification | AsyncStorage + MMKV |
| Watch (watchOS/Wear OS) | `watchDataLayerBridge` | Complication + 表盘 | DataLayer push | 主机 App 中转 |
| Glass | `glassHUDController` + `glassSessionBridge` | Unity / WebGL VRM | Realtime + gesture | 会话级 |
| Toy (ClawCore) | ClawCore firmware (ESP32-S3 / nRF) | eink/OLED + LED + 振动 | BLE GATT + MQTT 回落 | 设备 flash |
| Web | `frontend/components/GlobalFloatingBall.tsx` 扩展 | SVG + WebGL VRM | WebSocket | localStorage |

### 4.6 ClawCore SDK v0（硬件协议草案，V5 前交付）

**Wire Protocol**：

```
传输：
  BLE GATT（Nordic UART Service 128-bit UUID）
  Wi-Fi TCP + MQTT（MQTT over TLS 优先）
帧格式（JSON-line）：
  { "v": 1, "ts": <unix ms>, "type": "<type>", "payload": <obj>, "sig": <hmac> }
核心 type：
  hello / auth          设备配对握手
  pet.state.sync        服务端 → 设备：情绪、亲密度、能量
  pet.interaction       设备 → 服务端：触摸 / 压力 / 摇晃
  pet.approval.request  服务端 → 设备：待审批任务
  pet.approval.reply    设备 → 服务端：批准 / 拒绝
  vitals                设备 → 服务端：心率 / 温度 / 加速度
  ota.chunk             OTA 分片
```

**SDK 分层**：

- **L3 认证层（最小实现）**：仅实现 `hello` + `pet.interaction`（单向上报）+ 周期广告
- **L2 联名层**：加 `pet.state.sync` + `pet.approval.*`（双向）+ OTA + 离线缓存

**参考实现（开源样板，由社区与合作方维护，Agentrix 不出货固件）**：
- ESP32-S3 Rust + Embassy 固件骨架（V5 W9）
- nRF52 / Zephyr 骨架（社区贡献）
- Android/iOS Bridge（V5 W10）

### 4.7 移动端宠物实现（V4 W3-W4）

```
src/screens/pet/PetCompanionScreen.tsx → 扩展为全屏 3D 模式
src/components/GlobalFloatingBall.tsx  → 已有浮球，扩展表情同步
新增：
  src/services/mobilePetSdk.ts        → 对齐 desktop petSdk API
  src/services/petWidget.ts           → iOS WidgetKit / Android App Widget
  src/components/PetCanvasRN.tsx      → react-native-skia 渲染 SVG/Rive
  src/components/PetVRMRN.tsx         → react-three-fiber + three-vrm
  src/services/petARController.ts     → ARKit/ARCore VRM 叠加（V4 W5+）
  plugins/nfc-pet-trigger            → expo-nfc 触发 nfc_touch 交互
```

### 4.8 Web 端宠物（V4 W6）

```
frontend/components/GlobalFloatingBall.tsx → 提取为嵌入组件
frontend/components/pet/
  ├─ WebPetCanvas.tsx      → SVG 浮球（立即上线）
  ├─ WebPetVRM.tsx         → three-vrm（渐进加载）
  ├─ embed.ts              → 提供 iframe 嵌入 snippet
  └─ PetSocialCard.tsx     → 社交档案页组件
pages/p/[petId]/index.tsx  → 宠物公开档案页
pages/p/[petId]/embed.tsx  → iframe 嵌入专用
```

---

## 5. 商业模式

### 5.1 收入结构（7 条线）

| # | 模式 | 描述 | 平台抽成 | 估算 ARPU / 规模 |
|:-:|------|------|:---:|-----------|
| 1 | **订阅制** | Free / Pro / Pro+，含生成配额、技能额度、渲染保真度 | N/A | Pro $9.9 ~ Pro+ $29.9 |
| 2 | **PetCreator 超额** | 免费 3 次用完后 $0.5/次 | 100% | ~$3/活跃用户/月 |
| 3 | **技能市场 GMV 抽成** | 宠物接单收入 | 10% | 规模 × 10% |
| 4 | **Marketplace UGC 分成** | 皮肤售卖 / 租赁 / Remix | 30% | Q3 上线后按月增长 |
| 5 | **ClawCore SDK 认证费** | L3 认证硬件年度费 | $500-5000/SKU | B 端 |
| 6 | **L2 联名销售分成** | 合作方负责制造，Agentrix 抽 IP 费 + 销售分成 | 5-25% | 单品 $39-99 |
| 7 | **企业定制** | 品牌宠物 / 知识库 / 私域部署 | N/A | $20k-200k/项目 |

> 订阅与超额详见 `docs/PRD_PET_MONETIZATION_QUOTA_MODEL.zh-CN.md`。

### 5.2 生成配额模型（关键）

| 计划 | 月费 | PetCreator 次数 | Marketplace 每日刷新 | Auto-Earn 任务 | 宠物保真度上限 | 繁殖次数/月 |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Free | $0 | 3 | 20 | 1 条流水线 | L2 VRM 低面数 | 0 |
| Pro | $9.9 | 30 | 100 | 3 条流水线 | L3 VRM + PBR | 2 |
| Pro+ | $29.9 | 无限* | 无限 | 10 条流水线 | 同上 + 优先队列 | 无限 |
| 企业 | 定制 | 合同 | 合同 | 合同 | 定制 IP | 合同 |

*Pro+ 虚拟无限，为防滥用设置软上限 300/月，超过需人工联系。

### 5.3 二创分成模型（Remix Royalty）

Marketplace 核心玩法，鼓励社区二创：

```
原作者上架皮肤 A，设置 Remix 分成比例 r ∈ [10%, 50%]
   ↓
二创者基于 A 用 PetCreator 双图融合产生皮肤 B
   ↓
B 上架售价 P
   ↓
购买 B 结算：
  Agentrix 平台：P × 30%
  原作者 A：    P × (70% × r)
  二创者：      P × (70% × (1-r))
```

链式分成上限：3 层祖先（A → B → C → D），避免税费爆炸；D 之后所有上游归入版权金池。

### 5.4 硬件生态分成（不自研，仅协议 + 认证 + 分成）

| 层级 | 一次性入场费 | 年度认证费 | 硬件 GMV 抽成 | 宠物皮肤联名分成 |
|:---:|:---:|:---:|:---:|:---:|
| L2 联名 | $5k-10k 品牌入场费 | $1k/年 | 15-25% | 50/50 |
| L3 认证 | N/A | $500-5k/SKU/年 | 5-10% | N/A |

### 5.5 增长飞轮（升级版）

```
用户下载 ClawBuddy（免费 + 3 次 PetCreator 额度）
        ↓
用 PetCreator 做了第一只「像自己梦里的宠物」→ WOW 时刻①
        ↓
让宠物接了第一单，赚到第一笔 → WOW 时刻②
        ↓
把宠物收益截图 / 社交卡片分享到社交媒体
        ↓
     ┌──────────────┴──────────────┐
   新用户因 WOW           创作者看到 UGC 分成
   而下载（病毒）             上架更多皮肤
     ↓                            ↓
   Pro 订阅                   Marketplace GMV ↑
   付费生成额度                   ↓
     ↓                       平台抽 30%
   新配额                         ↓
     ↓                       补贴硬件联名
   新皮肤                         ↓
     ↓                     L2/L3 联名 SKU ↑
   更多晒照                        ↓
     ↓                   「宠物住进任意硬件」
   新一轮病毒                       ↓
                              硬件反哺软件留存
```

### 5.6 竞争壁垒（4 层护城河）

| 层 | 壁垒 | 说明 |
|:-:|------|------|
| 1 | **数据** | 每只宠物的亲密度、记忆、任务链是难以迁移的情感资产 |
| 2 | **网络效应** | Marketplace 越多创作者 → 越多皮肤 → 更多用户 → 更多创作者 |
| 3 | **硬件生态** | 三层生态 + 认证体系 → 切换成本指数级增长 |
| 4 | **链上身份** | （V5+）高亲密度宠物可铸造 NFT 铭文，不可转让身份 |

---

## 6. 路线图（V2.0 6 阶段重排）

> 路线设计原则：先用「灵魂 × 皮肤」+ 6 端 SDK 把跨端基础打稳 → 再放 Marketplace + 硬件认证 → V5 做摄像头扫描与首批硬件 → V6+ 做生态扩张。每个阶段都是 4-6 周可交付的最小闭环。
>
> **完整开发任务拆解 → `docs/PRD_PET_PHASED_DEV_PLAN.zh-CN.md`**  
> **完整阶段测试计划   → `docs/PRD_PET_PHASED_TEST_PLAN.zh-CN.md`**

### Phase 0（当前已上线，作为 v2.0 基线）

| 已交付 | 位置 |
|------|------|
| SVG 浮球宠物 + 10 情绪状态机 | `desktop/src/components/PetCanvas.tsx`、`desktop/src/services/petSdk.ts` |
| 6 等级亲密度 + 6 类基础交互 | `petSdk.ts :: INTIMACY_LEVELS / INTERACTION_TABLE` |
| VRM 渲染入口 | `desktop/src/components/PetVRM.tsx` |
| PetCreator 文生 / 图生（Meshy + Hunyuan3D） | `desktop/src/services/petCreator.ts`、`backend/src/modules/pet-generation/` |
| 后端宠物实体 + 衰减 + 广播 | `backend/src/modules/living-pet/`、`entities/living-pet.entity.ts` |
| 视觉感知（默认关闭，本地 hash） | `desktop/src/services/visionPerception.ts` |
| 移动端浮球 + 桌面 chat panel | `src/components/GlobalFloatingBall.tsx`、`desktop/src/components/ChatPanel.tsx` |

### Phase 1：V4 W1-W2 — 灵魂 × 皮肤 解耦地基

**主题**：把「灵魂模板 + 皮肤资产」从 v1.0 的隐式概念变成一等公民。

- 后端：新增 `pet-soul-template` / `pet-skin` / `pet-active-skin` 三张表 + 对应 service / controller，迁移 `LivingPet.soulTemplateId / activeSkinId`
- 后端：导入 28 只签名宠物 seed 数据（`docs/PRD_PET_6_CLANS_PERSONA.zh-CN.md`）
- 桌面：`petSdk` 增加灵魂层与皮肤层分离的 API，UI 增加族群选择器
- 移动：`PetCompanionScreen` 增加灵魂切换与皮肤展示
- Web：宠物公开档案页 `/p/[petId]` 路由初版（仅展示，不含编辑）
- SSoT：在 `shared/types/agentrix-presence.ts` 引入 `PetSoulTemplateId` / `PetSkinRef`

**通过条件**：用户可在桌面或手机切换灵魂模板而不丢亲密度，跨端在 5 秒内同步状态。

### Phase 2：V4 W3-W4 — Rive 全量 + 配额 + 审核

**主题**：让 PetCreator 成为可控的可商业化主路径。

- 桌面 / 移动 / Web：Rive 2D 动画接入（`@rive-app/canvas`），10 情绪一次交付，State Machine 与 `EMOTION_MOTION_MAP` 1:1 映射
- 后端：新增 `pet-gen-quota` 子模型 + `moderation` 模块（prompt 关键词 + CLIP 图像审核）
- 桌面 / 移动 / Web：PetCreator UI 接入配额面板与审核拒绝提示
- 后端：失败回滚配额 + DMCA 联系入口
- 经济：Pro / Pro+ 订阅计划接入支付（沿用 `subscription/`、`payment/`）

**通过条件**：Free 用户每月 3 次生成、超额支付 $0.5 走通；NSFW prompt 100% 拦截；任意端 Rive 切换情绪 < 200ms。

### Phase 3：V4 W5-W6 — VRM 标准化 + Marketplace MVP + Web 嵌入

**主题**：把皮肤变成可流通资产，开启 UGC 经济与 Web 传播。

- 后端：自动 rig 管线（UniRig / Blender headless），`.glb` → `.vrm` 标准化；BlendShape 标准映射（happy/sad/angry/surprised/neutral/busy/earn）
- Marketplace：上架 / 一口价 / 拍卖 / 租赁 + Remix 分成（`marketplace/` 扩展）
- 反盗版：反向图搜查重 + 链上凭证（可选 NFT）
- Web：`frontend/components/pet/WebPetCanvas.tsx` + `WebPetVRM.tsx` + iframe 嵌入 `embed.tsx`
- Web：`pages/p/[petId]/index.tsx` 完整社交档案 + Open Graph 卡片
- 双图融合繁殖（image-to-3D）API + UI

**通过条件**：用户可上架皮肤、其他用户可购买、二创可走分成；任意网页可通过一行 `<script>` 嵌入宠物。

### Phase 4：V4 W7-W8 — 跨端审批 + Auto-Earn + 6 端能力对齐

**主题**：经济飞轮跑起来，宠物开始「替你赚钱」。

- 跨端：`ApprovalRequest` L0-L3 审批卡片在桌面 / 移动 / 手表 / 眼镜统一
- 移动：生物认证（Face ID / Touch ID / 指纹）作为 L2 必选
- 手表：watchOS Complication + Wear OS Tile 接入审批 + 心率回传
- 桌面：经济面板（钱包 / 今日收益 / 收益曲线）+ 日报 / 周报推送
- Auto-Earn：宠物自主接单管线（5 类品类）+ 能量系统上线
- A2A：宠物作为发包方雇用其他 Agent

**通过条件**：L2 审批 100% 强制生物认证；用户能在 24h 内看到第一笔可见收益；能量耗尽自动拒单。

### Phase 5：V5 W9-W12 — 摄像头扫描 + ClawCore SDK v1 + 首批硬件

**主题**：从「软件宠物」走向「住进任意硬件的宠物」。

- 移动：Hunyuan3D 多视角扫描（120s 出 `.vrm`），桌面同步开放
- ClawCore SDK v1：BLE GATT + Wi-Fi + MQTT + JSON 帧协议（详见 §4.6）
- ClawCore 两层（L2/L3）认证流程 + 开发者门户 `developer.agentrix.top`
- L2 联名：1-2 个毛绒玩具 / 潮玩首发（合作方负责制造与铺货）
- L3 认证：3-5 家第三方接入
- 开源样板固件：ESP32-S3 / nRF52 demo 板（仅作 SDK 验证用，不量产）
- 眼镜：`glassHUDController` 接入 HUD 宠物 + 空间锚点

**通过条件**：摄像头扫描 95% 成功率；ClawCore SDK 通过认证试点 3 家（含 ≥1 家 L2）；Glass HUD 宠物可空间锚定 30 分钟无漂移。

### Phase 6：V6+ — 生态扩张

**主题**：从产品走向平台。

- 宠物团队（主宠 + 11 子宠，对应 Agentrix 11 Agent 模板）
- 6 族群皮肤库扩张到 100+ 默认形象（PetCreator 自产）
- 宠物链上身份（高亲密度铭文 NFT，可选）
- 企业定制宠物（私域部署 / 品牌联名 / 知识库）
- 跨 App 宠物（合作伙伴 App SDK）
- 主权宠物（用户自托管钱包 + 链上记忆）

**通过条件**：3 家以上品牌联名上架；首个企业定制项目交付；宠物 30 日留存 > 60%。

---

## 7. 成功指标（KPIs）

> 三层指标体系：**北极星 → 增长 / 经济 / 健康**。每阶段都设里程碑值，Phase 结束做评审。

### 7.1 北极星

| 指标 | Phase 2 | Phase 4 | Phase 5 | Phase 6 |
|------|:------:|:------:|:------:|:------:|
| **宠物日活（DAU）** | 5,000 | 30,000 | 80,000 | 300,000 |
| **每用户每日宠物互动次数** | ≥ 8 | ≥ 12 | ≥ 18 | ≥ 25 |
| **30 日留存率** | 35% | 45% | 55% | 65% |

### 7.2 增长指标（病毒 + 创作）

| 指标 | Phase 2 | Phase 4 | Phase 5 | Phase 6 |
|------|:------:|:------:|:------:|:------:|
| 因宠物分享带来的新用户占比（K-factor） | 0.2 | 0.4 | 0.6 | 0.8 |
| PetCreator 月生成数 | 5,000 | 50,000 | 200,000 | 1M |
| PetCreator 成功率（工业级阈值） | 90% | 95% | 97% | 98% |
| Marketplace 月上架皮肤数 | — | 500 | 5,000 | 30,000 |
| Marketplace 月 GMV | — | $5k | $50k | $300k |
| 二创 Remix 占新皮肤比例 | — | 15% | 30% | 45% |

### 7.3 经济指标（赚钱闭环）

| 指标 | Phase 2 | Phase 4 | Phase 5 | Phase 6 |
|------|:------:|:------:|:------:|:------:|
| Auto-Earn 启用宠物占比 | 5% | 20% | 35% | 50% |
| 单宠物月可见净收益（中位数） | $0 | $5 | $12 | $25 |
| 平台总月收（订阅 + 超额 + GMV 抽成 + 硬件） | — | $20k | $200k | $2M |
| Pro+ 转化率（活跃用户） | 1% | 3% | 5% | 8% |
| 单 LLM 调用成本占收入 | < 60% | < 50% | < 40% | < 30% |

### 7.4 跨端 / 硬件指标（生态健康）

| 指标 | Phase 2 | Phase 4 | Phase 5 | Phase 6 |
|------|:------:|:------:|:------:|:------:|
| 多端同时在线用户占比（≥ 2 端） | 10% | 30% | 45% | 60% |
| 跨端状态同步 P95 延迟 | < 1s | < 800ms | < 500ms | < 300ms |
| ClawCore 认证设备 SKU 数（L2+L3） | — | — | 5 | 30 |
| 眼镜 / Glass 用户占比 | — | — | 2% | 8% |
| 6 族群覆盖度（每族群至少 1 只活跃宠物的用户占比） | 1 族群 | 3 族群 | 5 族群 | 6 族群 |

### 7.5 安全 / 合规 / 健康指标

| 指标 | 目标 |
|------|------|
| L2/L3 审批生物认证强制率 | 100% |
| NSFW / 违规皮肤上架前拦截率 | ≥ 99% |
| DMCA 投诉响应中位时间 | < 48h |
| 视觉感知误启用投诉率 | < 0.1% |
| F 族群（家庭） COPPA 合规通过率 | 100% |
| 子宠物钱包越权访问父宠物事件 | 0 |
| 后端 P95 接口延迟（`/v1/pet/*`） | < 300ms |

---

## 8. 风险与应对（V2.0 风险矩阵）

风险按 4 个维度分类：**产品 / 技术 / 经济 / 合规**。每个标注：概率 × 影响 → 防御机制 → 责任方。

### 8.1 产品风险

| # | 风险 | 概率 | 影响 | 应对 | 责任方 |
|:-:|------|:--:|:--:|------|------|
| P1 | 宠物打扰用户工作 | 中 | 高 | 专注模式（隐身）、会议检测自动静音、用户可全局关掉所有主动行为 | 桌面 / 移动 |
| P2 | 「灵魂 × 皮肤」概念太抽象，新用户流失 | 高 | 中 | 首启动用 Default Claw 灵魂 + Default Skin，PetCreator 入口在 Lv1 之后再露出 | 增长 / 设计 |
| P3 | 6 族群导致用户选择疲劳 | 中 | 中 | 引导问卷 → 推荐 1-3 只签名宠物 + 「不知道选什么？用 Claw」 兜底 | 增长 / 设计 |
| P4 | 28 只宠物中冷门族群（C/F）持续低活跃 | 中 | 低 | 按月评估族群 GMV / DAU，连续 2 月不达标的族群启动专项运营或合并 | 运营 |
| P5 | 「赚钱」预期过高导致失望 | 高 | 中 | 诚实数据展示（中位数而非头部）、新手教程明示「日均 < $1 是常态」、Pro 新手期奖励 | 增长 / 法务 |

### 8.2 技术风险

| # | 风险 | 概率 | 影响 | 应对 | 责任方 |
|:-:|------|:--:|:--:|------|------|
| T1 | Meshy / Hunyuan3D 服务波动 | 中 | 高 | 双 provider 备份 + 自动 failover + 排队降级 + 退款机制；监控成功率，连续 30 分钟 < 80% 自动切流 | 后端 |
| T2 | VRM 自动 rig 失败率高 | 中 | 高 | UniRig / Blender headless 双链路 + 失败可重试 + 失败兜底为静态模型；目标失败率 < 5% | 后端 / 渲染 |
| T3 | 跨端同步消息风暴 | 中 | 中 | Realtime topic 分级（hot/warm/cold）、客户端 30s 节流、WebSocket → SSE → 长轮询三级降级 | 后端 |
| T4 | VRM 在低端设备性能差 | 高 | 中 | 自动降级到 L1 Rive / L0 SVG；面数自适应（< 5k tris on mobile） | 桌面 / 移动 |
| T5 | ClawCore 协议在野设备碎片化 | 高 | 中 | 强制版本号 + 向前兼容 + 服务端协议适配层；L3 认证测试 100 项必须通过 | 硬件 / 协议 |
| T6 | BLE / Wi-Fi 跨端 pair 体验差 | 中 | 中 | 多通道并行尝试 + 动态最优选择 + 离线缓存最近一次配对 | 硬件 / 移动 |
| T7 | 视觉感知数据泄露 | 低 | 极高 | 永远本地 hash，永远不上传；二次审计 + bug bounty | 安全 |

### 8.3 经济与运营风险

| # | 风险 | 概率 | 影响 | 应对 | 责任方 |
|:-:|------|:--:|:--:|------|------|
| E1 | LLM 调用成本爆炸（Auto-Earn 启用快） | 中 | 高 | 单宠物日预算上限 + 模型分级路由（便宜模型先尝试）+ 收益分成扣回成本 | 经济 / 后端 |
| E2 | Auto-Earn 任务质量差导致差评 | 中 | 高 | 接单前 evaluator + 完成后人工抽检 + 差评自动暂停接单 + 可申诉 | 任务 / 信用 |
| E3 | Marketplace 假货 / 抄袭横行 | 高 | 高 | 反向图搜查重 + 链上凭证 + DMCA 流程 + 假冒赔付保险金 | 平台 / 法务 |
| E4 | Remix 链式分成被滥用洗钱 | 中 | 中 | 3 层祖先上限 + 单笔上限 + 反洗钱阈值监控 | 财务 / 合规 |
| E5 | 硬件供应链 / 联名延期 | 中 | 中 | L1 软件优先策略；L2 联名走小批量先发；不绑死任何单家 ODM | 硬件 / 商务 |
| E6 | 平台抽成被绕过（场外交易） | 中 | 中 | 链上凭证 + 信用积分（绕过的用户失去 Marketplace 访问）+ 法律条款 | 法务 |

### 8.4 合规与安全风险

| # | 风险 | 概率 | 影响 | 应对 | 责任方 |
|:-:|------|:--:|:--:|------|------|
| C1 | UGC 皮肤涉黄 / 涉政 / 涉未成年 | 高 | 极高 | prompt 前置过滤 + CLIP 后置审核 + 人工复核 + 24h SLA + 永久封号 | 审核 |
| C2 | F 族群（家庭）COPPA 不合规 | 中 | 极高 | 强制家长账号 + 严格内容白名单 + 禁用支付 + 监护人可见日志 | 合规 / 家庭 |
| C3 | 钱包私钥被劫持 | 低 | 极高 | MPC 默认（用户控制 1 片）+ L3 协签 + 异常行为风控（异地 / 大额） | 安全 / 钱包 |
| C4 | DMCA 投诉处理不力被起诉 | 中 | 高 | 48h SLA + 反通知机制 + 法律顾问审核 + 假信号惩罚 | 法务 |
| C5 | 跨地区 AI 监管差异（中 / 美 / 欧） | 高 | 中 | 区域化部署 + 不同区配置不同模型白名单 + 内容输出地域适配 | 合规 / 后端 |
| C6 | 子宠物越权访问父宠物钱包 | 低 | 极高 | scope 强制下发 + 后端二次校验 + 定期 audit；任何越权事件 P0 处理 | 安全 / 钱包 |
| C7 | 视觉感知被恶意启用 | 低 | 极高 | 默认关闭 + 强制二次确认 + 系统级权限托底 + 任何启用都进审计日志 | 安全 |

### 8.5 竞品风险

| # | 风险 | 概率 | 影响 | 应对 |
|:-:|------|:--:|:--:|------|
| X1 | Anthropic 推出真 AI Buddy（含执行 + 钱包） | 中 | 高 | 加速 Marketplace 与 6 族群 + 6 端覆盖；护城河在网络效应而非单点 |
| X2 | OpenAI / Microsoft 集成宠物到 Codex / Copilot | 中 | 中 | 主打陪伴 + 经济，避开纯生产力领地；与 Cursor / VS Code 做共生而非竞争 |
| X3 | 国内大厂（腾讯 / 字节 / 米哈游）做类似产品 | 中 | 高 | 出海优先，海外节点 + 海外社群运营 + Web3 钱包不可被复制 |
| X4 | Meshy / Tripo 做自己的宠物前端 | 高 | 中 | 不依赖单一 provider，VRM 标准化让我们成为「壳」而非「皮」 |

---

## 附录 A：竞品详细技术参数

### Claude Desktop Buddy（2026-04）
- **硬件**：M5StickC Plus（ESP32，135×240 TFT，IMU，BLE 5.0）
- **连接**：Nordic UART Service over BLE；自动重连
- **状态**：7 种（sleep/idle/busy/attention/celebrate/dizzy/heart）
- **宠物**：18 种 ASCII + 自定义 GIF（96px wide，7 状态，< 1.8MB）
- **控制**：按键（A前/B右/Power左）+ 摇晃 + 面朝下
- **触发**：Claude Cowork/Code session 状态通过 BLE JSON 推送
- **代码**：C++ 90.6%，开源 MIT，1.6k stars

### OpenAI Codex CLI（2026-04，v0.128.0）
- **形态**：终端 CLI，无 GUI 无宠物
- **执行**：沙箱内 shell/代码执行，三档权限（suggest/auto-edit/full-auto）
- **模型**：GPT-5.3-Codex（最新），支持自带 API Key
- **代码**：Rust 96.2%，80k stars，445 贡献者

---

## 附录 B：现有 Agentrix Pet SDK 接口参考

```typescript
// desktop/src/services/petSdk.ts（已落地）
export type PetEmotion = 
  'idle' | 'happy' | 'excited' | 'focused' | 
  'busy' | 'sad' | 'angry' | 'sleepy' | 
  'celebrating' | 'attention';

export const EMOTION_MOTION_MAP: Record<PetEmotion, MotionConfig> = { /* ... */ };
export const INTIMACY_LEVELS: IntimacyLevel[] = [ /* 6 级 */ ];
export const INTERACTION_TABLE: InteractionEntry[] = [ /* 6 种 */ ];

export interface PetRenderer {
  mount(container: HTMLElement): void;
  setEmotion(emotion: PetEmotion): void;
  setIntimacy(level: number): void;
  dispose(): void;
}

export function bootPetSdk(): void;
export function triggerPetInteraction(type: InteractionType): void;
export function setLocalEmotion(emotion: PetEmotion): void;
export function registerPetRenderer(name: string, factory: () => PetRenderer): void;
```

---

*本文档由 @ceo + @brand 协作完成。评审需求：@dev（技术可行性）、@growth（增长机制）、@treasury（经济模型）。*
