import { Injectable, BadRequestException, NotFoundException, Optional, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DmcaReport, DmcaStatus, DmcaTargetKind } from '../../entities/dmca-report.entity';
import { PetSkinService } from '../pet-skin/pet-skin.service';

export interface CreateDmcaReportInput {
  claimantUserId: string;
  claimantEmail: string;
  targetKind: DmcaTargetKind;
  targetId: string;
  uploaderUserId?: string | null;
  rightType?: string;
  description: string;
  evidenceUrls?: string[];
  swornStatement: boolean;
}

const DUPLICATE_WINDOW_DAYS = 7;

/**
 * DmcaService — Phase 2 W2 BE-T2.9
 *
 *  - createReport: validates DMCA legal requirements (sworn + email + description ≥ 30),
 *    and rejects duplicates from same claimant on same target within 7 days.
 *  - resolve: reviewer sets status to 'upheld' / 'rejected', with notes; on 'upheld'
 *    caller is responsible for delisting the asset (PetSkinService.delist).
 *  - listPending: admin queue.
 */
@Injectable()
export class DmcaService {
  private readonly logger = new Logger(DmcaService.name);

  constructor(
    @InjectRepository(DmcaReport)
    private readonly repo: Repository<DmcaReport>,
    @Optional() private readonly petSkinService?: PetSkinService,
  ) {}

  async createReport(input: CreateDmcaReportInput): Promise<DmcaReport> {
    if (!input.swornStatement) {
      throw new BadRequestException('DMCA filing requires a sworn statement of truthfulness');
    }
    if (!input.claimantEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.claimantEmail)) {
      throw new BadRequestException('valid claimant email is required by DMCA');
    }
    if (!input.description || input.description.trim().length < 30) {
      throw new BadRequestException('DMCA description must be at least 30 characters');
    }
    if (!input.targetId || !input.targetKind) {
      throw new BadRequestException('targetKind and targetId are required');
    }

    // Duplicate-suppression window
    const cutoff = new Date(Date.now() - DUPLICATE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const dup = await this.repo
      .createQueryBuilder('r')
      .where('r.claimant_user_id = :uid', { uid: input.claimantUserId })
      .andWhere('r.target_id = :tid', { tid: input.targetId })
      .andWhere('r.target_kind = :tk', { tk: input.targetKind })
      .andWhere('r.created_at > :cutoff', { cutoff })
      .getOne();
    if (dup) {
      throw new BadRequestException(
        `duplicate DMCA report from same claimant for the same target within ${DUPLICATE_WINDOW_DAYS} days (existing report id=${dup.id})`,
      );
    }

    const row = this.repo.create({
      claimantUserId: input.claimantUserId,
      claimantEmail: input.claimantEmail,
      targetKind: input.targetKind,
      targetId: input.targetId,
      uploaderUserId: input.uploaderUserId ?? null,
      rightType: input.rightType ?? 'copyright',
      description: input.description.trim(),
      evidenceUrls: input.evidenceUrls && input.evidenceUrls.length > 0 ? input.evidenceUrls : null,
      swornStatement: true,
      status: 'pending',
    });
    return this.repo.save(row);
  }

  async resolve(
    reportId: string,
    reviewerUserId: string,
    decision: 'upheld' | 'rejected',
    notes?: string,
  ): Promise<DmcaReport> {
    const row = await this.repo.findOne({ where: { id: reportId } });
    if (!row) throw new NotFoundException('DMCA report not found');
    if (row.status !== 'pending' && row.status !== 'reviewing') {
      throw new BadRequestException(`cannot resolve report in status=${row.status}`);
    }
    row.status = decision;
    row.reviewerUserId = reviewerUserId;
    row.reviewNotes = notes ?? null;
    row.resolvedAt = new Date();
    const saved = await this.repo.save(row);

    // Phase 2 W3 — upheld DMCA on a pet_skin auto-delists the asset.
    if (decision === 'upheld' && row.targetKind === 'pet_skin' && this.petSkinService) {
      try {
        await this.petSkinService.delist(row.targetId, { reason: `dmca:${row.id}` });
      } catch (err: any) {
        this.logger.error(
          `DMCA upheld but pet-skin delist failed report=${row.id} skin=${row.targetId}: ${err?.message || err}`,
        );
        // do not fail the resolve; admin can retry delist manually
      }
    }
    return saved;
  }

  async withdraw(reportId: string, claimantUserId: string): Promise<DmcaReport> {
    const row = await this.repo.findOne({ where: { id: reportId } });
    if (!row) throw new NotFoundException('DMCA report not found');
    if (row.claimantUserId !== claimantUserId) {
      throw new BadRequestException('only the original claimant can withdraw');
    }
    if (row.status !== 'pending' && row.status !== 'reviewing') {
      throw new BadRequestException(`cannot withdraw resolved report (status=${row.status})`);
    }
    row.status = 'withdrawn';
    return this.repo.save(row);
  }

  async listPending(limit = 50): Promise<DmcaReport[]> {
    return this.repo.find({
      where: [{ status: 'pending' as DmcaStatus }, { status: 'reviewing' as DmcaStatus }],
      order: { createdAt: 'ASC' },
      take: limit,
    });
  }

  async findById(id: string): Promise<DmcaReport | null> {
    return this.repo.findOne({ where: { id } });
  }

  toDto(row: DmcaReport) {
    return {
      report_id: row.id,
      claimant_user_id: row.claimantUserId,
      target_kind: row.targetKind,
      target_id: row.targetId,
      right_type: row.rightType,
      status: row.status,
      created_at: row.createdAt?.toISOString?.(),
      resolved_at: row.resolvedAt?.toISOString?.() ?? null,
    };
  }
}
