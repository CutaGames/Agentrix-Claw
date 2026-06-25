import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PetNftIntent, PetNftIntentStatus } from '../../entities/pet-nft-intent.entity';
import { LivingPet } from '../../entities/living-pet.entity';

/**
 * Phase 6 M3 — NFT mint intent service.
 *
 * Off-chain row that gates a future on-chain mint by intimacy. The actual
 * tx submission is performed by an external signer (out of scope here).
 *
 * State machine:
 *   pending → ready → submitted → minted
 *                                ↘ failed
 *   pending|ready → cancelled
 *
 * Mint gating:
 *   - LivingPet.intimacyLevel >= MIN_INTIMACY_LEVEL (default 5)
 *   - One active intent per (livingPetId, chain) — enforced by partial unique idx
 */

export const MIN_INTIMACY_LEVEL = 5;
export const SUPPORTED_CHAINS = ['base', 'eth', 'bsc', 'sol'] as const;
export type Chain = (typeof SUPPORTED_CHAINS)[number];

export interface CreateIntentDto {
  chain: Chain | string;
  recipientAddress: string;
}

@Injectable()
export class PetNftService {
  constructor(
    @InjectRepository(PetNftIntent)
    private readonly repo: Repository<PetNftIntent>,
    @InjectRepository(LivingPet)
    private readonly petRepo: Repository<LivingPet>,
  ) {}

  async create(userId: string, livingPetId: string, dto: CreateIntentDto): Promise<PetNftIntent> {
    if (!userId || !livingPetId) throw new BadRequestException('userId and livingPetId required');
    if (!SUPPORTED_CHAINS.includes(dto.chain as Chain)) {
      throw new BadRequestException(`chain must be one of ${SUPPORTED_CHAINS.join(',')}`);
    }
    if (!dto.recipientAddress || dto.recipientAddress.length < 26 || dto.recipientAddress.length > 96) {
      throw new BadRequestException('recipientAddress invalid');
    }
    const pet = await this.petRepo.findOne({ where: { id: livingPetId } });
    if (!pet) throw new NotFoundException('living pet not found');
    if (pet.userId !== userId) throw new BadRequestException('pet does not belong to user');
    if ((pet.intimacyLevel ?? 0) < MIN_INTIMACY_LEVEL) {
      throw new BadRequestException(
        `intimacy_level ${pet.intimacyLevel} < ${MIN_INTIMACY_LEVEL}; cannot mint NFT yet`,
      );
    }
    // partial unique idx blocks the duplicate, but probe early for a nicer error.
    const existing = await this.repo
      .createQueryBuilder('i')
      .where('i.livingPetId = :p AND i.chain = :c AND i.status NOT IN (:...closed)', {
        p: livingPetId, c: dto.chain, closed: ['failed', 'cancelled'],
      })
      .getOne();
    if (existing) {
      throw new BadRequestException(
        `existing ${existing.status} intent on ${dto.chain} for this pet (${existing.id})`,
      );
    }
    const row = this.repo.create({
      userId,
      livingPetId,
      soulTemplateId: pet.soulTemplateId || 'claw',
      intimacySnapshot: pet.intimacyLevel,
      chain: dto.chain,
      recipientAddress: dto.recipientAddress,
      status: 'pending',
      metadata: this.buildMetadata(pet),
    });
    return this.repo.save(row);
  }

  async list(userId: string): Promise<PetNftIntent[]> {
    return this.repo.find({ where: { userId }, order: { createdAt: 'DESC' }, take: 50 });
  }

  async get(userId: string, id: string): Promise<PetNftIntent> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('intent not found');
    if (row.userId !== userId) throw new BadRequestException('not your intent');
    return row;
  }

  async cancel(userId: string, id: string): Promise<PetNftIntent> {
    const row = await this.get(userId, id);
    if (!['pending', 'ready'].includes(row.status)) {
      throw new BadRequestException(`cannot cancel intent in status=${row.status}`);
    }
    row.status = 'cancelled';
    return this.repo.save(row);
  }

  /** Internal — called by signer worker after metadata pin. */
  async markReady(id: string, metadataUri: string): Promise<PetNftIntent> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('intent not found');
    if (row.status !== 'pending') throw new BadRequestException(`status must be pending`);
    row.metadataUri = metadataUri;
    row.status = 'ready';
    return this.repo.save(row);
  }

  /** Internal — signer worker advances to submitted. */
  async markSubmitted(id: string, txHash: string, contractAddress: string): Promise<PetNftIntent> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('intent not found');
    if (row.status !== 'ready') throw new BadRequestException(`status must be ready`);
    row.txHash = txHash;
    row.contractAddress = contractAddress.toLowerCase();
    row.status = 'submitted';
    return this.repo.save(row);
  }

  /** Internal — chain confirmation watcher advances to minted. */
  async markMinted(id: string, tokenId: string): Promise<PetNftIntent> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('intent not found');
    if (row.status !== 'submitted') throw new BadRequestException(`status must be submitted`);
    row.tokenId = tokenId;
    row.status = 'minted';
    return this.repo.save(row);
  }

  async markFailed(id: string, reason: string): Promise<PetNftIntent> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('intent not found');
    if (['minted', 'cancelled'].includes(row.status)) {
      throw new BadRequestException(`cannot fail intent in status=${row.status}`);
    }
    row.status = 'failed';
    row.errorMessage = (reason || '').slice(0, 1000);
    return this.repo.save(row);
  }

  toDto(i: PetNftIntent) {
    return {
      id: i.id,
      living_pet_id: i.livingPetId,
      soul_template_id: i.soulTemplateId,
      intimacy_snapshot: i.intimacySnapshot,
      chain: i.chain,
      contract_address: i.contractAddress,
      token_id: i.tokenId,
      tx_hash: i.txHash,
      recipient_address: i.recipientAddress,
      metadata_uri: i.metadataUri,
      status: i.status,
      error_message: i.errorMessage,
      created_at: i.createdAt?.getTime?.() ?? null,
      updated_at: i.updatedAt?.getTime?.() ?? null,
    };
  }

  private buildMetadata(pet: LivingPet): Record<string, unknown> {
    return {
      schema: 'agentrix.pet-nft.v1',
      pet_id: pet.id,
      soul_template_id: pet.soulTemplateId,
      species: pet.species,
      intimacy_level: pet.intimacyLevel,
      minted_at_iso: new Date().toISOString(),
    };
  }
}
