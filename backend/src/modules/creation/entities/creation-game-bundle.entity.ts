import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
} from 'typeorm';

/**
 * CreationGameBundleEntity — game 类型创作的可玩 HTML5 产物(World Creation & Feed · 方案 A)。
 *
 * spec: .kiro/specs/world-creation-feed —— "game" 创作的真实可玩内容载体。
 *   - LLM 生成自包含 HTML(canvas/JS)为主;校验失败用内置模板兜底(source 区分)。
 *   - WebView srcdoc 直接渲染;沙箱在客户端施加(CSP/无 token/无任意网络)。
 *
 * 仓库硬规则(AGENTS.md):全局 SnakeNamingStrategy —— `@Column()` 禁止手写 `name:`。
 * 列名由 camelCase 属性自动派生为 snake_case。
 */
@Entity('creation_game_bundles')
@Index(['creationId'])
// 同一 creation 的最新版本即当前可玩版本(version 单调递增)。
@Index(['creationId', 'version'], { unique: true })
export class CreationGameBundleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 所属创作 id(FK 语义 → creations.id)。 */
  @Column({ type: 'uuid' })
  creationId: string;

  /** 版本号(单调递增;最新 = 当前)。 */
  @Column({ type: 'integer', default: 1 })
  version: number;

  /** 展示标题(取自创作标题或生成)。 */
  @Column({ type: 'varchar', length: 120 })
  title: string;

  /** 运行引擎类型(当前仅 html5-canvas;预留扩展)。 */
  @Column({ type: 'varchar', length: 32, default: 'html5-canvas' })
  engine: string;

  /** 来源:llm = 模型生成;template = 内置模板兜底;embed = 外链/嵌入第三方网页游戏。 */
  @Column({ type: 'varchar', length: 16, default: 'template' })
  source: 'llm' | 'template' | 'embed';

  /** 自包含 HTML 文档(llm/template 用;embed 为占位)。 */
  @Column({ type: 'text' })
  html: string;

  /** 外链游戏 URL(source=embed 时有效;WebView 直接加载)。 */
  @Column({ type: 'text', nullable: true })
  url: string | null;

  /** 外链来源分类(opensource / distribution / upload / 域名;source=embed 时有意义)。 */
  @Column({ type: 'varchar', length: 64, nullable: true })
  provider: string | null;

  /** 生成所用 prompt(审计/再生成用,可空)。 */
  @Column({ type: 'text', nullable: true })
  prompt: string | null;

  /** 生成所用模型(友好名,如 claude-sonnet-4-6;template 兜底时为 null)。前端据此提示用户。 */
  @Column({ type: 'varchar', length: 64, nullable: true })
  modelUsed: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
