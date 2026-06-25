/**
 * Agent Negotiation Service
 * 
 * Phase 4: Agent 间协商引擎 - 支持 Agent 间自动协商分佣比例
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Skill } from '../../entities/skill.entity';

export enum NegotiationStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  COUNTER_OFFERED = 'counter_offered',
  EXPIRED = 'expired',
}

export enum NegotiationType {
  COMMISSION_SPLIT = 'commission_split',
  TASK_DELEGATION = 'task_delegation',
  RESOURCE_SHARING = 'resource_sharing',
}

export interface AgentIdentity {
  id: string;
  name: string;
  type: 'personal' | 'merchant' | 'platform' | 'service';
  reputation?: number;
  capabilities?: string[];
}

export interface NegotiationTerms {
  type: NegotiationType;
  proposedSplit?: {
    initiator: number;
    responder: number;
    platform: number;
  };
  taskDetails?: {
    description: string;
    deadline?: Date;
    budget?: number;
  };
  resourceDetails?: {
    skillId: string;
    accessLevel: 'read' | 'execute' | 'full';
    duration?: number;
  };
  expiresAt: Date;
}

export interface NegotiationSession {
  id: string;
  initiator: AgentIdentity;
  responder: AgentIdentity;
  terms: NegotiationTerms;
  status: NegotiationStatus;
  history: NegotiationMessage[];
  createdAt: Date;
  updatedAt: Date;
}

export interface NegotiationMessage {
  sender: 'initiator' | 'responder';
  action: 'propose' | 'accept' | 'reject' | 'counter';
  terms?: NegotiationTerms;
  message?: string;
  timestamp: Date;
}

export interface NegotiationResult {
  sessionId: string;
  status: NegotiationStatus;
  finalTerms?: NegotiationTerms;
  message: string;
}

@Injectable()
export class AgentNegotiationService {
  private readonly logger = new Logger(AgentNegotiationService.name);
  
  // 内存存储协商会话（生产环境应使用数据库）
  private sessions: Map<string, NegotiationSession> = new Map();

  constructor(
    @InjectRepository(Skill)
    private skillRepository: Repository<Skill>,
  ) {}

  /**
   * 发起协商
   */
  async initiateNegotiation(
    initiator: AgentIdentity,
    responder: AgentIdentity,
    terms: NegotiationTerms,
  ): Promise<NegotiationSession> {
    const sessionId = this.generateSessionId();

    const session: NegotiationSession = {
      id: sessionId,
      initiator,
      responder,
      terms,
      status: NegotiationStatus.PENDING,
      history: [
        {
          sender: 'initiator',
          action: 'propose',
          terms,
          timestamp: new Date(),
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.sessions.set(sessionId, session);
    this.logger.log(`Negotiation initiated: ${sessionId} between ${initiator.name} and ${responder.name}`);

    return session;
  }

  /**
   * 响应协商
   */
  async respondToNegotiation(
    sessionId: string,
    responderId: string,
    action: 'accept' | 'reject' | 'counter',
    counterTerms?: NegotiationTerms,
    message?: string,
  ): Promise<NegotiationResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return {
        sessionId,
        status: NegotiationStatus.REJECTED,
        message: 'Negotiation session not found',
      };
    }

    if (session.responder.id !== responderId) {
      return {
        sessionId,
        status: NegotiationStatus.REJECTED,
        message: 'Unauthorized responder',
      };
    }

    if (session.status !== NegotiationStatus.PENDING && 
        session.status !== NegotiationStatus.COUNTER_OFFERED) {
      return {
        sessionId,
        status: session.status,
        message: 'Negotiation is no longer active',
      };
    }

    // 检查是否过期
    if (new Date() > session.terms.expiresAt) {
      session.status = NegotiationStatus.EXPIRED;
      session.updatedAt = new Date();
      return {
        sessionId,
        status: NegotiationStatus.EXPIRED,
        message: 'Negotiation has expired',
      };
    }

    // 记录响应
    session.history.push({
      sender: 'responder',
      action,
      terms: counterTerms,
      message,
      timestamp: new Date(),
    });

    switch (action) {
      case 'accept':
        session.status = NegotiationStatus.ACCEPTED;
        session.updatedAt = new Date();
        this.logger.log(`Negotiation ${sessionId} accepted`);
        return {
          sessionId,
          status: NegotiationStatus.ACCEPTED,
          finalTerms: session.terms,
          message: 'Negotiation accepted',
        };

      case 'reject':
        session.status = NegotiationStatus.REJECTED;
        session.updatedAt = new Date();
        this.logger.log(`Negotiation ${sessionId} rejected`);
        return {
          sessionId,
          status: NegotiationStatus.REJECTED,
          message: message || 'Negotiation rejected',
        };

      case 'counter':
        if (!counterTerms) {
          return {
            sessionId,
            status: NegotiationStatus.PENDING,
            message: 'Counter offer requires terms',
          };
        }
        session.status = NegotiationStatus.COUNTER_OFFERED;
        session.terms = counterTerms;
        session.updatedAt = new Date();
        // 交换发起者和响应者角色
        [session.initiator, session.responder] = [session.responder, session.initiator];
        this.logger.log(`Negotiation ${sessionId} counter-offered`);
        return {
          sessionId,
          status: NegotiationStatus.COUNTER_OFFERED,
          finalTerms: counterTerms,
          message: 'Counter offer submitted',
        };

      default:
        return {
          sessionId,
          status: session.status,
          message: 'Invalid action',
        };
    }
  }

  /**
   * 获取协商会话
   */
  getSession(sessionId: string): NegotiationSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * 获取 Agent 的所有协商
   */
  getAgentNegotiations(agentId: string): NegotiationSession[] {
    const sessions: NegotiationSession[] = [];
    this.sessions.forEach(session => {
      if (session.initiator.id === agentId || session.responder.id === agentId) {
        sessions.push(session);
      }
    });
    return sessions;
  }

  /**
   * 自动协商分佣比例
   */
  async autoNegotiateCommission(
    initiator: AgentIdentity,
    responder: AgentIdentity,
    skillId: string,
    baseCommission: number,
  ): Promise<NegotiationResult> {
    const skill = await this.skillRepository.findOne({ where: { id: skillId } });
    if (!skill) {
      return {
        sessionId: '',
        status: NegotiationStatus.REJECTED,
        message: 'Skill not found',
      };
    }

    // 基于 Agent 声誉和能力计算建议分成
    const initiatorScore = this.calculateAgentScore(initiator);
    const responderScore = this.calculateAgentScore(responder);
    const totalScore = initiatorScore + responderScore;

    const proposedSplit = {
      initiator: Math.round((initiatorScore / totalScore) * baseCommission * 100) / 100,
      responder: Math.round((responderScore / totalScore) * baseCommission * 100) / 100,
      platform: 0.5, // 平台固定 0.5%
    };

    // 确保总和等于 baseCommission
    proposedSplit.initiator = baseCommission - proposedSplit.responder - proposedSplit.platform;

    const terms: NegotiationTerms = {
      type: NegotiationType.COMMISSION_SPLIT,
      proposedSplit,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24小时后过期
    };

    const session = await this.initiateNegotiation(initiator, responder, terms);

    // 如果响应者是自动 Agent，自动接受合理的提议
    if (this.isAutoAcceptable(responder, proposedSplit)) {
      return this.respondToNegotiation(session.id, responder.id, 'accept');
    }

    return {
      sessionId: session.id,
      status: NegotiationStatus.PENDING,
      finalTerms: terms,
      message: 'Negotiation initiated, awaiting response',
    };
  }

  /**
   * 计算 Agent 评分
   */
  private calculateAgentScore(agent: AgentIdentity): number {
    let score = 50; // 基础分

    // 声誉加成
    if (agent.reputation) {
      score += agent.reputation * 10;
    }

    // 能力加成
    if (agent.capabilities?.length) {
      score += agent.capabilities.length * 5;
    }

    // 类型加成
    switch (agent.type) {
      case 'platform':
        score += 20;
        break;
      case 'merchant':
        score += 15;
        break;
      case 'service':
        score += 10;
        break;
    }

    return Math.min(score, 100);
  }

  /**
   * 判断是否自动接受
   */
  private isAutoAcceptable(
    agent: AgentIdentity,
    split: { initiator: number; responder: number; platform: number },
  ): boolean {
    // 如果响应者获得的分成 >= 30%，自动接受
    const totalCommission = split.initiator + split.responder + split.platform;
    const responderShare = split.responder / totalCommission;
    return responderShare >= 0.3;
  }

  /**
   * 生成会话 ID
   */
  private generateSessionId(): string {
    return `neg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 清理过期会话
   */
  cleanupExpiredSessions(): number {
    const now = new Date();
    let cleaned = 0;

    this.sessions.forEach((session, id) => {
      if (session.terms.expiresAt < now && session.status === NegotiationStatus.PENDING) {
        session.status = NegotiationStatus.EXPIRED;
        session.updatedAt = now;
        cleaned++;
      }
    });

    this.logger.log(`Cleaned up ${cleaned} expired negotiation sessions`);
    return cleaned;
  }
}
