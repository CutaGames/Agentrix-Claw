import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

import { CreationService } from './creation.service';
import { CreationStateMachine } from './creation-state-machine';

/** Public (unauthenticated) share-landing projection for a Creation. */
export interface PublicCreationShare {
  id: string;
  type: string;
  title: string;
  summary?: string;
  /** Cover image URL (creation.preview) — used for the web landing + OG image. */
  coverUrl?: string;
  shareCode: string;
  /** In-app deep link to open this creation. */
  deepLink: string;
}

/**
 * CreationPublicController — UNAUTHENTICATED share-code resolution for the web
 * landing page `https://agentrix.top/c/:code` (and social OG previews).
 *
 * Deliberately NOT behind JwtAuthGuard: a share link must resolve for anyone.
 * Only returns DISCOVERABLE (published/listed) creations; otherwise 404 — so
 * drafts / unpublished / suspended never leak via a guessed code.
 */
@ApiTags('creation')
@Controller('v1/creations')
export class CreationPublicController {
  constructor(
    private readonly service: CreationService,
    private readonly stateMachine: CreationStateMachine,
  ) {}

  @Get('by-share/:code')
  @ApiOperation({ summary: 'Resolve a public share code to minimal creation info (no auth).' })
  async byShare(@Param('code') code: string): Promise<PublicCreationShare> {
    const c = await this.service.getByShareCode(code);
    if (!c || !this.stateMachine.isDiscoverable(c.status)) {
      throw new NotFoundException('Creation not found.');
    }
    return {
      id: c.id,
      type: c.type,
      title: c.title,
      summary: c.summary ?? undefined,
      coverUrl: c.preview?.url || undefined,
      shareCode: c.shareCode!,
      deepLink: `agentrix://world/creation/${c.shareCode}`,
    };
  }
}
