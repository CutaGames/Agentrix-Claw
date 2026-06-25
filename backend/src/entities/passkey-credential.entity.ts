import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * PasskeyCredential — WebAuthn credential bound to a user.
 *
 * PRD: docs/PRD_PET_PHASED_TEST_PLAN.zh-CN.md §6.5 WB-T4.1 / WB-T4.2
 *
 * Stores the public credential bundle returned by the browser during
 * registration so that subsequent authentication assertions can be verified.
 * Cryptographic verification (COSE key parse + signature check) is performed
 * by `PasskeyService.verifyAuthentication` — the v1 implementation tracks
 * shape + ownership; full FIDO2 verification is a P1 follow-up wired through
 * @simplewebauthn/server.
 */
@Entity('passkey_credentials')
@Index(['userId'])
@Index(['credentialId'], { unique: true })
export class PasskeyCredential {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  /** Browser-supplied id (base64url). */
  @Column({ type: 'varchar', length: 512 })
  credentialId: string;

  /** Browser-supplied COSE public key (base64url). */
  @Column({ type: 'text' })
  publicKey: string;

  /** Anti-replay sign counter; increments on each authentication. */
  @Column({ type: 'bigint', default: 0 })
  signCount: string;

  /** Friendly device label set by user. */
  @Column({ type: 'varchar', length: 80, nullable: true })
  label: string | null;

  /** Transports advertised by the authenticator (usb / nfc / ble / internal). */
  @Column({ type: 'varchar', length: 120, nullable: true })
  transports: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
