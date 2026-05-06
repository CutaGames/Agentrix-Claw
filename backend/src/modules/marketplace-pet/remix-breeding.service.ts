import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PetSkin } from '../../entities/pet-skin.entity';

/**
 * RemixBreedingService — Phase 3 W2 BE-T3.7.
 *
 * "Lite" variant: combines the metadata of two parent PetSkins into a new
 * `remixed` child skin. The actual visual fusion (image diffusion) happens
 * out-of-band in PetGenerationService (provider call); this service is the
 * thin orchestration + lineage layer that:
 *
 *   1. Validates both parents exist, are not retired, and either:
 *      - the requester owns at least one parent, OR
 *      - the parent is `source='platform'` (publicly remixable)
 *   2. Picks the lineage anchor: `parentA` becomes the immediate parent in the
 *      ancestor chain (3-layer royalty cap kicks in at the splitter level).
 *   3. Inherits the original creator from the **higher-royalty** parent so the
 *      most invested creator keeps royalties (treasury policy).
 *   4. Creates a new PetSkin row with `source='remixed'`, no asset URL yet
 *      (caller fills it after the diffusion job completes).
 *
 * BE-T3.4 spec mandates royalty rates be CAPPED at parent's max so children
 * cannot inflate fees beyond the lineage; we enforce that here.
 */

export interface RemixBreedInput {
  parentASkinId: string;
  parentBSkinId: string;
  requesterUserId: string;
  displayName: string;
  /** Optional override; capped at MAX(parentA, parentB) royaltyRateBps. */
  desiredRoyaltyRateBps?: number;
}

@Injectable()
export class RemixBreedingService {
  private readonly logger = new Logger(RemixBreedingService.name);

  constructor(
    @InjectRepository(PetSkin)
    private readonly skinRepo: Repository<PetSkin>,
  ) {}

  async breed(input: RemixBreedInput): Promise<PetSkin> {
    if (input.parentASkinId === input.parentBSkinId) {
      throw new BadRequestException('parent_a and parent_b must differ');
    }
    if (!input.displayName?.trim()) {
      throw new BadRequestException('display_name required');
    }

    const [a, b] = await Promise.all([
      this.skinRepo.findOne({ where: { id: input.parentASkinId } }),
      this.skinRepo.findOne({ where: { id: input.parentBSkinId } }),
    ]);
    if (!a || !b) throw new NotFoundException('parent pet_skin not found');
    if (a.retired || b.retired) {
      throw new ForbiddenException('cannot remix from a retired skin');
    }

    const ownsA = a.ownerUserId === input.requesterUserId;
    const ownsB = b.ownerUserId === input.requesterUserId;
    const aPublic = a.source === 'platform';
    const bPublic = b.source === 'platform';
    if (!ownsA && !aPublic) {
      throw new ForbiddenException('not authorized to remix from parent_a');
    }
    if (!ownsB && !bPublic) {
      throw new ForbiddenException('not authorized to remix from parent_b');
    }

    // Cap royalty at MAX(parents). Default = max if no override.
    const maxParentRoyalty = Math.max(a.royaltyRateBps || 0, b.royaltyRateBps || 0);
    const requested = Number.isFinite(input.desiredRoyaltyRateBps as number)
      ? Math.max(0, Math.min(10000, input.desiredRoyaltyRateBps as number))
      : maxParentRoyalty;
    const royaltyRateBps = Math.min(requested, maxParentRoyalty);

    // Pick lineage anchor & creator: parentA is immediate parent;
    // originalCreator inherits from whichever parent has the higher royalty
    // (i.e. the more invested creator keeps royalties).
    const anchorParent = (a.royaltyRateBps || 0) >= (b.royaltyRateBps || 0) ? a : b;
    const originalCreatorUserId =
      anchorParent.originalCreatorUserId || anchorParent.ownerUserId || input.requesterUserId;

    const child = this.skinRepo.create({
      ownerUserId: input.requesterUserId,
      source: 'remixed',
      displayName: input.displayName.trim().slice(0, 120),
      url: '', // populated by diffusion pipeline downstream
      thumbnailUrl: null,
      format: a.format,
      manifest: {
        remixedFrom: [a.id, b.id],
        anchorParentId: anchorParent.id,
      },
      sourceRefId: null,
      version: 1,
      retired: false,
      parentSkinId: a.id, // ancestor chain follows parentA
      royaltyRateBps,
      originalCreatorUserId,
    });

    return this.skinRepo.save(child);
  }
}
