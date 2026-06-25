import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { AgentMemory } from '../../../../entities/agent-memory.entity';
import { MemoryType } from '../../../../entities/agent-memory.entity';
import {
  IMemoryService,
  MemoryEntry,
  MemorySearchOptions,
} from '../interfaces/memory.interface';

@Injectable()
export class MemoryService implements IMemoryService {
  private readonly logger = new Logger(MemoryService.name);

  constructor(
    @InjectRepository(AgentMemory)
    private memoryRepository: Repository<AgentMemory>,
  ) {}

  async saveMemory(
    sessionId: string,
    type: MemoryType,
    key: string,
    value: any,
    metadata?: MemoryEntry['metadata'],
  ): Promise<MemoryEntry> {
    // 检查是否已存在
    const existing = await this.memoryRepository.findOne({
      where: { sessionId, key },
    });

    if (existing) {
      // 更新现有记忆
      existing.value = value;
      existing.type = type;
      if (metadata) {
        existing.metadata = { ...existing.metadata, ...metadata };
      }
      existing.updatedAt = new Date();
      const updated = await this.memoryRepository.save(existing);
      return this.toMemoryEntry(updated);
    } else {
      // 创建新记忆
      const memory = this.memoryRepository.create({
        sessionId,
        type,
        key,
        value,
        metadata,
      });
      const saved = await this.memoryRepository.save(memory);
      return this.toMemoryEntry(saved);
    }
  }

  async getMemory(sessionId: string, key: string): Promise<MemoryEntry | null> {
    const memory = await this.memoryRepository.findOne({
      where: { sessionId, key },
    });

    if (!memory) {
      return null;
    }

    // 检查是否过期
    if (memory.metadata?.expiresAt && new Date(memory.metadata.expiresAt) < new Date()) {
      await this.deleteMemory(sessionId, key);
      return null;
    }

    return this.toMemoryEntry(memory);
  }

  async getMemoriesByType(sessionId: string, type: MemoryType): Promise<MemoryEntry[]> {
    const memories = await this.memoryRepository.find({
      where: { sessionId, type },
      order: { createdAt: 'DESC' },
    });

    // 过滤过期记忆
    const validMemories = memories.filter((m) => {
      if (m.metadata?.expiresAt && new Date(m.metadata.expiresAt) < new Date()) {
        this.deleteMemory(sessionId, m.key).catch((err) => {
          this.logger.error(`Failed to delete expired memory: ${err.message}`);
        });
        return false;
      }
      return true;
    });

    return validMemories.map((m) => this.toMemoryEntry(m));
  }

  async searchMemory(
    sessionId: string,
    query: string,
    options?: MemorySearchOptions,
  ): Promise<MemoryEntry[]> {
    const where: any = { sessionId };

    if (options?.type) {
      where.type = options.type;
    }

    if (options?.key) {
      where.key = Like(`%${options.key}%`);
    }

    if (options?.since) {
      where.createdAt = { $gte: options.since } as any;
    }

    const memories = await this.memoryRepository.find({
      where,
      order: { createdAt: 'DESC' },
      take: options?.limit || 10,
    });

    // 过滤过期记忆和标签匹配
    const validMemories = memories
      .filter((m) => {
        // 检查过期
        if (m.metadata?.expiresAt && new Date(m.metadata.expiresAt) < new Date()) {
          return false;
        }

        // 检查标签
        if (options?.tags && options.tags.length > 0) {
          if (!m.metadata?.tags || m.metadata.tags.length === 0) {
            return false;
          }
          const hasTag = options.tags.some((tag) => m.metadata?.tags?.includes(tag));
          if (!hasTag) {
            return false;
          }
        }

        return true;
      })
      .filter((m) => {
        // 简单的关键词搜索（后续可以改进为语义搜索）
        const searchText = JSON.stringify(m.value).toLowerCase();
        const queryLower = query.toLowerCase();
        return searchText.includes(queryLower) || m.key.toLowerCase().includes(queryLower);
      });

    return validMemories.map((m) => this.toMemoryEntry(m));
  }

  async updateMemory(
    sessionId: string,
    key: string,
    value: any,
    metadata?: Partial<MemoryEntry['metadata']>,
  ): Promise<MemoryEntry> {
    const memory = await this.memoryRepository.findOne({
      where: { sessionId, key },
    });

    if (!memory) {
      throw new Error(`Memory not found: ${sessionId}/${key}`);
    }

    memory.value = value;
    if (metadata) {
      memory.metadata = { ...memory.metadata, ...metadata };
    }
    memory.updatedAt = new Date();

    const updated = await this.memoryRepository.save(memory);
    return this.toMemoryEntry(updated);
  }

  async deleteMemory(sessionId: string, key: string): Promise<void> {
    await this.memoryRepository.delete({ sessionId, key });
  }

  async clearSessionMemory(sessionId: string): Promise<void> {
    await this.memoryRepository.delete({ sessionId });
  }

  async getRecentMemories(sessionId: string, limit: number = 10): Promise<MemoryEntry[]> {
    const memories = await this.memoryRepository.find({
      where: { sessionId },
      order: { createdAt: 'DESC' },
      take: limit,
    });

    // 过滤过期记忆
    const validMemories = memories.filter((m) => {
      if (m.metadata?.expiresAt && new Date(m.metadata.expiresAt) < new Date()) {
        this.deleteMemory(sessionId, m.key).catch((err) => {
          this.logger.error(`Failed to delete expired memory: ${err.message}`);
        });
        return false;
      }
      return true;
    });

    return validMemories.map((m) => this.toMemoryEntry(m));
  }

  private toMemoryEntry(memory: AgentMemory): MemoryEntry {
    return {
      id: memory.id,
      sessionId: memory.sessionId,
      type: memory.type,
      key: memory.key,
      value: memory.value,
      metadata: memory.metadata,
      createdAt: memory.createdAt,
      updatedAt: memory.updatedAt,
    };
  }
}

