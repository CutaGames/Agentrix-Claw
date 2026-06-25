import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PetSkin } from '../../entities/pet-skin.entity';
import {
  pHash,
  hammingDistance,
  PHASH_DEFAULT_MATCH_THRESHOLD,
  type GrayscaleImage,
} from './phash';

/**
 * ReverseImageSearchService — Phase 3 W2 BE-T3.6.
 *
 * Detects whether a query image is a near-duplicate of an existing PetSkin
 * thumbnail. Used by:
 *   - DMCA evidence collection ("found this on Pirate Bay; is it ours?")
 *   - PetCreator upload pipeline ("you are uploading something that already exists")
 *   - Marketplace anti-fraud ("seller's listing image matches another user's skin")
 *
 * Storage: pHash is stored in `pet_skins.manifest.phash` (jsonb) — no schema
 * migration required. For Phase 4 we'll move to a dedicated indexed column
 * (or pgvector) once the corpus exceeds ~50k rows.
 *
 * Acceptance (BE-T3.6): ≥ 90% recall on known-piracy samples; here we exceed
 * that with the default Hamming threshold of 12 (see phash.spec.ts).
 */

export interface ReverseSearchMatch {
  skinId: string;
  ownerUserId: string | null;
  distance: number;
  thumbnailUrl: string | null;
  displayName: string;
}

const SCAN_BATCH = 500;

@Injectable()
export class ReverseImageSearchService {
  private readonly logger = new Logger(ReverseImageSearchService.name);

  constructor(
    @InjectRepository(PetSkin)
    private readonly skinRepo: Repository<PetSkin>,
  ) {}

  /** Compute pHash from a decoded grayscale image and persist on the skin. */
  async registerPhash(skinId: string, image: GrayscaleImage): Promise<string> {
    const hash = pHash(image);
    const skin = await this.skinRepo.findOne({ where: { id: skinId } });
    if (!skin) return hash;
    const manifest = { ...(skin.manifest || {}), phash: hash };
    await this.skinRepo.update({ id: skinId }, { manifest });
    return hash;
  }

  /** Search by pHash (already computed). Returns up to `limit` matches sorted by distance. */
  async searchByHash(
    queryHash: string,
    opts: { threshold?: number; limit?: number; excludeSkinId?: string } = {},
  ): Promise<ReverseSearchMatch[]> {
    const threshold = opts.threshold ?? PHASH_DEFAULT_MATCH_THRESHOLD;
    const limit = opts.limit ?? 20;

    const matches: ReverseSearchMatch[] = [];
    let offset = 0;
    // Stream-scan in batches; in production this would be an indexed query.
    while (true) {
      const batch = await this.skinRepo
        .createQueryBuilder('s')
        .where("s.manifest ? 'phash'")
        .andWhere('s.retired = false')
        .orderBy('s.createdAt', 'DESC')
        .skip(offset)
        .take(SCAN_BATCH)
        .getMany();
      if (batch.length === 0) break;

      for (const skin of batch) {
        if (opts.excludeSkinId && skin.id === opts.excludeSkinId) continue;
        const phash = (skin.manifest as any)?.phash;
        if (typeof phash !== 'string' || phash.length !== queryHash.length) continue;
        const d = hammingDistance(queryHash, phash);
        if (d <= threshold) {
          matches.push({
            skinId: skin.id,
            ownerUserId: skin.ownerUserId,
            distance: d,
            thumbnailUrl: skin.thumbnailUrl,
            displayName: skin.displayName,
          });
        }
      }
      offset += batch.length;
      if (batch.length < SCAN_BATCH) break;
    }

    matches.sort((a, b) => a.distance - b.distance);
    return matches.slice(0, limit);
  }

  /** Convenience: compute hash from raw grayscale image and search. */
  async searchByImage(
    image: GrayscaleImage,
    opts: { threshold?: number; limit?: number; excludeSkinId?: string } = {},
  ): Promise<{ queryHash: string; matches: ReverseSearchMatch[] }> {
    const queryHash = pHash(image);
    const matches = await this.searchByHash(queryHash, opts);
    return { queryHash, matches };
  }
}
