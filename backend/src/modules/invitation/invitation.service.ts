import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { randomBytes } from 'crypto';
import {
  InvitationCode,
  InvitationCodeStatus,
} from '../../entities/invitation-code.entity';
import { GenerateCodesDto } from './dto/generate-codes.dto';

@Injectable()
export class InvitationService {
  private readonly logger = new Logger(InvitationService.name);

  constructor(
    @InjectRepository(InvitationCode)
    private readonly codeRepo: Repository<InvitationCode>,
  ) {}

  // ── Public endpoints ─────────────────────────────────────────────────

  /**
   * Validate an invitation code without consuming it.
   * Returns { valid, code, message }.
   */
  async validateCode(code: string): Promise<{ valid: boolean; code: string; message: string }> {
    const normalised = code.trim().toUpperCase();
    const entity = await this.codeRepo.findOne({ where: { code: normalised } });

    if (!entity) {
      return { valid: false, code: normalised, message: 'Invalid invitation code' };
    }
    if (entity.status === InvitationCodeStatus.DISABLED) {
      return { valid: false, code: normalised, message: 'This code has been disabled' };
    }
    if (entity.status === InvitationCodeStatus.EXPIRED) {
      return { valid: false, code: normalised, message: 'This code has expired' };
    }
    if (entity.expiresAt && new Date(entity.expiresAt) < new Date()) {
      // Mark as expired
      await this.codeRepo.update(entity.id, { status: InvitationCodeStatus.EXPIRED });
      return { valid: false, code: normalised, message: 'This code has expired' };
    }
    if (entity.usedCount >= entity.maxUses) {
      return { valid: false, code: normalised, message: 'This code has already been used' };
    }

    return { valid: true, code: normalised, message: 'Code is valid' };
  }

  /**
   * Redeem an invitation code — binds it to a user.
   * Should be called after the user has authenticated (OAuth / email).
   */
  async redeemCode(
    code: string,
    userId: string,
  ): Promise<{ success: boolean; message: string }> {
    const normalised = code.trim().toUpperCase();
    const entity = await this.codeRepo.findOne({ where: { code: normalised } });

    if (!entity) {
      throw new BadRequestException('Invalid invitation code');
    }

    // Check already redeemed by this user
    if (entity.usedByUserId === userId) {
      return { success: true, message: 'Already redeemed' };
    }

    const validation = await this.validateCode(normalised);
    if (!validation.valid) {
      throw new BadRequestException(validation.message);
    }

    // Redeem
    entity.usedCount += 1;
    entity.usedByUserId = userId;
    entity.usedAt = new Date();
    if (entity.usedCount >= entity.maxUses) {
      entity.status = InvitationCodeStatus.USED;
    }

    await this.codeRepo.save(entity);
    this.logger.log(`Invitation code ${normalised} redeemed by user ${userId}`);

    return { success: true, message: 'Invitation code redeemed successfully' };
  }

  /**
   * Check if a user has a valid redeemed invitation code.
   */
  async hasValidInvitation(userId: string): Promise<boolean> {
    const count = await this.codeRepo.count({
      where: { usedByUserId: userId },
    });
    return count > 0;
  }

  // ── Admin endpoints ──────────────────────────────────────────────────

  /**
   * Generate a batch of invitation codes.
   */
  async generateCodes(dto: GenerateCodesDto): Promise<{
    batch: string;
    count: number;
    codes: string[];
  }> {
    const codes: InvitationCode[] = [];
    const codeStrings: string[] = [];

    for (let i = 0; i < dto.count; i++) {
      const code = this.generateCodeString();
      codeStrings.push(code);
      const entity = this.codeRepo.create({
        code,
        batch: dto.batch,
        channel: dto.channel,
        maxUses: dto.maxUses ?? 1,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      });
      codes.push(entity);
    }

    await this.codeRepo.save(codes);
    this.logger.log(`Generated ${dto.count} invitation codes for batch ${dto.batch}`);

    return { batch: dto.batch, count: dto.count, codes: codeStrings };
  }

  /**
   * List all invitation codes with filtering.
   */
  async listCodes(query: {
    batch?: string;
    status?: InvitationCodeStatus;
    channel?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    items: InvitationCode[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const where: any = {};

    if (query.batch) where.batch = query.batch;
    if (query.status) where.status = query.status;
    if (query.channel) where.channel = query.channel;

    const [items, total] = await this.codeRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { items, total, page, limit };
  }

  /**
   * Get usage statistics.
   */
  async getStatistics(): Promise<{
    total: number;
    available: number;
    used: number;
    expired: number;
    disabled: number;
    redemptionRate: string;
    byBatch: Array<{ batch: string; total: number; used: number }>;
    byChannel: Array<{ channel: string; total: number; used: number }>;
  }> {
    const total = await this.codeRepo.count();
    const available = await this.codeRepo.count({ where: { status: InvitationCodeStatus.AVAILABLE } });
    const used = await this.codeRepo.count({ where: { status: InvitationCodeStatus.USED } });
    const expired = await this.codeRepo.count({ where: { status: InvitationCodeStatus.EXPIRED } });
    const disabled = await this.codeRepo.count({ where: { status: InvitationCodeStatus.DISABLED } });

    // By batch
    const byBatch = await this.codeRepo
      .createQueryBuilder('ic')
      .select('ic.batch', 'batch')
      .addSelect('COUNT(*)', 'total')
      .addSelect('SUM(CASE WHEN ic.status = :used THEN 1 ELSE 0 END)', 'used')
      .setParameter('used', InvitationCodeStatus.USED)
      .groupBy('ic.batch')
      .getRawMany();

    // By channel
    const byChannel = await this.codeRepo
      .createQueryBuilder('ic')
      .select('ic.channel', 'channel')
      .addSelect('COUNT(*)', 'total')
      .addSelect('SUM(CASE WHEN ic.status = :used THEN 1 ELSE 0 END)', 'used')
      .setParameter('used', InvitationCodeStatus.USED)
      .where('ic.channel IS NOT NULL')
      .groupBy('ic.channel')
      .getRawMany();

    const redemptionRate = total > 0 ? ((used / total) * 100).toFixed(1) + '%' : '0%';

    return { total, available, used, expired, disabled, redemptionRate, byBatch, byChannel };
  }

  /**
   * Disable specific codes.
   */
  async disableCodes(codeIds: string[]): Promise<{ affected: number }> {
    const result = await this.codeRepo.update(
      { id: In(codeIds) },
      { status: InvitationCodeStatus.DISABLED },
    );
    return { affected: result.affected ?? 0 };
  }

  /**
   * Disable all codes in a batch.
   */
  async disableBatch(batch: string): Promise<{ affected: number }> {
    const result = await this.codeRepo.update(
      { batch, status: InvitationCodeStatus.AVAILABLE },
      { status: InvitationCodeStatus.DISABLED },
    );
    return { affected: result.affected ?? 0 };
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  /**
   * Generate a unique code in the format AX-XXXXXX (6 alphanumeric chars).
   */
  private generateCodeString(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // exclude confusing: 0OI1
    const bytes = randomBytes(6);
    let result = 'AX-';
    for (let i = 0; i < 6; i++) {
      result += chars[bytes[i] % chars.length];
    }
    return result;
  }
}
