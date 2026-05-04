import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ApprovalRequest } from '../../entities/approval-request.entity';
import {
  desktopSyncEventBus,
  DESKTOP_SYNC_EVENT,
} from '../desktop-sync/desktop-sync.events';

export type Surface = 'web' | 'desktop' | 'mobile' | 'watch' | 'glass';
export type ApprovalMethod = 'tap' | 'biometric' | 'voice';

export interface CreateApprovalInput {
  userId: string;
  action: {
    kind: 'write' | 'pay' | 'transfer' | 'deploy' | 'delete';
    resource: string;
    amountCents?: number;
    chain?: string;
    payload?: Record<string, unknown>;
  };
  riskLevel: 0 | 1 | 2 | 3;
  initiatorSurface: Surface;
}

const TIMEOUT_MS: Record<number, number> = {
  0: 0,
  1: 2 * 60 * 1000, // L1: 2 min
  2: 5 * 60 * 1000, // L2: 5 min
  3: 15 * 60 * 1000, // L3: 15 min
};

/**
 * 顿领 §5.2 审批路由：
 *   L0 读：无需审批
 *   L1 低写：起点端确认即可（任意 trust）
 *   L2 单笔支付：必须 Mobile + biometric
 *   L3 大额/跨链：Mobile + ≥ 1 其他端协签
 */
@Injectable()
export class ApprovalService {
  private readonly logger = new Logger(ApprovalService.name);

  constructor(
    @InjectRepository(ApprovalRequest)
    private readonly repo: Repository<ApprovalRequest>,
  ) {}

  async create(input: CreateApprovalInput): Promise<ApprovalRequest> {
    const now = Date.now();
    const required = this.requiredSurfacesFor(input.riskLevel);
    const req = this.repo.create({
      userId: input.userId,
      actionKind: input.action.kind,
      resource: input.action.resource,
      amountCents: input.action.amountCents,
      chain: input.action.chain,
      payload: input.action.payload || {},
      riskLevel: input.riskLevel,
      initiatorSurface: input.initiatorSurface,
      requiredSurfaces: required,
      status: input.riskLevel === 0 ? 'approved' : 'pending',
      expiresAt: String(now + (TIMEOUT_MS[input.riskLevel] || 0)),
      approvals: [],
    });
    const saved = await this.repo.save(req);
    this.broadcast(saved, 'approval:created');
    return saved;
  }

  async approve(
    requestId: string,
    by: { userId: string; surface: Surface; deviceId: string; method: ApprovalMethod; trustLevel: 0 | 1 | 2 | 3 },
  ): Promise<ApprovalRequest> {
    const req = await this.requireOwned(requestId, by.userId);
    this.assertNotExpired(req);
    this.assertSurfaceAllowed(req, by);

    req.approvals = [
      ...req.approvals,
      { surface: by.surface, deviceId: by.deviceId, at: Date.now(), method: by.method },
    ];

    if (this.allRequiredApproved(req)) {
      req.status = 'approved';
    }

    const saved = await this.repo.save(req);
    this.broadcast(saved, saved.status === 'approved' ? 'approval:approved' : 'approval:partial');
    return saved;
  }

  async deny(requestId: string, userId: string, surface: Surface, deviceId: string): Promise<ApprovalRequest> {
    const req = await this.requireOwned(requestId, userId);
    if (req.status !== 'pending') return req;
    req.status = 'denied';
    req.approvals = [...req.approvals, { surface, deviceId, at: Date.now(), method: 'tap' }];
    const saved = await this.repo.save(req);
    this.broadcast(saved, 'approval:denied');
    return saved;
  }

  async get(requestId: string, userId: string): Promise<ApprovalRequest> {
    const req = await this.requireOwned(requestId, userId);
    this.maybeExpire(req);
    return req;
  }

  async listPending(userId: string): Promise<ApprovalRequest[]> {
    const list = await this.repo.find({
      where: { userId, status: In(['pending']) },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    for (const r of list) this.maybeExpire(r);
    return list.filter((r) => r.status === 'pending');
  }

  // -------------------- helpers --------------------

  private requiredSurfacesFor(level: 0 | 1 | 2 | 3): Surface[] {
    if (level <= 1) return [];
    if (level === 2) return ['mobile'];
    return ['mobile', 'desktop']; // L3 默认 mobile + 1 其他端，可被 desktop 替换为 web
  }

  private allRequiredApproved(req: ApprovalRequest): boolean {
    const approvedSurfaces = new Set(req.approvals.map((a) => a.surface));
    if (req.riskLevel === 1) return req.approvals.length >= 1;
    if (req.riskLevel === 2) {
      return req.approvals.some(
        (a) => a.surface === 'mobile' && a.method === 'biometric',
      );
    }
    if (req.riskLevel === 3) {
      const mobileBio = req.approvals.some(
        (a) => a.surface === 'mobile' && a.method === 'biometric',
      );
      const coSigner = [...approvedSurfaces].some((s) => s !== 'mobile');
      return mobileBio && coSigner;
    }
    return false;
  }

  private assertSurfaceAllowed(
    req: ApprovalRequest,
    by: { surface: Surface; trustLevel: 0 | 1 | 2 | 3; method: ApprovalMethod },
  ): void {
    if (req.riskLevel >= 2) {
      if (by.surface === 'mobile') {
        if (by.trustLevel !== 3 || by.method !== 'biometric') {
          throw new ForbiddenException(
            'L2/L3 approval from mobile requires Trust=3 + biometric',
          );
        }
      } else {
        // 其他端只能作为 L3 协签
        if (req.riskLevel !== 3) {
          throw new ForbiddenException(
            'L2 approval must be issued from mobile (biometric)',
          );
        }
        if (by.trustLevel < 1) {
          throw new ForbiddenException('Co-signer requires Trust>=1');
        }
      }
    }
    if (req.riskLevel === 1 && by.trustLevel < 1) {
      throw new ForbiddenException('L1 approval requires Trust>=1');
    }
  }

  private assertNotExpired(req: ApprovalRequest): void {
    this.maybeExpire(req);
    if (req.status !== 'pending') {
      throw new BadRequestException(`Approval not pending (status=${req.status})`);
    }
  }

  private maybeExpire(req: ApprovalRequest): void {
    if (req.status !== 'pending') return;
    if (Date.now() >= Number(req.expiresAt || 0)) {
      req.status = 'timeout';
      this.repo.save(req).catch((err) => this.logger.warn(`expire save failed: ${err.message}`));
      this.broadcast(req, 'approval:timeout');
    }
  }

  private async requireOwned(requestId: string, userId: string): Promise<ApprovalRequest> {
    const req = await this.repo.findOne({ where: { id: requestId } });
    if (!req) throw new NotFoundException('approval request not found');
    if (req.userId !== userId) throw new ForbiddenException('not your approval');
    return req;
  }

  private broadcast(req: ApprovalRequest, event: string) {
    desktopSyncEventBus.emit(DESKTOP_SYNC_EVENT, {
      userId: req.userId,
      event: `presence:${event}`,
      payload: this.toDto(req),
    });
  }

  toDto(req: ApprovalRequest) {
    return {
      request_id: req.id,
      user_id: req.userId,
      action: {
        kind: req.actionKind,
        resource: req.resource,
        amount_cents: req.amountCents,
        chain: req.chain,
        payload: req.payload,
      },
      risk_level: req.riskLevel,
      initiator_surface: req.initiatorSurface,
      required_surfaces: req.requiredSurfaces,
      status: req.status,
      created_at: req.createdAt ? req.createdAt.getTime() : Date.now(),
      expires_at: Number(req.expiresAt || 0),
      approvals: req.approvals,
    };
  }
}
