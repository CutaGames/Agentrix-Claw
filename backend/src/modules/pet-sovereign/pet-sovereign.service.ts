import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import {
  PetSovereignProfile,
  PetCustodyMode,
  PetMemoryStorage,
  PetSovereignStatus,
} from '../../entities/pet-sovereign-profile.entity';
import { LivingPet } from '../../entities/living-pet.entity';

/**
 * Phase 6 M6 — sovereign pet service.
 *
 * Gates:
 *   - intimacyLevel >= MIN_INTIMACY (default 7) to enable mpc/self custody
 *   - chain whitelist drawn from SUPPORTED_CHAINS
 *
 * MPC notes:
 *   This service ONLY records commitments / fingerprints / KMS key ids.
 *   The actual shard generation + signing protocol runs on the wallet
 *   service — out of scope for this module. We expose `enableMpc` to
 *   stash the metadata so the wallet service can later resolve it.
 *
 * Memory notes:
 *   `setMemoryUri` accepts ipfs:// or ar:// URIs and a sha-256 hash. The
 *   actual pinning workflow is performed off-platform; we store the
 *   pointer + hash so cross-device readers can verify integrity.
 */

export const MIN_SOVEREIGN_INTIMACY = 7;
export const SUPPORTED_CHAINS = ['ethereum', 'base', 'bsc', 'solana'] as const;
export type SovereignChain = (typeof SUPPORTED_CHAINS)[number];

export interface EnableMpcDto {
  mpcUserShareCommitment: string;   // hex / base64, ≤ 256 chars
  mpcDeviceFingerprint: string;     // ≤ 256
  mpcServerKmsKeyId: string;        // ≤ 256
  walletAddress?: string;
  supportedChains?: (SovereignChain | string)[];
}

export interface EnableSelfDto {
  walletAddress: string;
  supportedChains?: (SovereignChain | string)[];
}

export interface UpdateChainsDto {
  supportedChains: (SovereignChain | string)[];
}

export interface SetMemoryUriDto {
  memoryStorage: PetMemoryStorage;
  memoryUri: string | null;
  memoryHash?: string | null;
}

@Injectable()
export class PetSovereignService {
  constructor(
    @InjectRepository(PetSovereignProfile)
    private readonly repo: Repository<PetSovereignProfile>,
    @InjectRepository(LivingPet)
    private readonly petRepo: Repository<LivingPet>,
  ) {}

  async getOrInit(userId: string, livingPetId: string): Promise<PetSovereignProfile> {
    const pet = await this.requirePet(userId, livingPetId);
    let row = await this.repo.findOne({ where: { livingPetId } });
    if (row) {
      if (row.userId !== userId) throw new ForbiddenException('not your pet');
      return row;
    }
    row = this.repo.create({
      userId,
      livingPetId,
      custodyMode: 'platform',
      memoryStorage: 'platform',
      supportedChains: ['base'],
      status: 'active',
    });
    return this.repo.save(row);
  }

  async enableMpc(userId: string, livingPetId: string, dto: EnableMpcDto): Promise<PetSovereignProfile> {
    const pet = await this.requirePet(userId, livingPetId);
    this.gateIntimacy(pet);
    this.requireField(dto.mpcUserShareCommitment, 'mpcUserShareCommitment', 256);
    this.requireField(dto.mpcDeviceFingerprint, 'mpcDeviceFingerprint', 256);
    this.requireField(dto.mpcServerKmsKeyId, 'mpcServerKmsKeyId', 256);
    const chains = this.normalizeChains(dto.supportedChains);
    if (dto.walletAddress) this.requireAddress(dto.walletAddress);

    const row = await this.getOrInit(userId, livingPetId);
    row.custodyMode = 'mpc';
    row.mpcUserShareCommitment = dto.mpcUserShareCommitment;
    row.mpcDeviceFingerprint = dto.mpcDeviceFingerprint;
    row.mpcServerKmsKeyId = dto.mpcServerKmsKeyId;
    row.walletAddress = dto.walletAddress ?? row.walletAddress;
    row.supportedChains = chains;
    row.status = 'active';
    return this.repo.save(row);
  }

  async enableSelf(userId: string, livingPetId: string, dto: EnableSelfDto): Promise<PetSovereignProfile> {
    const pet = await this.requirePet(userId, livingPetId);
    this.gateIntimacy(pet);
    this.requireAddress(dto.walletAddress);
    const chains = this.normalizeChains(dto.supportedChains);

    const row = await this.getOrInit(userId, livingPetId);
    row.custodyMode = 'self';
    row.walletAddress = dto.walletAddress;
    row.mpcUserShareCommitment = null;
    row.mpcDeviceFingerprint = null;
    row.mpcServerKmsKeyId = null;
    row.supportedChains = chains;
    row.status = 'active';
    return this.repo.save(row);
  }

  async revertToPlatform(userId: string, livingPetId: string): Promise<PetSovereignProfile> {
    const row = await this.getOrInit(userId, livingPetId);
    row.custodyMode = 'platform';
    row.mpcUserShareCommitment = null;
    row.mpcDeviceFingerprint = null;
    row.mpcServerKmsKeyId = null;
    return this.repo.save(row);
  }

  async setStatus(userId: string, livingPetId: string, status: PetSovereignStatus): Promise<PetSovereignProfile> {
    if (!['active', 'paused', 'revoked'].includes(status)) {
      throw new BadRequestException('invalid status');
    }
    const row = await this.getOrInit(userId, livingPetId);
    row.status = status;
    return this.repo.save(row);
  }

  async updateChains(userId: string, livingPetId: string, dto: UpdateChainsDto): Promise<PetSovereignProfile> {
    const row = await this.getOrInit(userId, livingPetId);
    row.supportedChains = this.normalizeChains(dto.supportedChains);
    return this.repo.save(row);
  }

  async setMemoryUri(userId: string, livingPetId: string, dto: SetMemoryUriDto): Promise<PetSovereignProfile> {
    const row = await this.getOrInit(userId, livingPetId);
    if (!['platform', 'ipfs', 'arweave'].includes(dto.memoryStorage)) {
      throw new BadRequestException('memoryStorage must be platform|ipfs|arweave');
    }
    if (dto.memoryStorage === 'platform') {
      row.memoryStorage = 'platform';
      row.memoryUri = null;
      row.memoryHash = null;
      return this.repo.save(row);
    }
    if (!dto.memoryUri) throw new BadRequestException('memoryUri required for off-platform storage');
    if (dto.memoryStorage === 'ipfs' && !/^ipfs:\/\/.{20,}/.test(dto.memoryUri)) {
      throw new BadRequestException('memoryUri must start with ipfs:// for ipfs storage');
    }
    if (dto.memoryStorage === 'arweave' && !/^ar:\/\/.{20,}/.test(dto.memoryUri)) {
      throw new BadRequestException('memoryUri must start with ar:// for arweave storage');
    }
    if (dto.memoryUri.length > 256) throw new BadRequestException('memoryUri too long');
    if (dto.memoryHash && !/^[a-f0-9]{64}$/i.test(dto.memoryHash)) {
      throw new BadRequestException('memoryHash must be 64-char hex (sha-256)');
    }
    row.memoryStorage = dto.memoryStorage;
    row.memoryUri = dto.memoryUri;
    row.memoryHash = dto.memoryHash ?? null;
    return this.repo.save(row);
  }

  /** Convenience: takes raw memory text, hashes it, expects caller to pin separately. */
  hashMemorySnapshot(payload: string): string {
    return createHash('sha256').update(payload, 'utf8').digest('hex');
  }

  toDto(p: PetSovereignProfile) {
    return {
      id: p.id,
      living_pet_id: p.livingPetId,
      custody_mode: p.custodyMode,
      wallet_address: p.walletAddress,
      mpc: p.custodyMode === 'mpc' ? {
        user_share_commitment: p.mpcUserShareCommitment,
        device_fingerprint: p.mpcDeviceFingerprint,
        server_kms_key_id: p.mpcServerKmsKeyId,
      } : null,
      memory_storage: p.memoryStorage,
      memory_uri: p.memoryUri,
      memory_hash: p.memoryHash,
      supported_chains: p.supportedChains,
      status: p.status,
      created_at: p.createdAt?.getTime?.() ?? null,
      updated_at: p.updatedAt?.getTime?.() ?? null,
    };
  }

  // ───────── helpers ─────────

  private async requirePet(userId: string, livingPetId: string): Promise<LivingPet> {
    if (!userId || !livingPetId) throw new BadRequestException('userId and livingPetId required');
    const pet = await this.petRepo.findOne({ where: { id: livingPetId } });
    if (!pet) throw new NotFoundException('living pet not found');
    if (pet.userId !== userId) throw new ForbiddenException('not your pet');
    return pet;
  }

  private gateIntimacy(pet: LivingPet): void {
    if ((pet.intimacyLevel ?? 0) < MIN_SOVEREIGN_INTIMACY) {
      throw new BadRequestException(
        `intimacy_level ${pet.intimacyLevel} < ${MIN_SOVEREIGN_INTIMACY}; sovereign mode locked`,
      );
    }
  }

  private requireField(v: string, name: string, max: number): void {
    if (!v || typeof v !== 'string') throw new BadRequestException(`${name} required`);
    if (v.length > max) throw new BadRequestException(`${name} too long (>${max})`);
  }

  private requireAddress(addr: string): void {
    if (!addr || addr.length < 26 || addr.length > 96) {
      throw new BadRequestException('walletAddress invalid');
    }
  }

  private normalizeChains(input?: (SovereignChain | string)[]): string[] {
    const chains = Array.isArray(input) && input.length ? input : ['base'];
    const out: string[] = [];
    for (const c of chains) {
      if (!SUPPORTED_CHAINS.includes(c as SovereignChain)) {
        throw new BadRequestException(`unsupported chain: ${c}`);
      }
      if (!out.includes(c)) out.push(c);
    }
    return out;
  }
}
