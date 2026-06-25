/**
 * SignRequest entity (P-9 Companion Redesign Task 0.6).
 *
 * Backs the Trust3_Signing_Sheet on mobile and the Cross_Device_Token flow
 * for desktop-issued sensitive actions.
 *
 * Lifecycle:
 *   1. Originator (web/desktop/agentic-commerce/marketplace/etc.) calls
 *      POST /v1/wallet/sign-request → row inserted with status='pending',
 *      expiresAt=now+60s by default.
 *   2. Mobile Companion_Ball receives presence event or polls and presents
 *      Trust3SigningSheet to the user.
 *   3. User confirms biometric → mobile calls
 *      POST /v1/wallet/sign-request/:id/complete { signature } →
 *      status='completed', signature stored, broadcast to originator.
 *   4. Or user/timeout cancels → POST /:id/cancel or expiresAt cron sweep →
 *      status='cancelled' / 'expired'.
 *
 * Idempotency: an `idempotencyKey` allows the same logical action requested
 * twice within 24h to short-circuit and return the cached signature, so
 * Marketplace double-tap or duplicate Skill_Install_Card never produces
 * two separate transactions.
 */
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type SignRequestReason =
  | 'wallet-transfer'
  | 'marketplace-purchase'
  | 'skill-install'
  | 'remote-control'
  | 'approval'
  | 'agentic-commerce-overlimit';

export type SignRequestStatus = 'pending' | 'completed' | 'cancelled' | 'expired';

@Entity('sign_requests')
@Index(['userId', 'status'])
@Index(['idempotencyKey'])
export class SignRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @Column({
    type: 'enum',
    enum: [
      'wallet-transfer',
      'marketplace-purchase',
      'skill-install',
      'remote-control',
      'approval',
      'agentic-commerce-overlimit',
    ],
  })
  reason: SignRequestReason;

  /**
   * Free-form payload describing the action to be signed. Producers should
   * include enough info for the mobile Trust3SigningSheet to render summary
   * (amount / counterparty / risk text). Phase 1 shape:
   *   {
   *     petId?: string,
   *     summary: { from?: string, to?: string, amount?: string, gas?: string },
   *     risk: 'L0' | 'L1' | 'L2' | 'L3',
   *     riskExplanationZh: string,
   *     riskExplanationEn: string,
   *     // For remote-control:
   *     targetDeviceId?: string,
   *     command?: string,
   *     args?: Record<string, unknown>,
   *   }
   */
  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @Column({
    type: 'enum',
    enum: ['pending', 'completed', 'cancelled', 'expired'],
    default: 'pending',
  })
  status: SignRequestStatus;

  /** Signature returned by mpcWalletService.sign(); null until completed. */
  @Column({ type: 'text', nullable: true })
  signature: string | null;

  /**
   * Optional dedup key. If two sign-requests share the same key for the
   * same user within 24h and the older one is `completed`, the new
   * request short-circuits to return the cached signature instead of
   * presenting the sheet again. Producers SHOULD generate this from
   * action semantics (e.g. `marketplace:buy:assetId:userId`).
   */
  @Column({ type: 'text', nullable: true })
  idempotencyKey: string | null;

  /** Originating device id (desktop / web / mobile / agentic). */
  @Column({ type: 'text', nullable: true })
  originDeviceId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'timestamp' })
  expiresAt: Date;
}
