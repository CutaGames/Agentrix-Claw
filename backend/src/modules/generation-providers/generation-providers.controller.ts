import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import {
  ALL_PROVIDERS,
  GenerationProvider,
  listProviders,
  ProviderModality,
} from './provider-catalog';

/**
 * Public catalog of video / 3D providers available to end users.
 *
 * No auth required — pricing & capability info is intentionally public so
 * landing pages, pricing pages and marketing site can render the same data.
 *
 * Live entries are usable immediately; `coming_soon` entries appear in the
 * picker greyed-out so users can vote/preview pricing before contracts are
 * signed.
 */
@ApiTags('generation-providers')
@Controller('generation-providers')
export class GenerationProvidersController {
  @Get('video')
  @ApiOperation({ summary: 'List all video-generation providers (live + coming_soon)' })
  listVideo() {
    return { providers: listProviders('video') };
  }

  @Get('3d')
  @ApiOperation({ summary: 'List all 3D-model-generation providers (live + coming_soon)' })
  list3D() {
    return { providers: listProviders('3d') };
  }

  @Get()
  @ApiOperation({ summary: 'List all generation providers (video + 3D)' })
  listAll(): { providers: GenerationProvider[] } {
    return { providers: ALL_PROVIDERS };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single provider by id' })
  getOne(@Param('id') id: string) {
    return ALL_PROVIDERS.find((p) => p.id === id) || null;
  }
}
