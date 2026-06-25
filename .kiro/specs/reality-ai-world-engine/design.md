# Technical Design Document

## Overview

本文档描述 Reality → AI World Engine（Phase 1: AI UGC Engine）的技术架构设计。系统将现实物体通过手机摄像头扫描，经双轨3D重建管线生成风格化模型，再由AI语义引擎赋予游戏属性和Agent行为，最终与Agentrix经济系统打通实现交易闭环。

**核心技术原则：**
- 客户端轻量化：移动端仅负责图像采集和质量引导，重计算全部服务端完成
- 可插拔管线：3D重建后端支持热切换（TripoSR → Meshy → InstantMesh → 未来方案）
- 语义优先：3D模型是"语义载体"，AI理解比几何精度更重要
- 风格化兜底：Style_Renderer确保即使粗糙模型也能产出好看的游戏资产

## Architecture

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Mobile Client (Expo SDK 54)               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │Reality_Scanner│  │ Quality_Gate │  │  Game UI (Battle/    │  │
│  │(Camera + AR) │  │ (3-Layer AI) │  │  Dungeon/Inventory)  │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
│         │                  │                      │              │
│         └──────────────────┼──────────────────────┘              │
│                            │                                     │
└────────────────────────────┼─────────────────────────────────────┘
                             │ HTTPS / WebSocket
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    API Gateway (NestJS)                           │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌─────────────┐  │
│  │  Scan API  │ │ Asset API  │ │ Battle API │ │ Share API   │  │
│  └─────┬──────┘ └─────┬──────┘ └─────┬──────┘ └──────┬──────┘  │
└────────┼───────────────┼──────────────┼───────────────┼─────────┘
         │               │              │               │
         ▼               ▼              ▼               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Service Layer                                  │
│  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │Reconstruction   │  │ AI Interpreter   │  │ Game Engine   │  │
│  │Service (双轨)    │  │ Service          │  │ Service       │  │
│  │                 │  │                  │  │               │  │
│  │ ┌─────────────┐│  │ ┌──────────────┐ │  │ ┌───────────┐ │  │
│  │ │Fast Pipeline ││  │ │Semantic      │ │  │ │Character  │ │  │
│  │ │(TripoSR/    ││  │ │Analysis      │ │  │ │Generator  │ │  │
│  │ │ Meshy)      ││  │ │(GPT-4V/      │ │  │ │           │ │  │
│  │ ├─────────────┤│  │ │ Gemini)      │ │  │ ├───────────┤ │  │
│  │ │Precision    ││  │ ├──────────────┤ │  │ │Dungeon    │ │  │
│  │ │Pipeline     ││  │ │Style_Renderer│ │  │ │Builder    │ │  │
│  │ │(InstantMesh/││  │ │(Stylization) │ │  │ ├───────────┤ │  │
│  │ │ LGM)       ││  │ └──────────────┘ │  │ │Battle     │ │  │
│  │ └─────────────┘│  └──────────────────┘  │ │Arena      │ │  │
│  └─────────────────┘                        │ └───────────┘ │  │
│                                             └───────────────┘  │
│  ┌─────────────────┐  ┌──────────────────┐                     │
│  │Agent Binding    │  │ Marketplace      │                     │
│  │Service          │  │ Integration      │                     │
│  └─────────────────┘  └──────────────────┘                     │
└─────────────────────────────────────────────────────────────────┘
         │               │              │               │
         ▼               ▼              ▼               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Data Layer                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ PostgreSQL   │  │ Object Store │  │ Redis (Queue/Cache)  │  │
│  │ (TypeORM)    │  │ (S3/MinIO)   │  │                      │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| 组件 | 职责 | 部署位置 |
|------|------|---------|
| Reality_Scanner | 摄像头控制、AR覆盖层、图像采集 | Mobile |
| Quality_Gate | 三层质量引导（实时/即时/整体） | Mobile (轻量推理) + Server (评分模型) |
| Reconstruction Service | 双轨3D重建调度、Provider管理 | Server (GPU) |
| AI Interpreter | 语义分析、属性提取 | Server (LLM API) |
| Style_Renderer | 风格化后处理 | Server (GPU) |
| Game Engine Service | 角色/副本/战斗生成 | Server |
| Agent Binding Service | Agent实例创建与行为树配置 | Server |
| Share Service | 分享卡片/视频生成 | Server |
| Marketplace Integration | 资产上架/交易/转移 | Server (复用现有) |

## Data Models

> **TypeORM 命名约定（仓库硬性规则）：** 下方所有实体均使用项目全局的 `SnakeNamingStrategy`（参见 `AGENTS.md` 的 Hard rules）。属性名一律使用 camelCase（如 `ownerId: string`），由命名策略自动映射为 `owner_id` 列名。**严禁** 在 `@Column()` 装饰器内手写 `name: 'snake_case'`。`@Entity('world_assets')` 表名保持 snake_case 是 Postgres 表名约定，不受此规则影响——只有字段/列名是自动转换的。

### Core Entities (TypeORM / PostgreSQL)

```typescript
// world_assets 表
@Entity('world_assets')
class WorldAsset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  ownerId: string; // FK → users.id

  @Column()
  originalCreatorId: string; // 首次扫描者，不可变

  @Column({ type: 'varchar', length: 30 })
  name: string;

  @Column({ type: 'enum', enum: ['character', 'dungeon', 'weapon'] })
  category: string;

  @Column({ type: 'enum', enum: ['quick', 'detail'] })
  scanMode: string;

  // 3D 资产引用
  @Column()
  meshUrl: string; // S3 path to .glb

  @Column()
  styledMeshUrl: string; // 风格化后的 .glb

  @Column({ type: 'varchar', length: 20 })
  styleType: string; // cartoon/pixel-art/fantasy/sci-fi/realistic

  @Column({ type: 'jsonb' })
  semanticDescription: SemanticDescription;

  // 游戏属性
  @Column({ type: 'jsonb' })
  stats: CharacterStats; // { hp, atk, def, spd, int }

  @Column({ type: 'jsonb' })
  skills: Skill[];

  @Column({ type: 'jsonb' })
  personalityTraits: string[];

  @Column({ type: 'text', nullable: true })
  backstory: string;

  @Column({ type: 'jsonb' })
  behaviorTree: BehaviorTreeNode;

  // 成长系统
  @Column({ default: 1 })
  level: number;

  @Column({ default: 0 })
  xp: number;

  @Column({ default: 0 })
  unlockedSkillSlots: number;

  // 战斗记录
  @Column({ default: 0 })
  battleWins: number;

  @Column({ default: 0 })
  battleLosses: number;

  // Agent 绑定
  @Column({ nullable: true })
  boundAgentId: string; // FK → agents.id

  // 来源追踪
  @Column({ type: 'enum', enum: ['scanned', 'purchased', 'gifted'] })
  source: string;

  @Column({ type: 'jsonb', nullable: true })
  sourceImagesMetadata: ImageMetadata[];

  // 乐观锁版本号（用于资产所有权两阶段转移协议）
  @VersionColumn()
  version: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

```typescript
// 语义描述结构
interface SemanticDescription {
  objectCategory: string;
  categoryConfidence: number; // 0-100
  materialType: string;
  estimatedSize: { length: number; width: number; height: number }; // cm
  functionalAffordances: string[]; // max 10
  visualStyleTags: string[]; // max 10
}

// 角色属性
interface CharacterStats {
  hp: number;   // 1-100
  atk: number;  // 1-100
  def: number;  // 1-100
  spd: number;  // 1-100
  int: number;  // 1-100
}

// 技能定义
interface Skill {
  name: string;        // 1-25 chars
  type: 'offensive' | 'defensive' | 'utility';
  effectDescription: string; // 10-50 words
  damageBase?: number;
  cooldownTurns?: number;
}

// 行为树节点
interface BehaviorTreeNode {
  type: 'selector' | 'sequence' | 'action' | 'condition';
  context: 'idle' | 'combat' | 'social';
  children?: BehaviorTreeNode[];
  actionId?: string;
  conditionExpr?: string;
}
```

```typescript
// battles 表
@Entity('battles')
class Battle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  challengerAssetId: string; // FK → world_assets.id

  @Column()
  defenderAssetId: string; // FK → world_assets.id

  @Column()
  challengerUserId: string;

  @Column()
  defenderUserId: string;

  @Column({ type: 'enum', enum: ['pending', 'active', 'completed', 'cancelled', 'expired'] })
  status: string;

  @Column({ type: 'bigint' })
  randomSeed: number; // 确定性战斗种子

  @Column({ type: 'jsonb', nullable: true })
  rounds: BattleRound[];

  @Column({ nullable: true })
  winnerAssetId: string;

  @Column({ default: 0 })
  totalRounds: number;

  @Column({ nullable: true })
  replayVideoUrl: string;

  @Column({ type: 'jsonb', nullable: true })
  xpAwarded: { challenger: number; defender: number };

  @Column()
  expiresAt: Date; // 72h for async challenges

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

interface BattleRound {
  roundNumber: number;
  attackerId: string;
  skillUsed: string;
  damageDealt: number;
  isCritical: boolean;
  hpRemaining: { challenger: number; defender: number };
}
```

```typescript
// dungeons 表
@Entity('dungeons')
class Dungeon {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  creatorId: string;

  @Column()
  worldAssetId: string; // 关联的 World_Asset

  @Column({ type: 'varchar', length: 12 })
  shareCode: string; // 6-12 alphanumeric

  @Column({ type: 'jsonb' })
  layout: DungeonLayout;

  @Column({ type: 'jsonb' })
  enemies: DungeonEnemy[];

  @Column({ type: 'jsonb' })
  lootItems: DungeonLoot[];

  @Column({ type: 'jsonb' })
  boss: DungeonBoss;

  @Column({ type: 'varchar', length: 20 })
  theme: string; // fire/dream/data/neutral

  @Column({ type: 'float' })
  roomAreaSqm: number;

  @Column({ type: 'float' })
  coverageDegrees: number;

  @Column({ default: 1 })
  difficultyRating: number; // 1-5

  @Column()
  expiresAt: Date; // share_code 30天有效

  @CreateDateColumn()
  createdAt: Date;
}

interface DungeonLayout {
  walls: Polygon[];
  doors: Point[];
  furniturePositions: { type: string; position: Point; size: Size3D }[];
  walkableAreas: Polygon[];
  openAreas: { position: Point; areaSqm: number }[];
}

// scan_sessions 表 — 记录每次扫描的元数据
@Entity('scan_sessions')
class ScanSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'enum', enum: ['quick', 'detail', 'room'] })
  scanMode: string;

  @Column({ default: 0 })
  imageCount: number;

  @Column({ type: 'jsonb' })
  qualityScores: QualityScore[];

  @Column({ type: 'float', nullable: true })
  overallPredictionScore: number; // 1-5 stars

  @Column({ type: 'enum', enum: ['capturing', 'submitted', 'processing', 'completed', 'failed'] })
  status: string;

  @Column({ nullable: true })
  resultAssetId: string; // FK → world_assets.id

  @Column({ type: 'enum', enum: ['fast', 'precision'] })
  pipelineUsed: string;

  @Column({ nullable: true })
  errorMessage: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

interface QualityScore {
  frameIndex: number;
  sharpness: number;    // 0-100
  exposure: number;     // 0-100
  angleNovelty: number; // 0-100
  overall: number;
}
```

## API Design

### Scan & Reconstruction APIs

```
POST /api/v1/world-engine/scan/start
  Body: { mode: 'quick' | 'detail' | 'room' }
  Response: { session_id: string }

POST /api/v1/world-engine/scan/:sessionId/upload
  Body: multipart/form-data (image file, max 2MB)
  Response: { frame_index: number, quality_score: QualityScore }

POST /api/v1/world-engine/scan/:sessionId/predict-quality
  Response: { overall_score: number, suggestions: string[] }

POST /api/v1/world-engine/scan/:sessionId/generate
  Body: { style: 'cartoon' | 'pixel-art' | 'fantasy' | 'sci-fi' | 'realistic' }
  Response: { job_id: string, estimated_seconds: number }

GET /api/v1/world-engine/jobs/:jobId/status
  Response: { status: string, progress: number, result?: WorldAsset }

WebSocket /api/v1/world-engine/jobs/:jobId/stream
  Events: { type: 'progress' | 'complete' | 'error', data: any }
```

### World Asset APIs

```
GET /api/v1/world-engine/assets
  Query: { category?, source?, sort?, page?, limit? }
  Response: { items: WorldAsset[], total: number }

GET /api/v1/world-engine/assets/:id
  Response: WorldAsset (full detail)

PATCH /api/v1/world-engine/assets/:id
  Body: { name?, style? }
  Response: WorldAsset

POST /api/v1/world-engine/assets/:id/regenerate
  Body: { target: 'stats' | 'skills' | 'personality' | 'backstory' | 'name' }
  Response: { job_id: string }

DELETE /api/v1/world-engine/assets/:id
  Response: { success: boolean }
```

### Character Generation APIs

```
POST /api/v1/world-engine/assets/:id/generate-character
  Body: { semantic_description: SemanticDescription }
  Response: { job_id: string, estimated_seconds: number }
```

### Dungeon APIs

```
POST /api/v1/world-engine/dungeons/generate
  Body: { session_id: string, theme?: string }
  Response: { job_id: string }

GET /api/v1/world-engine/dungeons/:code
  Response: Dungeon

POST /api/v1/world-engine/dungeons/:code/attempt
  Response: { attempt_id: string, dungeon: Dungeon }
```

### Battle APIs

```
POST /api/v1/world-engine/battles/create
  Body: { challenger_asset_id: string, defender_asset_id: string }
  Response: Battle

POST /api/v1/world-engine/battles/:id/accept
  Response: Battle (with rounds populated)

GET /api/v1/world-engine/battles/:id
  Response: Battle

GET /api/v1/world-engine/battles/:id/replay
  Response: { video_url: string }

POST /api/v1/world-engine/battles/challenge
  Body: { challenger_asset_id: string, target_user_id: string }
  Response: { battle_id: string, share_link: string }
```

### Agent Binding APIs

```
POST /api/v1/world-engine/assets/:id/bind-agent
  Response: { agent_id: string, status: 'bound' }

DELETE /api/v1/world-engine/assets/:id/unbind-agent
  Response: { status: 'unbound' }

GET /api/v1/agents/:id/status
  Response: { agent_id, personality, recent_actions[], bound_asset_id }
  (扩展现有 Agent API)
```

### Share APIs

```
POST /api/v1/world-engine/share/card
  Body: { asset_id: string, type: 'character' | 'dungeon' | 'battle' }
  Response: { card_url: string, deep_link: string }

POST /api/v1/world-engine/share/video
  Body: { battle_id: string }
  Response: { video_url: string }

GET /api/v1/world-engine/share/preview/:token
  Response: HTML page (web preview for non-app users)
```

### Marketplace Integration APIs

```
POST /api/v1/marketplace/world-assets/listing
  Body: { asset_id: string, price: number, currency: 'USD' | 'AXP' }
  Response: { listing_id: string }

GET /api/v1/marketplace/world-assets
  Query: { category?, min_price?, max_price?, sort?, page? }
  Response: { items: MarketplaceListing[], total: number }

POST /api/v1/marketplace/world-assets/:listingId/purchase
  Response: { transaction_id: string, status: string }

GET /api/v1/marketplace/world-assets/:assetId/suggested-price
  Response: { suggested_price: number, factors: PriceFactors }
```

## Components and Interfaces

### Mobile Client Components

> **Mobile screen file layout convention:** This codebase uses a **flat** `src/screens/` directory (verified existing screens: `MarketplaceScreen.tsx`, `MyAgentsScreen.tsx`, etc.). World Engine screens MUST follow the same convention — do NOT introduce a `src/screens/WorldEngine/` subdirectory. Canonical paths:
> - `src/screens/WorldEngineScannerScreen.tsx` — Reality Scanner (camera + AR + Quality_Gate UI)
> - `src/screens/WorldAssetInventoryScreen.tsx` — World Asset Inventory (grid + detail view)
> - `src/screens/WorldBattleArenaScreen.tsx` — Battle visualization (R5)
> - `src/screens/WorldDungeonExplorerScreen.tsx` — Dungeon exploration (R4)

**RealityScannerModule**
- Responsibilities: Camera lifecycle, AR session management, image capture
- Interface: `startScan(mode) → ScanSession`, `captureFrame() → Frame`, `submitForGeneration(style) → JobId`
- Dependencies: ARKit/ARCore, Camera API, QualityGateModule

**QualityGateModule**
- Responsibilities: Real-time quality analysis, per-frame scoring, pre-submission prediction
- Interface: `analyzeFrame(frame) → QualityMetrics`, `predictOverallQuality(frames[]) → PredictionResult`
- Dependencies: TFLite runtime, ARKit depth API

**GameUIModule**
- Responsibilities: Battle visualization, dungeon exploration, inventory management
- Interface: `renderBattle(battleData)`, `renderDungeon(dungeonData)`, `showInventory(assets[])`
- Dependencies: Three.js (React Three Fiber), React Native Reanimated

### Backend Service Components

**ReconstructionService**
- Responsibilities: Provider routing, job queue management, mesh output
- Interface: `submitJob(images[], mode, config) → Job`, `getJobStatus(jobId) → JobStatus`
- Dependencies: Provider Registry, BullMQ, S3

**AIInterpreterService**
- Responsibilities: Semantic analysis of meshes and source images
- Interface: `analyze(meshUrl, imageUrls[]) → SemanticDescription`
- Dependencies: GPT-4V / Gemini Vision API

**StyleRendererService**
- Responsibilities: Post-processing stylization of raw meshes
- Interface: `stylize(meshUrl, style, config) → StyledMeshUrl`
- Dependencies: Blender Python API (headless), GPU server

**GameEngineService**
- Responsibilities: Character generation, dungeon building, battle simulation
- Interface: `generateCharacter(semantic) → CharacterProfile`, `generateDungeon(layout) → Dungeon`, `simulateBattle(assetA, assetB, seed) → BattleResult`
- Dependencies: LLM API (character/dungeon), deterministic battle engine

**AgentBindingService**
- Responsibilities: Agent instance creation, behavior tree configuration, idle action scheduling
- Interface: `bindAgent(assetId) → AgentId`, `unbindAgent(assetId)`, `scheduleIdleActions(agentId)`
- Dependencies: Existing Agent System, Cron scheduler

**ShareService**
- Responsibilities: Card/video generation, deep link management
- Interface: `generateCard(assetId, type) → CardUrl`, `generateReplayVideo(battleId) → VideoUrl`
- Dependencies: Headless Three.js renderer, FFmpeg, QR generator

## Key Technical Decisions

### 1. 双轨 3D 重建管线

```
┌─────────────────────────────────────────────────────────┐
│              Reconstruction Service                       │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │         Provider Registry (可插拔)               │    │
│  │  ┌───────────┐ ┌───────────┐ ┌──────────────┐  │    │
│  │  │ TripoSR   │ │ Meshy API │ │ InstantMesh  │  │    │
│  │  │ (self-    │ │ (SaaS)    │ │ (self-hosted)│  │    │
│  │  │  hosted)  │ │           │ │              │  │    │
│  │  └───────────┘ └───────────┘ └──────────────┘  │    │
│  │  ┌───────────┐ ┌───────────┐                   │    │
│  │  │ LGM       │ │ Future    │                   │    │
│  │  │ (self-    │ │ Provider  │                   │    │
│  │  │  hosted)  │ │           │                   │    │
│  │  └───────────┘ └───────────┘                   │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  Pipeline Router:                                        │
│    IF scan_mode == 'quick' → fast_provider (default:    │
│       TripoSR, fallback: Meshy API)                     │
│    IF scan_mode == 'detail' → precision_provider        │
│       (default: InstantMesh, fallback: LGM)             │
│                                                          │
│  Provider Interface:                                     │
│    reconstruct(images: Buffer[], config: Config)         │
│      → Promise<{ mesh: Buffer, confidence: number }>    │
└─────────────────────────────────────────────────────────┘
```

**Provider 接口设计：**

```typescript
interface ReconstructionProvider {
  name: string;
  type: 'fast' | 'precision';
  maxImages: number;
  timeoutMs: number;

  reconstruct(input: ReconstructionInput): Promise<ReconstructionOutput>;
  healthCheck(): Promise<boolean>;
}

interface ReconstructionInput {
  images: { buffer: Buffer; metadata: ImageMetadata }[];
  config: {
    target_poly_count?: number;
    output_format: 'glb';
    texture_resolution?: number;
  };
}

interface ReconstructionOutput {
  mesh: Buffer;          // .glb binary
  confidence: number;    // 0-100, 几何质量自评
  poly_count: number;
  texture_resolution: number;
  processing_time_ms: number;
}
```

**选型理由：**
- TripoSR：开源，可自部署，单图5-10秒，适合快速路径
- Meshy API：商用级SaaS，效果稳定，作为快速路径的fallback
- InstantMesh：开源多视图重建，8+图30-60秒，精细路径首选
- LGM：Large Gaussian Model，备选精细方案

### 2. Quality_Gate 三层引导系统

```
┌─────────────────────────────────────────────────────────┐
│                Quality_Gate Architecture                  │
│                                                          │
│  Layer 1: Real-time Preview (Mobile-side, <2ms/frame)   │
│  ┌─────────────────────────────────────────────────┐    │
│  │ • ARKit/ARCore depth → distance check (15-50cm) │    │
│  │ • Ambient light sensor → brightness check (≥50lux)│   │
│  │ • Frame diff → motion blur check (<20% area)    │    │
│  │ • Object detection → occlusion check (<30%)     │    │
│  │ Implementation: TFLite model, ~1.5ms inference   │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  Layer 2: Per-frame Scoring (Mobile + Server hybrid)    │
│  ┌─────────────────────────────────────────────────┐    │
│  │ • Sharpness: Laplacian variance (mobile-side)   │    │
│  │ • Exposure: histogram analysis (mobile-side)     │    │
│  │ • Angle novelty: feature matching vs previous    │    │
│  │   frames (server-side, async)                    │    │
│  │ Score display: green ≥70, yellow 40-69, red <40 │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  Layer 3: Pre-submission Prediction (Server-side)       │
│  ┌─────────────────────────────────────────────────┐    │
│  │ • Coverage completeness model                    │    │
│  │ • Lighting consistency across frames             │    │
│  │ • Angle diversity score                          │    │
│  │ • Historical success rate for similar inputs     │    │
│  │ Output: 1-5 stars + specific suggestions         │    │
│  │ Implementation: lightweight CNN classifier       │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

**移动端轻量推理方案：**
- 使用 TensorFlow Lite 或 ONNX Runtime Mobile
- Layer 1 模型大小 < 5MB，推理 < 2ms
- Layer 2 的 sharpness/exposure 用传统CV算法（无需ML）
- Layer 2 的 angle_novelty 异步上传到服务端计算

### 3. Style_Renderer 风格化渲染

```typescript
interface StyleRendererConfig {
  style: 'cartoon' | 'pixel-art' | 'fantasy' | 'sci-fi' | 'realistic';
  preserve_silhouette: boolean; // always true
  smooth_geometry: boolean;     // true for fast-track models
  enhance_colors: boolean;
  target_poly_count?: number;   // optional simplification
}

// 风格化管线步骤：
// 1. Geometry smoothing (Laplacian smooth, preserve silhouette)
// 2. UV re-projection (if texture quality low)
// 3. Style transfer on texture (neural style transfer or rule-based)
// 4. Color palette mapping (per style preset)
// 5. Edge detection + outline rendering (for cartoon/pixel-art)
// 6. Material override (for fantasy/sci-fi)
```

**实现方案：**
- 服务端 GPU 处理（避免移动端性能问题）
- 基于 Blender Python API 的自动化管线（headless rendering）
- 预训练的 style transfer 模型（per style）
- 处理时间目标：< 5秒
- 输出：风格化后的 .glb + 缩略图 + 动画GIF

### 4. 战斗系统确定性公式

```typescript
// 伤害计算公式
function calculateDamage(
  attacker: CharacterStats,
  defender: CharacterStats,
  skill: Skill,
  seed: number,
  roundNumber: number
): { damage: number; isCritical: boolean } {
  const rng = seededRandom(seed, roundNumber);

  // 基础伤害 = 技能基础 × (攻击力 / 防御力) × 随机波动(0.85-1.15)
  const baseDamage = skill.damageBase * (attacker.atk / defender.def);
  const variance = 0.85 + rng.next() * 0.30;
  let damage = Math.round(baseDamage * variance);

  // 暴击判定：基础10% + SPD加成(每10点SPD +1%)
  const critChance = 0.10 + (attacker.spd / 1000);
  const isCritical = rng.next() < critChance;
  if (isCritical) damage = Math.round(damage * 1.5);

  return { damage: Math.max(1, damage), isCritical };
}

// 回合顺序：SPD高者先手，相同则随机
function determineTurnOrder(a: CharacterStats, b: CharacterStats, seed: number): string[] {
  if (a.spd !== b.spd) return a.spd > b.spd ? ['a', 'b'] : ['b', 'a'];
  return seededRandom(seed, 0).next() > 0.5 ? ['a', 'b'] : ['b', 'a'];
}
```

### 5. Agent 绑定与行为系统

```typescript
// Agent 配置生成
function createAgentConfig(asset: WorldAsset): AgentConfig {
  return {
    system_prompt: buildPersonalityPrompt(asset.personality_traits, asset.backstory),
    behavior_tree: asset.behavior_tree,
    idle_actions: {
      frequency: '1-4 per hour',
      actions: ['greet_owner', 'comment_time', 'suggest_battle', 'interact_collection'],
      idle_threshold_minutes: 5,
    },
    growth: {
      xp_thresholds: [100, 500, 1500, 5000],
      max_skill_slots: 4,
      xp_per_win: { min: 10, max: 50 }, // scaled by level diff
      xp_per_loss: { min: 10, max: 40 },
    },
  };
}

// 与现有 Agent 系统集成
// 扩展 /api/v1/agents/:id/status 响应：
interface AgentStatusExtended {
  agent_id: string;
  personality: string[];
  bound_asset_id: string;
  bound_asset_name: string;
  recent_actions: AgentAction[]; // last 20 or 24h
  xp: number;
  level: number;
  next_threshold: number;
}
```

### 6. 分享与深度链接

```
Deep Link Schema:
  agentrix://world-engine/asset/{asset_id}        → 查看资产
  agentrix://world-engine/battle/{battle_id}      → 查看/接受挑战
  agentrix://world-engine/dungeon/{share_code}    → 进入副本
  
Web Fallback:
  https://app.agentrix.io/world/{token}           → Web预览页
  
Share Card Generation Pipeline:
  1. 3D model → Headless Three.js renderer → Animated GIF (3s, 1080×1080)
  2. Stats overlay → Canvas composition
  3. QR code generation → Embedded in video
  4. Video: FFmpeg server-side rendering (15s, 9:16, 720p)
```

### 7. GPU 与 Provider 部署拓扑

生产服务器 `47.130.176.148` 是 **CPU-only**（Singapore），所有重型 3D / GPU 推理必须 off-box 处理。Phase 1 采用 **SaaS-first** 策略，自部署 GPU 仅作 fallback：

- **Fast-track Provider**：
  - 主：**Meshy API**（SaaS）
  - 备：**TripoSR** 自部署 GPU
- **Precision-track Provider**：
  - 主：**Stability AI / Replicate hosted 3D**（SaaS）
  - 备 1：**InstantMesh** 自部署
  - 备 2：**LGM** 自部署
- **自部署 GPU 池**：与 `agentrix-backend` PM2 进程隔离，独立部署到 GPU 实例池：
  - 起步规模 1× **A10 24GB**
  - 基于 BullMQ 队列深度自动扩容 1–3 实例
  - 云供应商：Lambda Labs 或 RunPod，on-demand 计价
- **队列隔离（关键）**：BullMQ 拆分两条队列 — `reconstruction-fast` 与 `reconstruction-precision`，互不阻塞。任一精度队列拥塞不会饿死快速队列。
- **Per-Provider 并发上限**（在 Provider Registry 配置）：
  - Meshy：5 concurrent
  - Stability：3 concurrent
  - TripoSR：2 per A10 instance
  - InstantMesh：1 per A10
  - LGM：1 per A40
- **成本追踪与自动切换**：每次调用写一行到 `agent_cost_records`（R13.1）。Provider Registry 后台 job 计算 7 天滚动均值；当某 Provider 的 cost-per-call 超过阈值（如 Meshy > 0.10 USD/call），下次同 tier 请求自动切换到更低成本 Provider，仅当低成本 Provider 不健康时才降级回原 Provider（R13.8）。

| Provider | Tier | Cost / call (est.) | Latency p50 | Concurrency cap |
|----------|------|--------------------|-------------|------------------|
| Meshy API | fast | $0.05 – 0.15 | 8 s | 5 |
| TripoSR (self-hosted) | fast | $0.01 (GPU amortized) | 6 s | 2 per A10 |
| Stability / Replicate | precision | $0.20 – 0.50 | 45 s | 3 |
| InstantMesh (self-hosted) | precision | $0.05 (GPU amortized) | 60 s | 1 per A10 |
| LGM (self-hosted) | precision | $0.07 (GPU amortized) | 75 s | 1 per A40 |

### 8. Mobile 3D 渲染降级策略

对应 R10.1（30 FPS P99）、R10.5（500 MB 缓存上限）、R10.8（低配设备降级）。核心思路：**用预渲染产物替代实时 3D，仅在用户主动进入详情时启动单一 R3F 场景。**

- **Inventory 网格**：始终展示服务端预渲染的 PNG 缩略图（256×256），**绝不**在网格视图里跑实时 3D — 12+ 资产同时渲染会立刻打爆 VRAM。
- **GIF 动画缩略图**（R7.1，3 s × 1080×1080）：服务端预渲染并缓存到 CDN，移动端纯播放，不参与 3D 计算。
- **实时 3D 渲染**：仅在用户打开资产详情视图时，启动单实例 React Three Fiber 场景；屏幕失焦（`useFocusEffect` 退出）时显式 unmount 释放 GPU 上下文。
- **每屏显存预算硬上限**（超出立即降级到 2D 占位图）：

| 场景 | Mobile 显存预算 |
|-----|----------------|
| Scanner 激活态 | ≤ 200 MB |
| Inventory 网格 | ≤ 80 MB |
| 详情视图 | ≤ 250 MB |
| 战斗竞技场峰值 | ≤ 350 MB |

- **缓存 LRU 驱逐**：在到达 500 MB 上限的 80%（即 400 MB）时主动触发 LRU 淘汰，避免低内存抖动（R10.5）。
- **低配设备分支**（2-4 GB RAM，R10.8）：
  - Inventory 详情视图：仍使用静态 PNG，禁用 3D 旋转
  - 战斗竞技场：改用 2D 精灵动画，跳过 R3F

### 9. AI 服务降级路径

确保 LLM Provider 全部不可用时系统仍能完成核心闭环（虽然质量下降）。

- **AI_Interpreter 降级**（GPT-4V 与 Gemini Vision 同时不可用时）：
  - 退化为 **rule-based classifier**：基于 mesh bounding-box 的轴比 + 主色（dominant color sampling），从一张 50-class lookup table 推断 `objectCategory`
  - `categoryConfidence` 强制写为 `50`
  - UI 显示 "lite mode" 徽章告知用户结果质量受限
- **Character_Generator 降级**（character-generation LLM 不可用时）：
  - 退化为 **template fallback**：`semanticCategory × 100 personality templates × 100 backstory templates`，组合产出仍唯一
  - stats 计算继续走确定性公式（R3.2 不受 LLM 状态影响）
- **缓存命中作为最终兜底**：
  - 以输入图像的 **perceptual hash** 为 key 缓存最近的推理结果
  - 24 h 内同 hash 重试直接复用，**同时降低 LLM 成本与提供降级冗余**
  - 当所有 LLM Provider 全宕时，缓存命中是唯一可用路径

### 10. 资产所有权两阶段转移协议

支撑 R8.3 / R8.4 的 30 秒 2-phase commit 重写。

**Phase 1 — Reserve（≤ 30 s）：**
- 写一行 `marketplace_listing_reservation`，字段：
  - `status = 'reserved'`
  - `buyerId`
  - `expiresAt = now() + 30s`
- 校验买家所在 Workspace 的 `maxAgents` 配额（R11.2 / R11.3）
- 持久化一份 `pending_transfer_state` 快照，记录资产当前的 `boundAgentId`、`xp`、`battleWins`、`battleLosses`，作为失败回滚的真值

**Phase 2 — Commit（单一 DB 事务）：**
- `worldAsset.ownerId = buyer`
- 转移绑定的 Agent 所有权
- listing 标记为 sold
- 删除 reservation 行
- **乐观锁**：通过 `worldAsset.version`（@VersionColumn）防止并发交易；版本不匹配则整个事务回滚

**失败路径：**

| 失败点 | 处理 |
|--------|------|
| Phase 1 校验不通过 | 释放 reservation → 全额退款 → 通知买卖双方失败原因 |
| Phase 2 事务失败 | DB ROLLBACK → 释放 reservation → 全额退款 |
| 30 s 超时未 commit | 后台 cron job（每 5 s 扫描 expired reservations）释放并退款 |

**幂等性**：以 `paymentId` 为幂等键 — 同一 `paymentId` 重试返回相同结果，防止重复扣款 / 重复转移。

### 11. 内容审核管线

支撑 R12 全部条款。多阶段流水线，按"早拒绝"成本递减原则排列：

```
[移动端]                    [服务端]                          [人工 + cn-region]
  │                            │                                   │
  ▼                            ▼                                   ▼
1. Pre-upload 人脸检测  →  2. Upload-time 版权角色分类  →  4. Pre-listing 队列 (24h SLA)
   + 一次性免责声明确认                                         + 5. Post-publish 举报队列 (48h SLA)
                                                                   + 6. cn-region: baidu / aliyun overlay
                              ▼
                            3. Post-generation 敏感词检查
                               (auto-regenerate ≤ 3 次)
```

| Stage | 触发点 | 实现 | 失败动作 |
|-------|--------|------|----------|
| 1. Pre-upload (mobile) | Scanner 启动 | TFLite face detector (~3 MB) + 一次性 disclaimer 确认 gate | 拒绝 upload，引导用户调整角度（R12.1 / R12.2） |
| 2. Upload-time (server) | 图像到达后端 | 版权角色分类器 — Replicate / Hive Moderation API 或自部署 CLIP-based 分类器；置信度 > 70% 即拒绝 | 返回 "this character is not eligible" 错误（R12.3） |
| 3. Post-generation | AI_Interpreter / Character_Generator 输出后 | 敏感词列表匹配 name / backstory / skill 文本；命中即 auto-regenerate | 最多重试 3 次，仍命中则回退到 safe defaults（"Mystery Character" + 中性背景，R12.4） |
| 4. Pre-listing | 用户点击 "List for sale" | 入审核队列：perceptual hash + name + backstory + skill 文本 + 3D preview frame；24 h SLA；reviewer dashboard | 通过 → listing 公开；拒绝 → 通知 owner 原因（R12.5） |
| 5. Post-publish | 用户点击 in-app Report | 入举报队列；48 h SLA；可触发下架 + 退款（R12.7） | 违规 → 下架 + 通知 + 退所有 pending battles（R12.6 / R12.7） |
| 6. Region-specific | cn-region 部署 | 在 stage 2 / 4 之上叠加 baidu / aliyun moderation API；所有拒绝记日志合规审计 | 同 stage 4（R12.9） |

**审核记录实体**（12 个月留存，R12.8）：

```typescript
@Entity('world_asset_moderation_decisions')
class ModerationDecision {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() worldAssetId: string;
  @Column({ type: 'enum', enum: ['pre_upload_face', 'pre_upload_copyright', 'post_gen_words', 'pre_listing', 'post_publish_report'] })
  stage: string;
  @Column({ type: 'enum', enum: ['approved', 'rejected', 'pending'] })
  decision: string;
  @Column({ nullable: true }) reason: string;
  @Column({ nullable: true }) reviewerId: string;
  @Column({ type: 'float', nullable: true }) automatedScore: number;
  @CreateDateColumn() createdAt: Date;
  // 12-month retention enforced by ttl-cleanup-job (R12.8)
}
```

### 12. 配额与限流实现

支撑 R13 全部条款。基于 Redis + 现有 `agent_cost_records` 表，**不**新建配额专用表。

- **Daily quota tracker**：Redis `INCR` + 当日 UTC 末 TTL
  - Key 格式：`quota:{eventType}:{userId}:{utcDate}`（例：`quota:scan_quick:u123:2026-05-12`）
  - TTL：到 UTC 当日 24:00 的剩余秒数（自然过期即满足 R13.3 重置语义）
- **订阅档位查询**：`workspaceService.getPlan(userId)` 返回 `FREE | PRO | BUSINESS | ENTERPRISE`，每档对应不同 daily limit
- **月度成本上限**（R13.4）：
  - 实时查询：`SUM(agent_cost_records.estimatedCostUsd) WHERE userId = $1 AND createdAt >= date_trunc('month', now())`
  - 80% 阈值 → soft warning + 升级提示
  - 100% 阈值 → 阻断生成操作直至下月 / 升级 / 用 AXP 购买额外配额
  - FREE 档默认 5 USD（**待运营基于 ARPU 模型最终签字**，参见 Open Questions）
- **AXP 购买额外配额**（R13.5）：
  - 新端点 `POST /api/v1/world-engine/quota/purchase`
  - 从 AXP 余额扣款 → 写一行 `quota_purchase` 记录 → 在 Redis 写入 `purchased_quota:{eventType}:{userId}` 计数（30 天 TTL）
  - 消耗顺序：免费配额 → purchased 配额（先消费即将过期的）
- **Rate-limit**（R13.6）：
  - NestJS `@Throttle()` 装饰器叠加双层规则：`{ ttl: 10s, limit: 1 }` + `{ ttl: 3600s, limit: 50 }`
  - **并发上限**：用 Redis SET `inflight:{userId}` 记录正在跑的 jobId，size > 10 即返回 HTTP 429 + `Retry-After`
- **Admin dashboard**（R13.7）：
  - 后端端点 `/api/admin/world-engine/cost-summary`
  - 数据源：基于 `agent_cost_records` 的 PostgreSQL **物化视图**（按 Provider / userId / day 聚合）
  - 物化视图每 15 分钟由 cron 刷新一次（`REFRESH MATERIALIZED VIEW CONCURRENTLY`）

## Integration Points with Existing Systems

| 现有系统 | 集成方式 | 数据流 |
|---------|---------|--------|
| Agent System (`/api/v1/agents`) | 扩展现有 API，新增 world-engine 相关 **可选** 字段（向后兼容，R11.4） | WorldAsset → Agent 绑定 / 解绑 |
| Marketplace (`/api/v1/marketplace`) | 新增 `world-assets` 子路由（R11.5），不修改现有路由 | WorldAsset → Listing → Transaction |
| User System | 复用现有 auth/user 模块 | userId 关联所有资产 |
| Push Notification | 复用现有推送基础设施 | 生成完成 / 挑战通知 |
| Creator Studio | 共享 3D 资产存储（S3） | 复用上传 / 存储管线 |
| Subscription System | 复用现有订阅检查 | Agent slot 限制检查 |
| **Workspace System** (`backend/src/modules/workspace/`) | `agentBindingService` 调用 `workspaceService.checkAgentQuota(userId)` 验证 maxAgents (FREE=3 / PRO=10 / BUSINESS=50 / ENTERPRISE=200，R11.2)；World_Asset 绑定的 Agent 与现有 Pet 绑定的 Agent **共享同一配额**（R11.3） | userId → workspace.maxAgents → 已绑定 Agent 计数 |
| **Pets System** (`living_pets`, `family_pets`) | World_Asset 是**完全独立**的表 `world_assets`，不修改 pets schema（R11.1）。Inventory UI 显示两个隔离的 section（R11.6） | 隔离，仅在 Agent 配额上汇合 |
| **Cost Tracking** (`agent_cost_records`) | 复用现有表，新增 `eventType` 取值 ∈ `{scan_quick, scan_detail, scan_room, gen_character, gen_dungeon, style_render, regen_character, replay_video, share_card}`，`tier` 列已存在（R13.1） | 每次生成事件 → 写一行 cost record |
| **Feature Flag** | 检查 `feature_flags.world_engine_enabled` 开关（R11.8）；未启用时不暴露 World Engine 入口 | 所有 World Engine UI / API 入口先经 flag gate |
| **Moderation** (baidu / aliyun) | 复用现有内容审核 API；marketplace 上架前调用统一的 `moderationService.submitForReview(asset)`（R12.5） | Asset → 审核队列 → approved / rejected → listing 可见性 |

## Correctness Properties

### Property 1: 确定性战斗结果
给定相同的两个角色属性和相同的随机种子，战斗结果（每回合伤害、胜负）必须完全一致。
**Validates: Requirements 5.3**

### Property 2: 属性映射确定性
给定相同的 SemanticDescription 输入，Character_Generator 产出的 stats 必须完全一致（确定性映射公式）。
**Validates: Requirements 3.2**

### Property 3: 质量评分一致性
给定相同的图像帧，Quality_Gate 的 sharpness/exposure 评分偏差不超过 ±2 分。
**Validates: Requirements 1.7**

### Property 4: 资产所有权完整性
任何时刻，一个 WorldAsset 有且仅有一个 owner_id。交易过程中不存在"无主"或"双主"状态。
**Validates: Requirements 8.3, 8.4**

### Property 5: Agent Slot 约束
用户绑定的 Agent 数量永远不超过其订阅等级允许的最大值（免费用户 ≤ 3）。
**Validates: Requirements 6.6**

### Property 6: 副本代码唯一性
所有活跃的 dungeon share_code 在系统中唯一，且在30天过期前不会被复用。
**Validates: Requirements 4.5**

### Property 7: XP 单调递增
WorldAsset 的 xp 字段只能增加，不能减少（除非资产被删除）。
**Validates: Requirements 6.4**

### Property 8: 风格化保真性
Style_Renderer 处理后模型的最大轴长度 `max(length, width, height)` 与原始 mesh 同维度的相对偏差不超过 25%；且原始 mesh 的轴向比例排序（哪个维度最长 / 最短）保持不变 — 解决"形态可识别性"目标，同时允许风格化拉伸。
**Validates: Requirements 2.10**

### Property 9: Agent slot 配额一致性
任何时刻，用户绑定的 Agent 总数（Pet 系统 Agent + World_Asset 系统 Agent）不超过其 `workspace.maxAgents`。两个系统对同一 quota 的并发绑定操作必须串行化（数据库行级锁或 Redis 互斥锁）以防止竞态。
**Validates: Requirements 11.2, 11.3, 6.6**

### Property 10: Agent API 向后兼容性
`GET /api/v1/agents/:id/status` 在添加 world-engine 字段后，对不带 `?includeWorldEngine=true` 查询参数的请求返回的 JSON 与 World Engine 上线之前的 schema 严格相等（字段集合、字段类型、必填性均不变）；新字段仅在显式 opt-in 时才出现。
**Validates: Requirements 11.4**

### Property 11: 配额单调消耗与重置
同一 `(userId, eventType, utcDate)` 三元组的成功调用次数在该 utcDate 内严格不递减；当 utcDate 翻转时计数器重置为 0；当用户被拒绝（HTTP 429）时计数器不增加。
**Validates: Requirements 13.2, 13.3**

## Security Considerations

- 图像上传：限制单文件 2MB，总会话 20MB，防止存储滥用
- 3D 资产：服务端生成，客户端只接收 .glb URL，防止注入
- 战斗种子：种子对双方可见，防止作弊质疑
- Agent 行为：Agent 自主行为频率硬限制（4次/小时），防止滥用 API 配额
- 交易：所有权转移使用数据库事务 + 乐观锁，失败自动回滚
- 深度链接：token 化 URL，不暴露内部 ID 给未授权用户

## Error Handling

| 错误场景 | 处理策略 | 用户体验 |
|---------|---------|---------|
| 3D重建超时 (fast >15s / precision >90s) | 中止任务，释放GPU资源 | 显示超时提示 + 重试按钮 |
| 3D重建质量过低 (confidence <40%) | 返回结果但标记低质量 | 建议切换到 Detail Scan |
| Provider 不可用 | 自动 fallback 到备选 Provider | 用户无感知，可能略慢 |
| AI Interpreter API 超时 | 重试2次，间隔2s | 显示"AI分析中"延长等待 |
| Agent 绑定失败 | 保留资产为 unbound 状态 | 显示错误原因 + 重试 |
| 交易转移失败 | 数据库事务回滚 | 通知双方，资产留在卖方 |
| 图像上传网络中断 | 本地保留，恢复后自动重传 | 显示队列状态 |
| 副本生成覆盖不足 (<180°) | 生成部分副本 + 迷雾边界 | 提示继续扫描可扩展 |
| 战斗对手资产已删除 | 取消挑战 | 通知双方挑战已取消 |
| 分享平台不可用 | 提供复制链接备选 | 显示错误 + 复制链接按钮 |

**全局重试策略：**
- 网络请求：指数退避，最多3次，间隔 1s → 2s → 4s
- GPU 任务：不重试（资源昂贵），直接返回错误
- LLM API：重试2次，间隔 2s

## Testing Strategy

### 单元测试
- 战斗公式确定性验证（Property 1）：给定固定种子，验证输出一致
- 属性映射公式（Property 2）：相同输入 → 相同输出
- Quality_Gate 评分算法：已知图像 → 预期分数范围
- XP 计算逻辑：验证单调递增（Property 7）

### 集成测试
- 双轨管线端到端：上传图像 → 获取 .glb → 验证格式和面数
- Agent 绑定流程：创建资产 → 绑定 → 验证 API 响应
- 交易流程：上架 → 购买 → 验证所有权转移（Property 4）
- 副本生成：提交房间数据 → 验证 share_code 唯一性（Property 6）

### Property-Based Tests
- 战斗确定性：随机生成角色对 × 随机种子，验证重放一致性
- Slot 约束：随机绑定/解绑序列，验证永不超限（Property 5）
- 所有权完整性：并发交易模拟，验证无双主状态（Property 4）
- 风格化保真：随机模型 + 随机风格，验证包围盒偏差 ≤10%（Property 8）

### E2E 测试
- 完整扫描→生成→角色→战斗→分享流程
- 离线拍摄→恢复网络→自动提交
- 深度链接打开→Web预览→App跳转

## Performance Budget

| 操作 | 目标延迟 | 备注 |
|------|---------|------|
| Quick Scan → 3D mesh | ≤ 15s | 含上传 + 重建 |
| Detail Scan → 3D mesh | ≤ 90s | 含上传 + 重建 |
| Style rendering | ≤ 5s | 服务端 GPU |
| Character generation | ≤ 15s | LLM API call |
| Dungeon generation | ≤ 30s | 含布局 + 敌人 + 主题 |
| Battle per round | ≤ 10s | 含动画生成 |
| Share card generation | ≤ 5s | 含 GIF + overlay |
| Replay video | ≤ 10s | FFmpeg server-side |
| Quality_Gate Layer 1 (mobile-side) | ≤ 2ms/frame | TFLite mobile |
| Camera preview FPS | ≥ 30 FPS (P99) | 含 AR overlay |
| Face detection (mobile pre-upload) | ≤ 50ms/frame | TFLite ~3MB 模型，R12.2 |
| Copyrighted-char classifier (server) | ≤ 2s/upload | CLIP-based 或第三方 API，R12.3 |
| Quota check (Redis lookup) | ≤ 10ms | `INCR` + TTL 键，R13.2 |
| Moderation queue SLA — listing review | ≤ 24h | R12.5 |
| Moderation queue SLA — user report | ≤ 48h | R12.6 |
| Inventory thumbnail load | ≤ 200ms p50（本地缓存）/ ≤ 1s（网络） | 256×256 PNG，R10.5 |
| Admin dashboard refresh | 15 min | R13.7 |

## Open Questions / Phase 1 Decisions Pending

下面这些条目影响最终架构选型，但属于 **product / ops / finance** 决策，不应由工程侧单方面定。设计文档把它们显式记录下来以避免被遗忘，待责任方签字后再回填到对应章节：

1. **最终 Provider 选型**（影响 § 7）— 快速轨与精度轨各自的生产合同 Provider 是哪一家？候选：Meshy（fast）vs Stability AI（precision）vs RunPod 自部署混合方案？决策影响：Provider Registry 默认 Provider 列表 + 月度成本预算。
2. **审核团队产能**（影响 § 11）— 24 h listing review SLA + 48 h report review SLA 对应需要多少全职 reviewer？复用现有内容审核团队还是另招？决策影响：moderation queue 的实际可达 SLA 与 backlog 风险评估。
3. **免费用户月度成本上限**（影响 § 12）— 当前占位 5 USD / 月，需要运营基于 ARPU 模型签字。决策影响：免费档 quota 数值 + 是否需要更激进的 AXP 引导。
4. **AXP 配额购买兑换率**（影响 § 12 与 R13.5）— 占位汇率（1 Quick Scan = 10 AXP / 1 Detail Scan = 50 AXP / 1 Dungeon = 30 AXP / 1 Replay Video = 5 AXP）需要财务 / tokenomics 团队复核后才能正式发布。决策影响：AXP 经济模型的可持续性。
5. **Feature flag 灰度排期**（影响 R11.8）— beta cohort 的筛选标准是什么？地理位置 / 账号年龄 / 是否已拥有 Pet 系统资产？决策影响：1% → 10% → 100% 灰度的具体触发条件。
