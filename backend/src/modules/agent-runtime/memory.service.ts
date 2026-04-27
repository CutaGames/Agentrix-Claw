import { BadRequestException, ConflictException, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentMemoryEdge, AgentMemoryNodeKind } from '../../entities/agent-memory-edge.entity';
import { User } from '../../entities/user.entity';

export interface UserMemory {
  userId: string;
  preferences: Record<string, any>;
  sessionSummaries: Array<{
    sessionId: string;
    summary: string;
    source?: string;
    timestamp: Date;
  }>;
  lastUpdated: Date;
}

export interface AddMemoryEdgeInput {
  userId: string;
  agentId?: string;
  sessionId?: string;
  sourceKind: AgentMemoryNodeKind;
  sourceId: string;
  targetKind: AgentMemoryNodeKind;
  targetId: string;
  relationship: string;
  weight?: number;
  metadata?: Record<string, any>;
}

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @Optional()
    @InjectRepository(AgentMemoryEdge)
    private memoryEdgeRepository?: Repository<AgentMemoryEdge>,
  ) {}

  /**
   * 获取用户记忆
   */
  async getUserMemory(userId: string): Promise<UserMemory> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('用户不存在');
    }

    // 从用户metadata中读取记忆
    const memory: UserMemory = {
      userId,
      preferences: user.metadata?.preferences || {},
      sessionSummaries: user.metadata?.sessionSummaries || [],
      lastUpdated: user.updatedAt,
    };

    return memory;
  }

  /**
   * 保存用户偏好
   */
  async saveUserPreference(
    userId: string,
    key: string,
    value: any,
  ): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('用户不存在');
    }

    const preferences = user.metadata?.preferences || {};
    preferences[key] = value;

    user.metadata = {
      ...user.metadata,
      preferences,
    };

    await this.userRepository.save(user);
    this.logger.log(`保存用户偏好: userId=${userId}, key=${key}`);
  }

  /**
   * 保存会话摘要
   */
  async saveSessionSummary(
    userId: string,
    sessionId: string,
    summary: string,
  ): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('用户不存在');
    }

    const sessionSummaries = user.metadata?.sessionSummaries || [];
    sessionSummaries.push({
      sessionId,
      summary,
      timestamp: new Date(),
    });

    // 只保留最近50条
    if (sessionSummaries.length > 50) {
      sessionSummaries.shift();
    }

    user.metadata = {
      ...user.metadata,
      sessionSummaries,
    };

    await this.userRepository.save(user);
    this.logger.log(`保存会话摘要: userId=${userId}, sessionId=${sessionId}`);
  }

  async saveSessionSummaryIfFresh(
    userId: string,
    sessionId: string,
    summary: string,
    expectedLastUpdated?: string | Date,
    source = 'agent-runtime',
  ): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error('用户不存在');
    }

    if (expectedLastUpdated) {
      const expected = new Date(expectedLastUpdated).getTime();
      const actual = new Date(user.updatedAt).getTime();
      if (Number.isFinite(expected) && actual > expected) {
        throw new ConflictException('Memory was updated after the caller snapshot; refusing stale overwrite');
      }
    }

    const sessionSummaries = (user.metadata?.sessionSummaries || []).filter((item: any) => item.sessionId !== sessionId);
    sessionSummaries.push({
      sessionId,
      summary,
      source,
      timestamp: new Date(),
    });
    while (sessionSummaries.length > 50) sessionSummaries.shift();

    user.metadata = {
      ...user.metadata,
      sessionSummaries,
    };

    await this.userRepository.save(user);
    this.logger.log(`保存会话摘要: userId=${userId}, sessionId=${sessionId}, source=${source}`);
  }

  async searchSessionSummaries(
    userId: string,
    query: string,
    options: { source?: string; limit?: number } = {},
  ): Promise<Array<{ sessionId: string; summary: string; timestamp?: Date; source?: string; score: number }>> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new Error('用户不存在');

    const tokens = this.tokenize(query);
    const summaries = user.metadata?.sessionSummaries || [];
    return summaries
      .filter((item: any) => !options.source || item.source === options.source)
      .map((item: any) => ({
        sessionId: item.sessionId,
        summary: item.summary,
        timestamp: item.timestamp,
        source: item.source,
        score: this.textScore(`${item.sessionId} ${item.summary}`, tokens),
      }))
      .filter((item: any) => item.score > 0 || tokens.length === 0)
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, Math.max(1, Math.min(options.limit || 10, 50)));
  }

  async addMemoryEdge(input: AddMemoryEdgeInput): Promise<AgentMemoryEdge> {
    if (!input.userId || !input.sourceId || !input.targetId || !input.relationship) {
      throw new BadRequestException('userId, sourceId, targetId, and relationship are required');
    }

    const edge = this.memoryEdgeRepository?.create({
      userId: input.userId,
      agentId: input.agentId,
      sessionId: input.sessionId,
      sourceKind: input.sourceKind,
      sourceId: input.sourceId,
      targetKind: input.targetKind,
      targetId: input.targetId,
      relationship: input.relationship,
      weight: input.weight ?? 1,
      metadata: input.metadata,
    }) || {
      id: `memory-edge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId: input.userId,
      agentId: input.agentId,
      sessionId: input.sessionId,
      sourceKind: input.sourceKind,
      sourceId: input.sourceId,
      targetKind: input.targetKind,
      targetId: input.targetId,
      relationship: input.relationship,
      weight: input.weight ?? 1,
      metadata: input.metadata,
      createdAt: new Date(),
    } as AgentMemoryEdge;

    if (this.memoryEdgeRepository) {
      return this.memoryEdgeRepository.save(edge);
    }

    return edge;
  }

  async findMemoryEdges(
    userId: string,
    query: { kind?: AgentMemoryNodeKind; id?: string; relationship?: string; limit?: number } = {},
  ): Promise<AgentMemoryEdge[]> {
    if (!this.memoryEdgeRepository) return [];
    const qb = this.memoryEdgeRepository.createQueryBuilder('edge')
      .where('edge.userId = :userId', { userId });
    if (query.kind && query.id) {
      qb.andWhere('((edge.sourceKind = :kind AND edge.sourceId = :id) OR (edge.targetKind = :kind AND edge.targetId = :id))', {
        kind: query.kind,
        id: query.id,
      });
    }
    if (query.relationship) {
      qb.andWhere('edge.relationship = :relationship', { relationship: query.relationship });
    }
    return qb.orderBy('edge.createdAt', 'DESC').take(Math.max(1, Math.min(query.limit || 50, 200))).getMany();
  }

  private tokenize(text: string): string[] {
    return (text || '').toLowerCase().match(/[a-z0-9_.$/-]+|[\u4e00-\u9fa5]+/g) || [];
  }

  private textScore(text: string, tokens: string[]): number {
    if (tokens.length === 0) return 1;
    const haystack = text.toLowerCase();
    return tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0);
  }
}

