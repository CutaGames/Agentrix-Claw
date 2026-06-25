import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AeonPlotMessage } from '../entities/aeon-plot-message.entity';
import { AeonPlot } from '../entities/aeon-plot.entity';

/**
 * PlotMessageService — 地块留言板(地图社交)。
 * 任何登录用户可在任意地块留言;地块 owner 可看自己收到的全部留言。
 */
@Injectable()
export class PlotMessageService {
  constructor(
    @InjectRepository(AeonPlotMessage)
    private readonly msgRepo: Repository<AeonPlotMessage>,
    @InjectRepository(AeonPlot)
    private readonly plotRepo: Repository<AeonPlot>,
  ) {}

  /** 列出某地块的留言(倒序,最新在前)。 */
  async list(plotId: string, limit = 50): Promise<AeonPlotMessage[]> {
    return this.msgRepo.find({
      where: { plotId },
      order: { createdAt: 'DESC' },
      take: Math.min(100, Math.max(1, limit)),
    });
  }

  /** 在地块留言。 */
  async post(plotId: string, authorUserId: string, body: string): Promise<AeonPlotMessage> {
    const trimmed = (body || '').trim();
    if (!trimmed) throw new BadRequestException('留言内容不能为空');
    if (trimmed.length > 280) throw new BadRequestException('留言不能超过 280 字');
    const plot = await this.plotRepo.findOne({ where: { id: plotId } });
    if (!plot) throw new NotFoundException('地块不存在');

    // 取留言者昵称快照(原始查询,避免引入 User 实体)。
    let authorName = '匿名居民';
    try {
      const rows: Array<{ nickname: string | null; paymind_id: string | null }> =
        await this.msgRepo.manager.query(
          `SELECT nickname, paymind_id FROM users WHERE id = $1 LIMIT 1`,
          [authorUserId],
        );
      if (rows[0]) authorName = rows[0].nickname || rows[0].paymind_id || '匿名居民';
    } catch {
      /* keep default */
    }

    const row = this.msgRepo.create({
      plotId,
      plotOwnerUserId: plot.ownerUserId,
      authorUserId,
      authorName,
      body: trimmed,
    });
    return this.msgRepo.save(row);
  }

  /** 我收到的留言(我所有地块上的访客留言)。 */
  async inbox(ownerUserId: string, limit = 50): Promise<AeonPlotMessage[]> {
    return this.msgRepo.find({
      where: { plotOwnerUserId: ownerUserId },
      order: { createdAt: 'DESC' },
      take: Math.min(100, Math.max(1, limit)),
    });
  }
}
