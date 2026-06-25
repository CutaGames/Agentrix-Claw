import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PetMemoryAlbumService } from './pet-memory-album.service';

/**
 * Pet Phase 6 S4 — 时光相册 API
 *   GET    /api/v1/pet/memories
 *   POST   /api/v1/pet/memories
 *   DELETE /api/v1/pet/memories/:id
 */
@UseGuards(JwtAuthGuard)
@Controller('v1/pet/memories')
export class PetMemoryAlbumController {
  constructor(private readonly service: PetMemoryAlbumService) {}

  @Get()
  async list(
    @Req() req: any,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('category') category?: string,
  ) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    return this.service.list(userId, {
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      category,
    });
  }

  @Post()
  async create(
    @Req() req: any,
    @Body()
    body: {
      title: string;
      body?: string;
      thumbnailUrl?: string | null;
      category?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    return this.service.create(userId, body);
  }

  @Delete(':id')
  async remove(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    return this.service.remove(userId, id);
  }
}
