import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../entities/user.entity';

export interface UserMemory {
  userId: string;
  preferences: Record<string, any>;
  sessionSummaries: Array<{
    sessionId: string;
    summary: string;
    timestamp: Date;
  }>;
  lastUpdated: Date;
}

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
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
}

