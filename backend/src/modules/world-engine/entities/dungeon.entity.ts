import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Dungeon — AI 生成的副本地图（由房间扫描转化）。
 *
 * 包含布局、敌人、战利品、Boss 配置。
 * 通过 shareCode 分享给其他用户（6-12 位字母数字，30 天有效）。
 */
@Entity('dungeons')
@Index(['shareCode'], { unique: true })
export class Dungeon {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Creator user (FK → users.id) */
  @Column()
  creatorId: string;

  /** Associated WorldAsset (FK → world_assets.id) */
  @Column()
  worldAssetId: string;

  /** Shareable dungeon code (6-12 alphanumeric, unique) */
  @Column({ type: 'varchar', length: 12 })
  shareCode: string;

  /** Room layout with walls, doors, furniture, walkable areas */
  @Column({ type: 'jsonb' })
  layout: Record<string, unknown>;

  /** Generated enemies (3-8 based on room area) */
  @Column({ type: 'jsonb' })
  enemies: DungeonEnemy[];

  /** Loot items placed near furniture (2-5 items) */
  @Column({ type: 'jsonb' })
  lootItems: DungeonLoot[];

  /** Boss encounter configuration */
  @Column({ type: 'jsonb' })
  boss: DungeonBoss;

  /** Dungeon theme (fire/dream/data/neutral) */
  @Column({ type: 'varchar', length: 20 })
  theme: string;

  /** Scanned room area in square meters */
  @Column({ type: 'float' })
  roomAreaSqm: number;

  /** Degrees of 360° coverage captured */
  @Column({ type: 'float' })
  coverageDegrees: number;

  /** Difficulty rating (1-5) */
  @Column({ default: 1 })
  difficultyRating: number;

  /** Share code expiration (30 days from creation) */
  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}

// ─── Supporting interfaces (stored as JSONB) ───────────────────

export interface DungeonEnemy {
  id: string;
  name: string;
  type: string;
  hp: number;
  atk: number;
  position: { x: number; y: number };
}

export interface DungeonLoot {
  id: string;
  name: string;
  type: string;
  rarity: string;
  position: { x: number; y: number };
}

export interface DungeonBoss {
  id: string;
  name: string;
  type: string;
  hp: number;
  atk: number;
  def: number;
  skills: string[];
  position: { x: number; y: number };
}
