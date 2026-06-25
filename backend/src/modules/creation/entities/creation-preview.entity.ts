import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import type { CreationPreviewKind } from '../../../../shared/types/creation';

/**
 * CreationPreviewEntity — 「预览物(Preview)」派生表(world-creation-feed task 1.3)。
 *
 * spec: .kiro/specs/world-creation-feed/{requirements,design}.md(§Data Models — Preview)
 *
 * 预览物是创作流卡片的轻量展示物(封面/短视频/回放/首帧),实现"预览 vs 进入分离"
 * (需求 5.2):流内只渲染轻量预览,显式上滑/点击才 `enter` 重型体验。发布时必须具备
 * 至少一个预览物(需求 3.2),否则拒绝发布或自动生成占位。
 *
 * 一个 Creation 可有多个预览物(多封面/多片段);`isPrimary` 标记创作流默认展示项,
 * `creations.preview`(jsonb)保留首选内联快照便于发现层零二次请求渲染(需求 1.8)。
 *
 * 仓库硬规则(AGENTS.md):全局 SnakeNamingStrategy —— `@Column()` 禁止手写 `name:`。
 */
@Entity('creation_previews')
@Index(['creationId'])
export class CreationPreviewEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 所属 Creation id(FK → creations.id)。 */
  @Column({ type: 'uuid' })
  creationId: string;

  /** 预览物类型:封面图 / 短视频 / 回放 / 首帧截图。 */
  @Column({ type: 'enum', enum: ['cover', 'video', 'replay', 'first_frame'] })
  kind: CreationPreviewKind;

  /** 预览资源地址(图片/视频 URL 或资产句柄)。 */
  @Column({ type: 'varchar', length: 1024 })
  url: string;

  /** 可选缩略图(用于流内快速渲染/省流模式)。 */
  @Column({ type: 'varchar', length: 1024, nullable: true })
  thumbnailUrl: string | null;

  /** 像素宽度(用于布局,避免抖动)。 */
  @Column({ type: 'integer', nullable: true })
  width: number | null;

  /** 像素高度。 */
  @Column({ type: 'integer', nullable: true })
  height: number | null;

  /** 视频/回放时长(毫秒);静态封面可空。 */
  @Column({ type: 'integer', nullable: true })
  durationMs: number | null;

  /** 是否为创作流默认展示的首选预览物(每个 Creation 至多一个为 true)。 */
  @Column({ type: 'boolean', default: false })
  isPrimary: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
