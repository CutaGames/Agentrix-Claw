import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DreamingSession,
  DreamPhase,
  DreamStatus,
} from '../../entities/dreaming-session.entity';
import { MemorySlotService, RecallOptions } from '../agent-context/memory-slot.service';
import { MemoryScope, MemoryType } from '../../entities/agent-memory.entity';

export interface StartDreamDto {
  agentId?: string;
  phase?: DreamPhase;
  triggerType?: 'idle' | 'scheduled' | 'manual';
  memoryScopes?: MemoryScope[];
}

export interface DreamInsight {
  type: 'connection' | 'pattern' | 'consolidation' | 'creative';
  content: string;
  sourceMemoryIds: string[];
  confidence: number;
  createdAt: string;
}

@Injectable()
export class DreamingService {
  private readonly logger = new Logger(DreamingService.name);

  constructor(
    @InjectRepository(DreamingSession)
    private readonly dreamRepo: Repository<DreamingSession>,
    private readonly memorySlotService: MemorySlotService,
  ) {}

  /** List dream sessions for a user */
  async listSessions(
    userId: string,
    opts?: { agentId?: string; status?: DreamStatus; limit?: number },
  ): Promise<DreamingSession[]> {
    const qb = this.dreamRepo
      .createQueryBuilder('ds')
      .where('ds.userId = :userId', { userId })
      .orderBy('ds.createdAt', 'DESC')
      .take(opts?.limit ?? 20);

    if (opts?.agentId) {
      qb.andWhere('ds.agentId = :agentId', { agentId: opts.agentId });
    }
    if (opts?.status) {
      qb.andWhere('ds.status = :status', { status: opts.status });
    }

    return qb.getMany();
  }

  /** Get a specific dream session */
  async getSession(userId: string, sessionId: string): Promise<DreamingSession> {
    const session = await this.dreamRepo.findOne({
      where: { id: sessionId, userId },
    });
    if (!session) throw new NotFoundException('Dream session not found');
    return session;
  }

  /** Start a new dream cycle */
  async startDream(userId: string, dto: StartDreamDto): Promise<DreamingSession> {
    const session = this.dreamRepo.create({
      userId,
      agentId: dto.agentId,
      phase: dto.phase ?? DreamPhase.LIGHT,
      status: DreamStatus.RUNNING,
      startedAt: new Date(),
      metadata: {
        triggerType: dto.triggerType ?? 'manual',
        memoryScopes: dto.memoryScopes ?? [MemoryScope.AGENT],
      },
    });

    const saved = await this.dreamRepo.save(session);

    // Run dream processing asynchronously
    this.processDream(saved).catch((err) =>
      this.logger.error(`Dream processing failed: ${err.message}`, err.stack),
    );

    return saved;
  }

  /** Core dream processing logic */
  private async processDream(session: DreamingSession): Promise<void> {
    const startTime = Date.now();
    const scopes = (session.metadata?.memoryScopes ?? ['agent']) as MemoryScope[];

    try {
      // Recall recent memories based on scopes
      const recallOpts: RecallOptions = {
        userId: session.userId,
        scopes,
        limit: 100,
      };
      if (session.agentId) {
        recallOpts.agentId = session.agentId;
      }
      const memories = await this.memorySlotService.recall(recallOpts);

      if (!memories || memories.length === 0) {
        await this.dreamRepo.update(session.id, {
          status: DreamStatus.COMPLETED,
          completedAt: new Date(),
          memoriesProcessed: 0,
          metadata: {
            ...session.metadata,
            durationMs: Date.now() - startTime,
          },
        });
        return;
      }

      // Generate insights based on dream phase
      const insights = this.generateInsights(memories, session.phase);

      // Store insights as new memories if valuable
      for (const insight of insights) {
        if (insight.confidence >= 0.7) {
          await this.memorySlotService.writeSlot(
            session.userId,
            {
              key: `dream_insight_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              value: { insight: insight.content, type: insight.type, sources: insight.sourceMemoryIds },
              scope: MemoryScope.AGENT,
              type: MemoryType.ENTITY,
              importance: insight.confidence,
              tags: ['dream', 'insight', insight.type],
            },
            undefined,
            session.agentId,
          );
        }
      }

      // Phase progression: light → deep → REM
      const nextPhase = this.getNextPhase(session.phase);

      await this.dreamRepo.update(session.id, {
        status: DreamStatus.COMPLETED,
        phase: nextPhase ?? session.phase,
        completedAt: new Date(),
        memoriesProcessed: memories.length,
        insightsGenerated: insights.length,
        insights,
        metadata: {
          ...session.metadata,
          durationMs: Date.now() - startTime,
          consolidationStrategy: session.phase,
        },
      });

      this.logger.log(
        `Dream session ${session.id} completed: ${memories.length} memories → ${insights.length} insights (${session.phase})`,
      );
    } catch (err) {
      await this.dreamRepo.update(session.id, {
        status: DreamStatus.FAILED,
        completedAt: new Date(),
        metadata: {
          ...session.metadata,
          durationMs: Date.now() - startTime,
        },
      });
      throw err;
    }
  }

  /** Generate insights from memory entries */
  private generateInsights(
    memories: any[],
    phase: DreamPhase,
  ): DreamInsight[] {
    const insights: DreamInsight[] = [];
    const now = new Date().toISOString();

    if (phase === DreamPhase.LIGHT) {
      // Light dreaming: find simple patterns and repetitions
      const keyGroups = new Map<string, any[]>();
      for (const m of memories) {
        const tags = m.metadata?.tags ?? [];
        for (const tag of tags) {
          if (!keyGroups.has(tag)) keyGroups.set(tag, []);
          keyGroups.get(tag)!.push(m);
        }
      }
      for (const [tag, group] of keyGroups) {
        if (group.length >= 3) {
          insights.push({
            type: 'pattern',
            content: `Recurring pattern in "${tag}": ${group.length} related memories found`,
            sourceMemoryIds: group.slice(0, 5).map((m: any) => m.id),
            confidence: Math.min(0.5 + group.length * 0.1, 0.95),
            createdAt: now,
          });
        }
      }
    }

    if (phase === DreamPhase.DEEP) {
      // Deep dreaming: consolidate and merge similar memories
      const sorted = [...memories].sort(
        (a, b) => (b.metadata?.importance ?? 0) - (a.metadata?.importance ?? 0),
      );
      const top = sorted.slice(0, 10);
      if (top.length >= 2) {
        insights.push({
          type: 'consolidation',
          content: `Memory consolidation: ${top.length} high-importance memories synthesized`,
          sourceMemoryIds: top.map((m: any) => m.id),
          confidence: 0.8,
          createdAt: now,
        });
      }
    }

    if (phase === DreamPhase.REM) {
      // REM dreaming: creative connections across different scopes/types
      const byScope = new Map<string, any[]>();
      for (const m of memories) {
        const s = m.scope ?? 'unknown';
        if (!byScope.has(s)) byScope.set(s, []);
        byScope.get(s)!.push(m);
      }
      const scopes = [...byScope.keys()];
      for (let i = 0; i < scopes.length; i++) {
        for (let j = i + 1; j < scopes.length; j++) {
          const groupA = byScope.get(scopes[i])!;
          const groupB = byScope.get(scopes[j])!;
          if (groupA.length > 0 && groupB.length > 0) {
            insights.push({
              type: 'creative',
              content: `Cross-scope connection: ${scopes[i]} ↔ ${scopes[j]} (${groupA.length} + ${groupB.length} memories)`,
              sourceMemoryIds: [
                ...groupA.slice(0, 3).map((m: any) => m.id),
                ...groupB.slice(0, 3).map((m: any) => m.id),
              ],
              confidence: 0.65,
              createdAt: now,
            });
          }
        }
      }
    }

    return insights;
  }

  private getNextPhase(current: DreamPhase): DreamPhase | null {
    switch (current) {
      case DreamPhase.LIGHT:
        return DreamPhase.DEEP;
      case DreamPhase.DEEP:
        return DreamPhase.REM;
      case DreamPhase.REM:
        return null; // Cycle complete
    }
  }

  /** Cancel a running dream */
  async cancelDream(userId: string, sessionId: string): Promise<DreamingSession> {
    const session = await this.getSession(userId, sessionId);
    if (session.status !== DreamStatus.RUNNING) {
      return session;
    }
    session.status = DreamStatus.FAILED;
    session.completedAt = new Date();
    return this.dreamRepo.save(session);
  }

  /** Get dream statistics for a user */
  async getStats(userId: string, agentId?: string) {
    const qb = this.dreamRepo
      .createQueryBuilder('ds')
      .select('ds.phase', 'phase')
      .addSelect('ds.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(ds.memoriesProcessed)', 'totalMemories')
      .addSelect('SUM(ds.insightsGenerated)', 'totalInsights')
      .where('ds.userId = :userId', { userId })
      .groupBy('ds.phase')
      .addGroupBy('ds.status');

    if (agentId) {
      qb.andWhere('ds.agentId = :agentId', { agentId });
    }

    return qb.getRawMany();
  }
}
