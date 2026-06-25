import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * WorktreeLane — backend-side mirror of the desktop `WorktreePanel.tsx`
 * lane data structure.
 *
 * Multi-agent v1 (W1) introduces this table so:
 *   1. Lanes can be displayed in `AgentTeamPanel` filtered by agent_id
 *      across devices (R4)
 *   2. Sub-tasks can auto-link via `agent_task_id` (R4.2)
 *   3. Status updates flow through the same WS channel as agent_tasks
 *
 * Migration path from existing localStorage-only storage:
 *   - First boot after upgrade → desktop client calls
 *     `POST /api/worktree-lanes/bulk-import` with localStorage payload
 *   - Subsequent reads → backend is source of truth, localStorage cache
 *
 * Spec: design.md §2.2 新增 5, §6.1
 */
export type WorktreeLaneStatus = 'idle' | 'running' | 'review' | 'merged' | 'blocked';

@Entity('worktree_lanes')
@Index(['userId', 'workspaceDir'])
@Index(['agentId'])
@Index(['agentTaskId'])
export class WorktreeLaneEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 64 })
  userId: string;

  @Column({ type: 'text' })
  workspaceDir: string;

  @Column({ length: 200 })
  baseBranch: string;

  @Column({ length: 200 })
  worktreeBranch: string;

  @Column({ length: 200 })
  worktreeDirectory: string;

  @Column({ type: 'text', default: '' })
  mission: string;

  @Column({ type: 'text', default: '' })
  focusFiles: string;

  @Column({ length: 16, default: 'idle' })
  status: WorktreeLaneStatus;

  /**
   * Optional binding to an AgentAccount.id (varchar 64). NULL for
   * human-owned lanes; set when a sub-task creates the lane (R4.2).
   */
  @Column({ length: 64, nullable: true })
  agentId: string | null;

  /**
   * Optional binding to the agent_tasks row that created the lane.
   * Allows reverse lookup ("which sub-task owns this lane?") for the
   * R12 rollback / conflict resolver flows.
   */
  @Column({ type: 'uuid', nullable: true })
  agentTaskId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
