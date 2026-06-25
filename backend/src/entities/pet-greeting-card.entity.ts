import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
} from 'typeorm';

/**
 * Pet Greeting Card — per docs §6.2.
 *
 * A user composes a greeting card (template + their pet + a message) and
 * sends it to a friend. The receiver can redeem the card for AXP and
 * optionally reply with their own.
 *
 * `senderPetId` references an agent_account; `template` references a
 * fixed key in code (SPRING_FESTIVAL, BIRTHDAY, ENCOURAGE, etc.).
 */
@Entity({ name: 'pet_greeting_cards' })
@Index(['senderId', 'createdAt'])
@Index(['receiverId', 'createdAt'])
@Index(['token'], { unique: true })
export class PetGreetingCard {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  senderId!: string;

  @Column('uuid')
  senderPetId!: string;

  /** Target user. NULL = sent via link only (receiver identified when opened). */
  @Column({ type: 'uuid', nullable: true })
  receiverId?: string | null;

  /** Optional receiver hint for unregistered recipients (name or phone mask). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  receiverHint?: string | null;

  /** Short public token for universal link. */
  @Column({ type: 'varchar', length: 32 })
  token!: string;

  /** Template key — resolves to UI assets client-side. */
  @Column({ type: 'varchar', length: 32 })
  template!: string;

  /** User-composed message (≤ 200 chars). */
  @Column({ type: 'varchar', length: 500, nullable: true })
  message?: string | null;

  /** AXP cost for premium templates (0 for free templates). */
  @Column({ type: 'int', default: 0 })
  axpCost!: number;

  /** AXP reward to the receiver when opened. */
  @Column({ type: 'int', default: 20 })
  axpReward!: number;

  @Column({ type: 'varchar', length: 16, default: 'sent' })
  status!: 'sent' | 'delivered' | 'opened' | 'redeemed' | 'expired';

  @Column({ type: 'timestamptz', nullable: true })
  openedAt?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  redeemedAt?: Date | null;

  /** Optional reply card id (if receiver replied with their own card). */
  @Column({ type: 'uuid', nullable: true })
  replyCardId?: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
