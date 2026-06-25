/**
 * SignRequestService — P-9 Companion Redesign Task 0.6.
 *
 * Centralised queue model behind Trust3_Signing_Sheet (mobile) +
 * Cross_Device_Token signing flow. Handles:
 *   - create() with optional idempotencyKey for double-tap safety
 *   - findById() for client polling / cached signature dedup
 *   - complete() for mobile to submit user's biometric-signed signature
 *   - cancel() for explicit user cancel or 60s timeout
 *   - sweepExpired() cron — every 5min flips pending+expired rows to expired
 *
 * Phase 1: signing itself happens on the mobile side via existing
 * `mpcWalletService.signMessage()`; the server stores the resulting
 * signature here for the originator (desktop / agentic flow / etc.) to
 * pull and continue. Server does NOT re-sign on its own.
 */
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SignRequest, SignRequestReason, SignRequestStatus } from './sign-request.entity';
import { emitDesktopSyncEvent } from '../desktop-sync/desktop-sync.events';

export interface CreateSignRequestInput {
  userId: string;
  reason: SignRequestReason;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string | null;
  originDeviceId?: string | null;
  /** Override default 60s timeout. Range 30-300s. */
  timeoutSeconds?: number;
}

const DEFAULT_TIMEOUT_SECONDS = 60;
const MAX_TIMEOUT_SECONDS = 300;
const MIN_TIMEOUT_SECONDS = 30;
const IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class SignRequestService {
  private readonly logger = new Logger(SignRequestService.name);

  constructor(
    @InjectRepository(SignRequest)
    private readonly repo: Repository<SignRequest>,
  ) {}

  /**
   * Create a new sign request. If idempotencyKey matches an already-completed
   * row within IDEMPOTENCY_WINDOW_MS, returns the cached row (no new sheet
   * presented on mobile).
   */
  async create(input: CreateSignRequestInput): Promise<SignRequest> {
    if (input.idempotencyKey) {
      const cached = await this.findCompletedByIdempotency(input.userId, input.idempotencyKey);
      if (cached) {
        this.logger.debug(
          `Idempotent sign-request hit user=${input.userId} key=${input.idempotencyKey} → ${cached.id}`,
        );
        return cached;
      }
    }

    const seconds = Math.max(
      MIN_TIMEOUT_SECONDS,
      Math.min(input.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS, MAX_TIMEOUT_SECONDS),
    );

    const row = this.repo.create({
      userId: input.userId,
      reason: input.reason,
      metadata: input.metadata ?? {},
      idempotencyKey: input.idempotencyKey ?? null,
      originDeviceId: input.originDeviceId ?? null,
      status: 'pending',
      signature: null,
      expiresAt: new Date(Date.now() + seconds * 1000),
    });

    const saved = await this.repo.save(row);

    // Notify the user's mobile companion ball — emit a presence event so the
    // Trust3SigningSheet can present without polling. The mobile bridge
    // listens for trust3-signing-request and routes to companionEvents bus.
    try {
      emitDesktopSyncEvent(input.userId, 'presence:trust3.signing-request', {
        sign_request_id: saved.id,
        reason: saved.reason,
        metadata: saved.metadata,
        expires_at: saved.expiresAt.getTime(),
        origin_device_id: saved.originDeviceId,
        created_at: saved.createdAt.getTime(),
      });
    } catch (err) {
      this.logger.warn(
        `emit trust3.signing-request failed for ${saved.id}: ${(err as Error).message}`,
      );
    }

    return saved;
  }

  /** Plain lookup by id. */
  async findById(id: string, userId?: string): Promise<SignRequest> {
    const where: Partial<SignRequest> = { id };
    if (userId) (where as any).userId = userId;
    const row = await this.repo.findOne({ where });
    if (!row) throw new NotFoundException(`SignRequest ${id} not found`);
    return row;
  }

  /**
   * Find a completed sign-request matching idempotencyKey within 24h.
   * Used to short-circuit identical requests on the originator side.
   */
  async findCompletedByIdempotency(
    userId: string,
    idempotencyKey: string,
  ): Promise<SignRequest | null> {
    const since = new Date(Date.now() - IDEMPOTENCY_WINDOW_MS);
    const row = await this.repo
      .createQueryBuilder('sr')
      .where('sr.userId = :userId', { userId })
      .andWhere('sr.idempotencyKey = :key', { key: idempotencyKey })
      .andWhere('sr.status = :status', { status: 'completed' })
      .andWhere('sr.completedAt > :since', { since })
      .orderBy('sr.completedAt', 'DESC')
      .limit(1)
      .getOne();
    return row;
  }

  /**
   * Mobile submits user-signed signature. Verifies expiry and pending state.
   * On success, broadcasts trust3.signing-completed so the originator
   * (desktop / web / agentic flow) can proceed.
   */
  async complete(
    id: string,
    userId: string,
    signature: string,
  ): Promise<SignRequest> {
    const row = await this.findById(id, userId);

    if (row.status === 'completed') {
      // Idempotent re-complete — return cached row
      return row;
    }
    if (row.status === 'cancelled' || row.status === 'expired') {
      throw new BadRequestException(`SignRequest ${id} is ${row.status}; cannot complete`);
    }
    if (Date.now() > row.expiresAt.getTime()) {
      // Lazily mark expired
      row.status = 'expired';
      await this.repo.save(row);
      throw new BadRequestException(`SignRequest ${id} expired`);
    }

    row.status = 'completed';
    row.signature = signature;
    row.completedAt = new Date();
    const saved = await this.repo.save(row);

    try {
      emitDesktopSyncEvent(userId, 'presence:trust3.signing-completed', {
        sign_request_id: saved.id,
        signature: saved.signature,
        completed_at: saved.completedAt!.getTime(),
      });
    } catch (err) {
      this.logger.warn(
        `emit trust3.signing-completed failed for ${saved.id}: ${(err as Error).message}`,
      );
    }

    return saved;
  }

  /** Explicit cancel (user pressed Cancel or originator gave up). */
  async cancel(id: string, userId: string, reason?: string): Promise<SignRequest> {
    const row = await this.findById(id, userId);
    if (row.status === 'completed') {
      throw new BadRequestException(`SignRequest ${id} already completed`);
    }
    if (row.status !== 'pending') return row; // already-cancelled / expired idempotent
    row.status = 'cancelled';
    if (reason) {
      row.metadata = { ...row.metadata, cancel_reason: reason };
    }
    const saved = await this.repo.save(row);

    try {
      emitDesktopSyncEvent(userId, 'presence:trust3.signing-cancelled', {
        sign_request_id: saved.id,
        reason: reason ?? null,
      });
    } catch {
      /* noop */
    }

    return saved;
  }

  /**
   * Cron: sweep pending rows past expiresAt → 'expired'.
   * Runs every 5 minutes. Cheap query thanks to partial index.
   */
  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'sign-request-expired-sweep' })
  async sweepExpired(): Promise<void> {
    try {
      const result = await this.repo.update(
        { status: 'pending' as SignRequestStatus, expiresAt: LessThan(new Date()) },
        { status: 'expired' as SignRequestStatus },
      );
      if ((result.affected ?? 0) > 0) {
        this.logger.log(`Sweeped ${result.affected} expired sign-requests`);
      }
    } catch (err) {
      this.logger.warn(`sweepExpired failed: ${(err as Error).message}`);
    }
  }
}
