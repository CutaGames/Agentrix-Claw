import { Body, Controller, NotFoundException, Post, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PetGenerationService } from './pet-generation.service';
import { PetSkinService } from '../pet-skin/pet-skin.service';

/**
 * V4 §3.4 — Pet breeding (双图繁殖)
 *
 *   POST /api/v1/pet/breed
 *
 * Body: { parentSkinIdA, parentSkinIdB, prompt? }
 *
 * Internally synthesises a composite prompt + uses parent A's URL as the
 * reference image, then delegates to PetGenerationService in `image` mode.
 * Returns the same accepted/taskId envelope as /pet-generation/submit.
 *
 * The desktop client used to do this synthesis on the frontend; this endpoint
 * makes the backend the source of truth so mobile / web share the same path.
 */
@ApiTags('pet-generation')
@Controller('v1/pet')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PetBreedController {
  constructor(
    private readonly genService: PetGenerationService,
    private readonly skinService: PetSkinService,
  ) {}

  @Post('breed')
  @ApiOperation({ summary: 'V4 双图繁殖：合成两只父系皮肤的特征生成新宠物' })
  async breed(
    @Request() req: any,
    @Body()
    body: {
      parentSkinIdA: string;
      parentSkinIdB: string;
      prompt?: string;
      style?: string;
    },
  ) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    if (!body?.parentSkinIdA || !body?.parentSkinIdB) {
      throw new NotFoundException('parentSkinIdA and parentSkinIdB are required');
    }
    const [parentA, parentB] = await Promise.all([
      this.skinService.findById(body.parentSkinIdA),
      this.skinService.findById(body.parentSkinIdB),
    ]);
    if (!parentA) throw new NotFoundException(`parent A not found: ${body.parentSkinIdA}`);
    if (!parentB) throw new NotFoundException(`parent B not found: ${body.parentSkinIdB}`);

    const userPrompt = (body.prompt || '').trim();
    const composedPrompt =
      (userPrompt ? userPrompt + '\n\n' : '') +
      `Breed/fuse the visual traits of two parent pets into a single cohesive 3D pet. ` +
      `Parent A reference: ${parentA.url} (${parentA.displayName}). ` +
      `Parent B reference: ${parentB.url} (${parentB.displayName}). ` +
      `Inherit signature features (silhouette, color palette, accessories) from both parents.`;

    return this.genService.executeTool(
      {
        mode: 'image',
        prompt: composedPrompt,
        referenceImageUrl: parentA.url,
        style: body.style,
      } as any,
      {
        userId,
        platform: 'desktop',
        metadata: {
          source: 'pet-breed',
          parentSkinIdA: parentA.id,
          parentSkinIdB: parentB.id,
        },
      } as any,
    );
  }
}
