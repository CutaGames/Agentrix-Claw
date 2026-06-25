import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { WorktreeLaneEntity, WorktreeLaneStatus } from '../../entities/worktree-lane.entity';

/**
 * WorktreeLaneService — CRUD + bulk-import for the W1 multi-agent
 * spec lane backend table.
 *
 * Spec: design.md §6.1, §6.2
 * Tasks: W1 1.2
 */
export interface CreateLaneDto {
  userId: string;
  workspaceDir: string;
  baseBranch: string;
  worktreeBranch: string;
  worktreeDirectory: string;
  mission?: string;
  focusFiles?: string;
  status?: WorktreeLaneStatus;
  agentId?: string | null;
  agentTaskId?: string | null;
}

export interface BulkImportDto {
  userId: string;
  lanes: Array<CreateLaneDto>;
}

export type UpdateLanePatch = Partial<
  Pick<
    CreateLaneDto,
    | 'mission'
    | 'focusFiles'
    | 'status'
    | 'agentId'
    | 'agentTaskId'
    | 'baseBranch'
    | 'worktreeBranch'
    | 'worktreeDirectory'
  >
>;

@Injectable()
export class WorktreeLaneService {
  constructor(
    @InjectRepository(WorktreeLaneEntity)
    private readonly laneRepo: Repository<WorktreeLaneEntity>,
  ) {}

  /** List all lanes for a user, optionally scoped to a workspace dir. */
  async listLanes(userId: string, workspaceDir?: string): Promise<WorktreeLaneEntity[]> {
    const where: Record<string, unknown> = { userId };
    if (workspaceDir) where.workspaceDir = workspaceDir;
    return this.laneRepo.find({
      where,
      order: { createdAt: 'ASC' },
    });
  }

  async getById(userId: string, laneId: string): Promise<WorktreeLaneEntity> {
    const lane = await this.laneRepo.findOne({ where: { id: laneId, userId } });
    if (!lane) throw new NotFoundException('lane_not_found');
    return lane;
  }

  /**
   * Idempotent bulk-import called once on desktop boot to migrate from
   * localStorage. Lanes are de-duped by (userId, workspaceDir,
   * worktreeBranch). Existing rows are updated; new rows inserted.
   */
  async bulkImport(dto: BulkImportDto): Promise<{ imported: number; updated: number }> {
    if (!dto.userId) throw new BadRequestException('userId required');
    if (!Array.isArray(dto.lanes)) throw new BadRequestException('lanes must be array');

    let imported = 0;
    let updated = 0;

    for (const laneDto of dto.lanes) {
      if (laneDto.userId !== dto.userId) {
        // Reject cross-user smuggling — payload userId must match outer userId
        continue;
      }
      const existing = await this.laneRepo.findOne({
        where: {
          userId: dto.userId,
          workspaceDir: laneDto.workspaceDir,
          worktreeBranch: laneDto.worktreeBranch,
        },
      });
      if (existing) {
        await this.laneRepo.update(existing.id, {
          baseBranch: laneDto.baseBranch,
          worktreeDirectory: laneDto.worktreeDirectory,
          mission: laneDto.mission ?? existing.mission,
          focusFiles: laneDto.focusFiles ?? existing.focusFiles,
          status: laneDto.status ?? existing.status,
          agentId: laneDto.agentId ?? existing.agentId,
          agentTaskId: laneDto.agentTaskId ?? existing.agentTaskId,
        });
        updated += 1;
      } else {
        const lane = this.laneRepo.create({
          userId: dto.userId,
          workspaceDir: laneDto.workspaceDir,
          baseBranch: laneDto.baseBranch,
          worktreeBranch: laneDto.worktreeBranch,
          worktreeDirectory: laneDto.worktreeDirectory,
          mission: laneDto.mission ?? '',
          focusFiles: laneDto.focusFiles ?? '',
          status: laneDto.status ?? 'idle',
          agentId: laneDto.agentId ?? null,
          agentTaskId: laneDto.agentTaskId ?? null,
        });
        await this.laneRepo.save(lane);
        imported += 1;
      }
    }

    return { imported, updated };
  }

  async createLane(dto: CreateLaneDto): Promise<WorktreeLaneEntity> {
    if (!dto.userId) throw new BadRequestException('userId required');
    if (!dto.worktreeBranch) throw new BadRequestException('worktreeBranch required');
    const lane = this.laneRepo.create({
      userId: dto.userId,
      workspaceDir: dto.workspaceDir,
      baseBranch: dto.baseBranch,
      worktreeBranch: dto.worktreeBranch,
      worktreeDirectory: dto.worktreeDirectory,
      mission: dto.mission ?? '',
      focusFiles: dto.focusFiles ?? '',
      status: dto.status ?? 'idle',
      agentId: dto.agentId ?? null,
      agentTaskId: dto.agentTaskId ?? null,
    });
    return this.laneRepo.save(lane);
  }

  async updateLane(
    userId: string,
    laneId: string,
    patch: UpdateLanePatch,
  ): Promise<WorktreeLaneEntity> {
    const lane = await this.getById(userId, laneId);
    await this.laneRepo.update(lane.id, patch);
    return this.getById(userId, laneId);
  }

  async deleteLane(userId: string, laneId: string): Promise<void> {
    const lane = await this.getById(userId, laneId);
    await this.laneRepo.delete(lane.id);
  }

  /**
   * Auto-link a lane to a sub-task when the sub-task creates a worktree.
   * Used by `agent-task.worker.ts` extension (W2 task 2.4) — but the
   * service method is added in W1 so the migration + entity are
   * complete and unit-tested before W2 code lands.
   *
   * Idempotent — uses optimistic-lock pattern: only succeeds if lane
   * has agent_id IS NULL (Property 4 — Lane × agent uniqueness).
   */
  async tryClaimForAgent(
    userId: string,
    workspaceDir: string,
    worktreeBranch: string,
    agentId: string,
    agentTaskId: string,
  ): Promise<WorktreeLaneEntity | null> {
    const result = await this.laneRepo
      .createQueryBuilder()
      .update(WorktreeLaneEntity)
      .set({ agentId, agentTaskId })
      .where('user_id = :userId', { userId })
      .andWhere('workspace_dir = :workspaceDir', { workspaceDir })
      .andWhere('worktree_branch = :worktreeBranch', { worktreeBranch })
      .andWhere('agent_id IS NULL')
      .execute();
    if (result.affected && result.affected > 0) {
      return this.laneRepo.findOne({
        where: { userId, workspaceDir, worktreeBranch },
      });
    }
    return null;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Multi-Agent v1 W5.8 — attempt-merge with conflict detection.
  //
  // v1 simplification: real `git merge --no-ff` is desktop-side concern.
  // Server-side detection asks: are there OTHER lanes on the same
  // baseBranch in 'review' status (i.e. ready-to-merge but not merged
  // yet)? If yes,return conflict info. If no, transition this lane's
  // status to 'merged' and return ok.
  //
  // Spec: design.md §8.2; tasks.md W5.8
  // ─────────────────────────────────────────────────────────────────────
  async attemptMerge(
    userId: string,
    laneId: string,
  ): Promise<{
    conflict: boolean;
    conflictingLaneId?: string;
    conflictingBranch?: string;
    laneId: string;
    status: string;
  }> {
    const lane = await this.getById(userId, laneId);
    if (lane.status === 'merged') {
      return { conflict: false, laneId: lane.id, status: 'merged' };
    }

    // Look for other lanes on the same base_branch in 'review' state.
    const peers = await this.laneRepo
      .createQueryBuilder('l')
      .where('l.user_id = :userId', { userId })
      .andWhere('l.workspace_dir = :ws', { ws: lane.workspaceDir })
      .andWhere('l.base_branch = :base', { base: lane.baseBranch })
      .andWhere('l.id != :id', { id: lane.id })
      .andWhere('l.status = :status', { status: 'review' })
      .getMany();

    if (peers.length > 0) {
      // Mark BOTH lanes as 'blocked' so the UI can surface the conflict.
      await this.laneRepo.update({ id: lane.id }, { status: 'blocked' });
      await this.laneRepo.update({ id: peers[0].id }, { status: 'blocked' });
      return {
        conflict: true,
        conflictingLaneId: peers[0].id,
        conflictingBranch: peers[0].worktreeBranch,
        laneId: lane.id,
        status: 'blocked',
      };
    }

    // No conflict → transition to merged.
    await this.laneRepo.update({ id: lane.id }, { status: 'merged' });
    return { conflict: false, laneId: lane.id, status: 'merged' };
  }
}
