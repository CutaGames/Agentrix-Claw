/**
 * UCP Checkout Session Entity
 * 
 * Persistent storage for UCP checkout sessions.
 * Replaces in-memory Map in UCP Service for production use.
 */
import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum CheckoutSessionStatus {
  INCOMPLETE = 'incomplete',
  READY_FOR_COMPLETE = 'ready_for_complete',
  COMPLETE = 'complete',
  CANCELLED = 'cancelled',
  REQUIRES_ESCALATION = 'requires_escalation',
}

@Entity('ucp_checkout_sessions')
@Index(['status', 'createdAt'])
export class UCPCheckoutSessionEntity {
  @PrimaryColumn({ length: 64 })
  id: string;

  @Column({
    type: 'enum',
    enum: CheckoutSessionStatus,
    default: CheckoutSessionStatus.INCOMPLETE,
  })
  status: CheckoutSessionStatus;

  @Column({ length: 10, default: 'USD' })
  currency: string;

  /** Buyer information */
  @Column({ type: 'jsonb', nullable: true })
  buyer: Record<string, any>;

  /** Line items */
  @Column({ type: 'jsonb', default: '[]', name: 'line_items' })
  lineItems: any[];

  /** Totals (subtotal, tax, shipping, total) */
  @Column({ type: 'jsonb', default: '[]' })
  totals: any[];

  /** Payment configuration */
  @Column({ type: 'jsonb', nullable: true })
  payment: Record<string, any>;

  /** Fulfillment configuration */
  @Column({ type: 'jsonb', nullable: true })
  fulfillment: Record<string, any>;

  /** Messages/errors */
  @Column({ type: 'jsonb', nullable: true })
  messages: any[];

  /** HATEOAS links */
  @Column({ type: 'jsonb', nullable: true })
  links: any[];

  /** Continue URL for redirects */
  @Column({ nullable: true, name: 'continue_url' })
  continueUrl: string;

  /** Merchant order ID after completion */
  @Column({ nullable: true, name: 'merchant_order_id' })
  merchantOrderId: string;

  /** UCP version and capabilities snapshot */
  @Column({ type: 'jsonb', nullable: true })
  ucp: Record<string, any>;

  /** Metadata */
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
