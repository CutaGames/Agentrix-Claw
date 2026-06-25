/**
 * ACP Bridge Service — P4 Agent Client Protocol Bridge
 *
 * Implements a Gateway-backed ACP bridge (matching OpenClaw's own level).
 * NOT a full ACP-native editor runtime — per OpenClaw docs:
 * "Gateway-backed ACP bridge, not a full ACP-native editor runtime"
 *
 * Responsibilities:
 * - Session lifecycle: create / load / status / steer / kill
 * - Reply dispatch: route between agent sessions
 * - Skill execution via ACP protocol format
 * - Map Agentrix marketplace/wallet/task to ACP surface
 */
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentSession, SessionStatus } from '../../entities/agent-session.entity';
import { Skill } from '../../entities/skill.entity';
import { SkillExecutorService } from '../skill/skill-executor.service';

// ============================================================
// ACP Types (aligned with @agentclientprotocol/sdk 0.15.x)
// ============================================================

export enum AcpSessionStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  ERROR = 'error',
  KILLED = 'killed',
}

export interface AcpSession {
  sessionId: string;
  agentId?: string;
  userId: string;
  status: AcpSessionStatus;
  createdAt: string;
  lastActivityAt: string;
  metadata?: Record<string, any>;
}

export interface AcpAction {
  name: string;
  description: string;
  operationId: string;
  url: string;
  parameters: Record<string, any>;
  pricing?: {
    model: string;  // 'per_call' | 'subscription' | 'free'
    priceUsd?: number;
  };
}

export interface AcpSteerCommand {
  type: 'pause' | 'resume' | 'cancel' | 'redirect';
  targetSessionId?: string;
  reason?: string;
}

export interface AcpReplyDispatch {
  fromSessionId: string;
  toSessionId: string;
  message: string;
  metadata?: Record<string, any>;
}

// ============================================================
// ACP Bridge Service
// ============================================================

@Injectable()
export class AcpBridgeService {
  private readonly logger = new Logger(AcpBridgeService.name);

  constructor(
    @InjectRepository(AgentSession)
    private readonly sessionRepo: Repository<AgentSession>,
    @InjectRepository(Skill)
    private readonly skillRepo: Repository<Skill>,
    private readonly skillExecutorService: SkillExecutorService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════
  // Session Lifecycle
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Create a new ACP session for an agent.
   */
  async createSession(userId: string, agentId?: string, metadata?: Record<string, any>): Promise<AcpSession> {
    const session = this.sessionRepo.create({
      userId,
      agentId,
      sessionId: `acp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: metadata?.title || 'ACP Session',
      status: SessionStatus.ACTIVE,
      metadata: {
        source: 'acp-bridge',
        acpVersion: '0.15',
        ...metadata,
      },
      lastMessageAt: new Date(),
    });

    const saved = await this.sessionRepo.save(session);
    return this.toAcpSession(saved);
  }

  /**
   * Load an existing ACP session.
   */
  async loadSession(sessionId: string, userId?: string): Promise<AcpSession> {
    const session = await this.sessionRepo.findOne({
      where: userId ? { sessionId, userId } : { sessionId },
    });

    if (!session) {
      throw new NotFoundException(`ACP session not found: ${sessionId}`);
    }

    return this.toAcpSession(session);
  }

  /**
   * Get session status.
   */
  async getSessionStatus(sessionId: string, userId?: string): Promise<{ status: AcpSessionStatus; lastActivityAt: string }> {
    const session = await this.loadSession(sessionId, userId);
    return {
      status: session.status,
      lastActivityAt: session.lastActivityAt,
    };
  }

  /**
   * Steer a session (pause, resume, cancel, redirect).
   */
  async steerSession(sessionId: string, command: AcpSteerCommand, userId?: string): Promise<AcpSession> {
    const dbSession = await this.sessionRepo.findOne({
      where: userId ? { sessionId, userId } : { sessionId },
    });
    if (!dbSession) throw new NotFoundException(`ACP session not found: ${sessionId}`);

    switch (command.type) {
      case 'pause':
        dbSession.status = SessionStatus.ARCHIVED;
        break;
      case 'resume':
        dbSession.status = SessionStatus.ACTIVE;
        break;
      case 'cancel':
        dbSession.status = SessionStatus.EXPIRED;
        break;
      case 'redirect':
        // Redirect session to another session (future: cross-agent handoff)
        if (command.targetSessionId) {
          dbSession.metadata = {
            ...dbSession.metadata,
            redirectedTo: command.targetSessionId,
            redirectReason: command.reason,
          };
          dbSession.status = SessionStatus.EXPIRED;
        }
        break;
    }

    dbSession.lastMessageAt = new Date();
    const saved = await this.sessionRepo.save(dbSession);
    return this.toAcpSession(saved);
  }

  /**
   * Kill a session.
   */
  async killSession(sessionId: string, reason?: string, userId?: string): Promise<void> {
    const dbSession = await this.sessionRepo.findOne({
      where: userId ? { sessionId, userId } : { sessionId },
    });
    if (!dbSession) return;

    dbSession.status = SessionStatus.EXPIRED;
    dbSession.metadata = {
      ...dbSession.metadata,
      killedAt: new Date().toISOString(),
      killReason: reason || 'Killed via ACP bridge',
    };

    await this.sessionRepo.save(dbSession);
    this.logger.log(`ACP session killed: ${sessionId}`);
  }

  /**
   * List active ACP sessions for a user.
   */
  async listSessions(userId: string): Promise<AcpSession[]> {
    const sessions = await this.sessionRepo.find({
      where: { userId },
      order: { lastMessageAt: 'DESC' },
      take: 50,
    });

    return sessions.map(s => this.toAcpSession(s));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Reply Dispatch
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Dispatch a reply from one session to another.
   * This enables cross-session communication between agents.
   */
  async replyDispatch(dispatch: AcpReplyDispatch, userId?: string): Promise<{
    delivered: boolean;
    targetStatus: AcpSessionStatus;
  }> {
    const target = await this.sessionRepo.findOne({
      where: userId ? { sessionId: dispatch.toSessionId, userId } : { sessionId: dispatch.toSessionId },
    });

    if (!target || target.status === SessionStatus.EXPIRED) {
      return { delivered: false, targetStatus: AcpSessionStatus.KILLED };
    }

    // Store the dispatched message in target session metadata
    const pendingMessages = (target.metadata as any)?.pendingDispatches || [];
    pendingMessages.push({
      fromSessionId: dispatch.fromSessionId,
      message: dispatch.message,
      metadata: dispatch.metadata,
      timestamp: new Date().toISOString(),
    });

    target.metadata = {
      ...target.metadata,
      pendingDispatches: pendingMessages,
    };
    target.lastMessageAt = new Date();

    await this.sessionRepo.save(target);

    return {
      delivered: true,
      targetStatus: this.mapSessionStatus(target.status),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ACP Actions (Skill Surface)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * List available ACP actions (skills) with pricing info.
   */
  async listActions(category?: string): Promise<AcpAction[]> {
    const qb = this.skillRepo.createQueryBuilder('skill')
      .where('skill.status = :status', { status: 'active' });

    if (category) {
      qb.andWhere('skill.category = :category', { category });
    }

    const skills = await qb.limit(100).getMany();
    const baseUrl = process.env.PUBLIC_URL || 'https://api.agentrix.top';

    return skills.map(skill => ({
      name: skill.name,
      description: skill.description || '',
      operationId: skill.id,
      url: `${baseUrl}/api/acp/sessions/invoke`,
      parameters: skill.inputSchema || {},
      pricing: {
        model: (skill as any).pricingType || 'free',
        priceUsd: (skill as any).price,
      },
    }));
  }

  /**
   * Invoke an ACP action within a session context.
   */
  async invokeAction(
    sessionId: string,
    skillId: string,
    params: Record<string, any>,
    userId: string,
  ): Promise<{
    success: boolean;
    sessionId: string;
    skillId: string;
    result: any;
    skillName?: string;
    error?: string;
    executionTime?: number;
    billingInfo?: {
      amount: number;
      currency: string;
      paymentId: string;
    };
  }> {
    // Validate session
    const session = await this.sessionRepo.findOne({ where: { sessionId, userId } });
    if (!session) throw new NotFoundException('ACP session not found');
    if (session.status !== SessionStatus.ACTIVE) {
      throw new BadRequestException('ACP session is not active');
    }

    // Validate skill
    const skill = await this.skillRepo.findOne({ where: { id: skillId, status: 'active' as any } });
    if (!skill) throw new NotFoundException('Skill not found');

    const executionResult = await this.skillExecutorService.execute(skill.id, params, {
      userId,
      sessionId: session.sessionId,
      platform: 'acp',
      metadata: {
        source: 'acp-bridge',
        agentId: session.agentId,
        acpSessionId: session.sessionId,
      },
    });

    session.lastMessageAt = new Date();
    session.metadata = {
      ...(session.metadata as Record<string, any> | null),
      lastAcpAction: {
        skillId: skill.id,
        skillName: skill.name,
        success: executionResult.success,
        executedAt: session.lastMessageAt.toISOString(),
        executionTime: executionResult.executionTime,
        error: executionResult.error,
      },
    };
    await this.sessionRepo.save(session);

    return {
      success: executionResult.success,
      sessionId,
      skillId: skill.id,
      skillName: executionResult.skillName || skill.name,
      result: executionResult.data,
      error: executionResult.error,
      executionTime: executionResult.executionTime,
      billingInfo: executionResult.billingInfo,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Internal
  // ═══════════════════════════════════════════════════════════════════════

  private toAcpSession(session: AgentSession): AcpSession {
    return {
      sessionId: session.sessionId,
      agentId: session.agentId,
      userId: session.userId,
      status: this.mapSessionStatus(session.status, session.metadata as Record<string, any> | null),
      createdAt: session.createdAt?.toISOString() || new Date().toISOString(),
      lastActivityAt: session.lastMessageAt?.toISOString() || new Date().toISOString(),
      metadata: session.metadata as Record<string, any>,
    };
  }

  private mapSessionStatus(status: SessionStatus, metadata?: Record<string, any> | null): AcpSessionStatus {
    switch (status) {
      case SessionStatus.ACTIVE: return AcpSessionStatus.ACTIVE;
      case SessionStatus.ARCHIVED: return AcpSessionStatus.PAUSED;
      case SessionStatus.EXPIRED:
        return metadata?.killedAt ? AcpSessionStatus.KILLED : AcpSessionStatus.COMPLETED;
      default: return AcpSessionStatus.ACTIVE;
    }
  }
}
