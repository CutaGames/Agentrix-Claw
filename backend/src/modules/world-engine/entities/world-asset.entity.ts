import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  VersionColumn,
  Index,
} from 'typeorm';

/**
 * WorldAsset — 由现实物体生成的游戏世界资产。
 *
 * 包含 3D 模型引用、AI 语义描述、游戏属性（stats/skills/behavior tree）、
 * 成长系统（level/xp/skill slots）、战斗记录、Agent 绑定状态。
 *
 * 乐观锁 @VersionColumn 用于资产所有权两阶段转移协议（design §10）。
 */
@Entity('world_assets')
@Index(['ownerId'])
@Index(['boundAgentId'])
export class WorldAsset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Current owner (FK → users.id) */
  @Column()
  ownerId: string;

  /** Original scanner/creator — immutable after creation */
  @Column()
  originalCreatorId: string;

  @Column({ type: 'varchar', length: 30 })
  name: string;

  @Column({ type: 'enum', enum: ['character', 'dungeon', 'weapon'] })
  category: string;

  @Column({ type: 'enum', enum: ['quick', 'detail'] })
  scanMode: string;

  /** S3 path to raw .glb mesh (nullable while generation_status != complete) */
  @Column({ nullable: true })
  meshUrl: string | null;

  /** S3 path to stylized .glb mesh (nullable while generation_status != complete) */
  @Column({ nullable: true })
  styledMeshUrl: string | null;

  /**
   * 2D 立绘兜底 (2026-05-30): 角色卡的 2D 形象图 URL。
   * 创建时即用用户拍摄的扫描照片(公网 URL)填充, 保证"拍照→秒得有形象的角色"100% 成功,
   * 不依赖 3D mesh。3D 完成后客户端可优先展示 styledMeshUrl, 否则回退 portraitUrl。
   */
  @Column({ type: 'varchar', length: 1024, nullable: true })
  portraitUrl: string | null;

  /** Stylization preset applied (cartoon/pixel-art/fantasy/sci-fi/realistic) */
  @Column({ type: 'varchar', length: 20 })
  styleType: string;

  /** AI Interpreter structured semantic output */
  @Column({ type: 'jsonb' })
  semanticDescription: Record<string, unknown>;

  /** Character base stats { hp, atk, def, spd, int } */
  @Column({ type: 'jsonb' })
  stats: Record<string, number>;

  /** Character skills (2-4 starter + 0-4 growth) */
  @Column({ type: 'jsonb' })
  skills: Record<string, unknown>[];

  /** 3-5 personality trait strings */
  @Column({ type: 'jsonb' })
  personalityTraits: string[];

  /** Character backstory (50-150 words) */
  @Column({ type: 'text', nullable: true })
  backstory: string | null;

  /** AI behavior tree with idle/combat/social branches */
  @Column({ type: 'jsonb' })
  behaviorTree: Record<string, unknown>;

  /** Character level (starts at 1) */
  @Column({ default: 1 })
  level: number;

  /** Experience points (monotonically increasing) */
  @Column({ default: 0 })
  xp: number;

  /** Growth skill slots unlocked via XP (max 4) */
  @Column({ default: 0 })
  unlockedSkillSlots: number;

  /** Total battle wins */
  @Column({ default: 0 })
  battleWins: number;

  /** Total battle losses */
  @Column({ default: 0 })
  battleLosses: number;

  /** Bound Agentrix Agent instance (FK → agents.id) */
  @Column({ nullable: true })
  boundAgentId: string | null;

  /** How this asset was acquired */
  @Column({ type: 'enum', enum: ['scanned', 'purchased', 'gifted', 'guest_trial'] })
  source: string;

  /**
   * 用途类别(#2 共建素材):
   *   - 'character'(默认):角色/战斗资产(原有行为不变)
   *   - 'build_material':可作为永曜城建造素材(餐厅桌椅、招牌、货架等)
   *   - 'decor':纯装饰摆件
   * 拍照创建时用户可勾"这是用来建造的"→ build_material;存量默认 character。
   * AeonBuild「我的素材」分页据此过滤展示用户自有可摆放资产。
   */
  @Column({ type: 'varchar', length: 20, default: 'character' })
  usageKind: string;

  /**
   * Generation lifecycle status (方案 B):
   *   - 'card_ready'   : AI 属性已生成, 角色卡可展示, 3D mesh 后台生成中
   *   - 'mesh_pending' : 3D job 已提交, 轮询中
   *   - 'complete'     : 3D mesh 就绪(meshUrl 已填)
   *   - 'mesh_failed'  : 3D 生成失败/超时, 但卡片与属性保留, 可重试 3D
   * 存量资产迁移时默认 'complete'。
   */
  @Column({ type: 'varchar', length: 20, default: 'complete' })
  generationStatus: string;

  /** Metadata about the source scan images */
  @Column({ type: 'jsonb', nullable: true })
  sourceImagesMetadata: Record<string, unknown>[] | null;

  /**
   * Phase A 能力飞轮 (design WORLD_ENGINE_X_AGENTRIX_ABILITY_BINDING §3 支柱2)。
   *
   * 能力加成快照 — 在创建/进化时刻读一次真实 agent 战绩 (agent_reputations /
   * agent_stats / living_pets) 算出, **快照化**写死, 保证战斗回放确定性 (§5 红线):
   *   {
   *     multiplier: number,            // 总倍率 clamp [1.0, 2.2]
   *     breakdown: {...},              // 各项加成来源 (展示用)
   *     baseStats: {...},              // canonical 基础属性 (= stats 列)
   *     effectiveStats: {...},         // baseStats × multiplier, 战斗/展示实际用
   *     sourceAgentAccountId: string|null,
   *     computedAt: string,            // ISO
   *     version: 1,
   *   }
   *
   * 注意: canonical `stats` 列保持 R3.1 不变式 (sum 150-350, 每项 1-100) 不被污染;
   * 战斗与展示读 abilitySnapshot.effectiveStats。null = 未计算 (老资产/游客)。
   */
  @Column({ type: 'jsonb', nullable: true })
  abilitySnapshot: Record<string, unknown> | null;

  /**
   * Phase A 灵魂统一 (design §1 支柱1, 字段先建, 逻辑 Phase C 落地)。
   * 关联到主宠灵魂 LivingPet.id ("化身主宠" 绑定模式)。null = 未关联。
   */
  @Column({ type: 'uuid', nullable: true })
  linkedSoulId: string | null;

  /**
   * Phase A 能力飞轮。能力加成来源的真实 agent_accounts.id
   * ("绑定真实 agent" 模式)。null = 用 owner 的最强 agent 自动推断 / 无 agent。
   */
  @Column({ type: 'uuid', nullable: true })
  sourceAgentAccountId: string | null;

  /**
   * Phase A2。上次世界模拟 tick 的时间戳(ms, string for bigint)。
   * 用于离线"时间快进"的辅助记录(权威进度以 worldState.lastTickBucket 为准)。
   */
  @Column({ type: 'bigint', nullable: true })
  lastTickAt: string | null;

  /**
   * Phase A2 活世界。居民在世界里的实时状态快照:
   *   {
   *     job?: string,            // 当前职业/在干什么(吃 specializations)
   *     mood?: string,           // 心情(happy/tired/proud/...)
   *     location?: string,       // 所在区域
   *     lastTickBucket?: number, // 最近一次被 tick 结算的桶, 用于离线补算
   *     relationships?: {...},   // 关系网(二期)
   *   }
   * null = 尚未"入住"世界(老资产/未激活)。
   */
  @Column({ type: 'jsonb', nullable: true })
  worldState: Record<string, unknown> | null;

  /** Optimistic lock version for two-phase ownership transfer (design §10) */
  @VersionColumn()
  version: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
