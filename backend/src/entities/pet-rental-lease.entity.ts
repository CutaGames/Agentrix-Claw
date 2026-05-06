import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type PetRentalStatus = 'active' | 'returned' | 'overdue' | 'cancelled';

/**
 * PetRentalLease — Phase 3 W1 rental lease.
 *
 * One row per executed rental. The renter has time-bound permission to use
 * the PetSkin (via PetSkin.activate) until `endsAt`. After `endsAt`, the
 * RentalScheduler reclaims the lease and notifies both parties.
 */
@Entity('pet_rental_leases')
@Index('idx_prl_listing', ['listingId'])
@Index('idx_prl_renter_status', ['renterUserId', 'status'])
@Index('idx_prl_ends_at_status', ['endsAt', 'status'])
export class PetRentalLease {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  listingId: string;

  @Column({ type: 'uuid' })
  petSkinId: string;

  @Column({ type: 'uuid' })
  renterUserId: string;

  @Column({ type: 'uuid' })
  ownerUserId: string;

  @Column({ type: 'integer' })
  durationDays: number;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  totalPaidUsd: string;

  @Column({ type: 'timestamptz' })
  startsAt: Date;

  @Column({ type: 'timestamptz' })
  endsAt: Date;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status: PetRentalStatus;

  @Column({ type: 'timestamptz', nullable: true })
  returnedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
