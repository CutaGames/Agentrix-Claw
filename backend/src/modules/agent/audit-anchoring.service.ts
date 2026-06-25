import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { AuditProof } from '../../entities/audit-proof.entity';
import { EasService } from './eas.service';
import * as crypto from 'crypto';

@Injectable()
export class AuditAnchoringService {
  private readonly logger = new Logger(AuditAnchoringService.name);

  constructor(
    @InjectRepository(AuditProof)
    private auditProofRepository: Repository<AuditProof>,
    private easService: EasService,
  ) {}

  /**
   * 每日凌晨 2 点执行审计锚定
   * 将前一天的所有审计证据哈希汇总为 Merkle Root 并发布到 EAS
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async performDailyAnchoring() {
    this.logger.log('开始执行每日审计锚定任务...');

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. 获取昨日所有审计证据
    const proofs = await this.auditProofRepository.find({
      where: {
        createdAt: Between(yesterday, today),
      },
      order: { createdAt: 'ASC' },
    });

    if (proofs.length === 0) {
      this.logger.log('昨日无审计证据，跳过锚定');
      return;
    }

    // 2. 计算 Merkle Root
    const hashes = proofs.map(p => p.proofHash).filter(h => !!h);
    const merkleRoot = this.calculateMerkleRoot(hashes);

    this.logger.log(`计算得到 Merkle Root: ${merkleRoot} (证据总数: ${proofs.length})`);

    // 3. 发布到 EAS
    try {
      const dateStr = yesterday.toISOString().split('T')[0];
      const uid = await this.easService.attestAuditRoot(merkleRoot, dateStr);

      if (uid) {
        this.logger.log(`审计锚定成功发布到 EAS, UID: ${uid}`);
      }
    } catch (error: any) {
      this.logger.error(`审计锚定发布失败: ${error.message}`);
    }
  }

  /**
   * 简单的 Merkle Root 计算
   */
  private calculateMerkleRoot(hashes: string[]): string {
    if (hashes.length === 0) return '0'.repeat(64);
    if (hashes.length === 1) return hashes[0];

    let currentLevel = hashes;
    while (currentLevel.length > 1) {
      const nextLevel: string[] = [];
      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i];
        const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left;
        const combined = crypto
          .createHash('sha256')
          .update(left + right)
          .digest('hex');
        nextLevel.push(combined);
      }
      currentLevel = nextLevel;
    }

    return currentLevel[0];
  }
}
