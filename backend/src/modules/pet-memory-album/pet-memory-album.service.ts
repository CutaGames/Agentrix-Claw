import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PetMemoryAlbum } from '../../entities/pet-memory-album.entity';
import { emitDesktopSyncEvent } from '../desktop-sync/desktop-sync.events';

export interface CreateMemoryInput {
  title: string;
  body?: string;
  thumbnailUrl?: string | null;
  category?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class PetMemoryAlbumService {
  private readonly logger = new Logger(PetMemoryAlbumService.name);

  constructor(
    @InjectRepository(PetMemoryAlbum)
    private readonly repo: Repository<PetMemoryAlbum>,
  ) {}

  async create(userId: string, input: CreateMemoryInput): Promise<PetMemoryAlbum> {
    const row = this.repo.create({
      userId,
      title: input.title.slice(0, 200),
      body: input.body ?? '',
      thumbnailUrl: input.thumbnailUrl ?? null,
      category: input.category ?? 'chat',
      metadata: input.metadata ?? {},
    });
    const saved = await this.repo.save(row);
    try {
      emitDesktopSyncEvent(userId, 'presence:pet.memory.added', {
        id: saved.id,
        category: saved.category,
        title: saved.title,
        thumbnail_url: saved.thumbnailUrl,
        created_at: saved.createdAt.getTime(),
      });
    } catch (e) {
      this.logger.warn(`broadcast pet.memory failed: ${(e as Error).message}`);
    }
    return saved;
  }

  async list(
    userId: string,
    opts: { limit?: number; offset?: number; category?: string } = {},
  ) {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const offset = Math.max(opts.offset ?? 0, 0);
    const where: any = { userId };
    if (opts.category) where.category = opts.category;
    const [items, total] = await this.repo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
    return { items, total, limit, offset };
  }

  async count(userId: string): Promise<number> {
    return this.repo.count({ where: { userId } });
  }

  async remove(userId: string, id: string) {
    const row = await this.repo.findOne({ where: { id, userId } });
    if (!row) throw new NotFoundException('memory not found');
    await this.repo.remove(row);
    return { ok: true };
  }
}
