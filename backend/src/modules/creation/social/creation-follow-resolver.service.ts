import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CreationFollowEntity } from '../entities/creation-follow.entity';
import type { CreationFollowResolver } from '../discovery/feed-personalization';

/**
 * CreationFollowResolverService — feed `following` 口径的关注图谱解析实现
 * (world-creation-feed task 8.1,绑定 CREATION_FOLLOW_RESOLVER 接缝)。
 *
 * spec: 需求 5.6 / 8.3 —— 读 creation_follows 表,返回浏览者关注的创作者 id 集合。
 * social 落地后绑定本实现到 CreationDiscoveryService 的 @Optional 接缝;空关注为合法结果
 * (与"解析器不可用"语义不同,服务层据此区分降级)。
 */
@Injectable()
export class CreationFollowResolverService implements CreationFollowResolver {
  constructor(
    @InjectRepository(CreationFollowEntity)
    private readonly followRepo: Repository<CreationFollowEntity>,
  ) {}

  async resolveFollowedCreatorIds(viewerAccountId: string): Promise<string[]> {
    const rows = await this.followRepo.find({
      where: { followerAccountId: viewerAccountId },
      select: ['creatorAccountId'],
    });
    return [...new Set(rows.map((r) => r.creatorAccountId))];
  }
}
