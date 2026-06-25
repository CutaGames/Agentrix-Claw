import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum SlashCommandSource {
  BUILTIN = 'builtin',
  USER = 'user',
  PLUGIN = 'plugin',
}

@Entity('slash_commands')
@Index(['userId', 'name'], { unique: true })
export class SlashCommand {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  userId?: string; // null = global/builtin

  @Column({ length: 50 })
  name: string; // command name without leading /

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'text' })
  promptTemplate: string; // The prompt that gets injected when this command is invoked

  @Column({ type: 'enum', enum: SlashCommandSource, default: SlashCommandSource.USER })
  source: SlashCommandSource;

  @Column({ type: 'text', nullable: true })
  pluginId?: string; // if source is PLUGIN

  @Column({ type: 'jsonb', nullable: true })
  parameters?: Array<{
    name: string;
    description?: string;
    required?: boolean;
    type?: 'string' | 'number' | 'boolean';
  }>;

  @Column({ default: true })
  isEnabled: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
