import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PetSkin } from '../../entities/pet-skin.entity';
import { RoyaltyChainLink } from './royalty-splitter';

const MAX_LINEAGE_DEPTH = 8; // safety bound; royalty splitter caps at 3 anyway

/**
 * AncestorChainService — Phase 3 W1.
 * Walks the PetSkin.parentSkinId chain to assemble the ancestor royalty chain
 * passed to splitRoyalty(). Oldest ancestor first.
 */
@Injectable()
export class AncestorChainService {
  constructor(
    @InjectRepository(PetSkin) private readonly skinRepo: Repository<PetSkin>,
  ) {}

  async resolveChain(skinId: string): Promise<RoyaltyChainLink[]> {
    const visited = new Set<string>();
    const reverseChain: RoyaltyChainLink[] = []; // newest → oldest first
    let current = await this.skinRepo.findOne({ where: { id: skinId } });
    let depth = 0;
    while (current && depth < MAX_LINEAGE_DEPTH) {
      if (visited.has(current.id)) break; // cycle guard
      visited.add(current.id);
      const creator = current.originalCreatorUserId ?? current.ownerUserId;
      if (creator) {
        reverseChain.push({
          creatorUserId: creator,
          royaltyRateBps: current.royaltyRateBps ?? 0,
        });
      }
      if (!current.parentSkinId) break;
      current = await this.skinRepo.findOne({ where: { id: current.parentSkinId } });
      depth++;
    }
    return reverseChain.reverse(); // oldest first
  }
}
