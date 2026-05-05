import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CoSignRequestEntity } from '../../entities/co-sign-request.entity';

/**
 * 顿领 §13.2 L3 多端协签 (P3-7 part 2)
 * High-value action requires N-of-M signatures across surfaces (mobile + watch + desktop).
 * In-memory MVP.
 */

export type SignSurface = 'mobile' | 'watch' | 'desktop' | 'web';

export interface CoSignRequest {
  id: string;
  initiatorUserId: string;
  action_kind: 'transfer' | 'pay' | 'deploy' | 'delete';
  resource: string;
  amount_cents: number;
  required_signatures: number; // e.g. 2-of-3
  required_surfaces: SignSurface[]; // e.g. ['mobile','watch']
  signatures: Array<{ surface: SignSurface; device_id?: string; ts: number; method?: string }>;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  createdAt: number;
  expiresAt: number;
  finalizedAt?: number;
}

@Injectable()
export class CoSignService {
  constructor(
    @InjectRepository(CoSignRequestEntity)
    private readonly requestRepo: Repository<CoSignRequestEntity>,
  ) {}

  private genId() {
    return `cosign_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  async create(userId: string, body: {
    action_kind: CoSignRequest['action_kind'];
    resource: string;
    amount_cents: number;
    required_signatures?: number;
    required_surfaces?: SignSurface[];
    ttl_ms?: number;
  }): Promise<CoSignRequest> {
    if (!body?.resource) throw new BadRequestException('resource required');
    if (!body.amount_cents || body.amount_cents <= 0) throw new BadRequestException('amount_cents required');
    const surfaces = body.required_surfaces || ['mobile', 'watch'];
    const required = body.required_signatures ?? Math.min(2, surfaces.length);
    if (required > surfaces.length) throw new BadRequestException('required_signatures > required_surfaces');

    const now = Date.now();
    const r = this.requestRepo.create({
      id: this.genId(),
      initiatorUserId: userId,
      actionKind: body.action_kind,
      resource: body.resource,
      amountCents: body.amount_cents,
      requiredSignatures: required,
      requiredSurfaces: surfaces,
      signatures: [],
      status: 'pending',
      createdAtMs: String(now),
      expiresAtMs: String(now + (body.ttl_ms || 5 * 60 * 1000)),
      finalizedAtMs: null,
    });
    return this.toRequest(await this.requestRepo.save(r));
  }

  async sign(userId: string, id: string, body: { surface: SignSurface; device_id?: string; method?: string }): Promise<CoSignRequest> {
    const r = await this.requestRepo.findOne({ where: { id } });
    if (!r) throw new NotFoundException('co-sign request not found');
    if (r.initiatorUserId !== userId) throw new BadRequestException('only initiator can sign');
    if (r.status !== 'pending') throw new BadRequestException(`request is ${r.status}`);
    if (Date.now() > Number(r.expiresAtMs)) {
      r.status = 'expired';
      await this.requestRepo.save(r);
      throw new BadRequestException('expired');
    }
    if (!r.requiredSurfaces.includes(body.surface)) {
      throw new BadRequestException(`surface ${body.surface} not in required_surfaces`);
    }
    if ((r.signatures ?? []).some((s) => s.surface === body.surface)) {
      throw new BadRequestException(`surface ${body.surface} already signed`);
    }
    const now = Date.now();
    r.signatures = [
      ...(r.signatures ?? []),
      {
      surface: body.surface,
      device_id: body.device_id,
      method: body.method,
        ts: now,
      },
    ];
    if (r.signatures.length >= r.requiredSignatures) {
      r.status = 'approved';
      r.finalizedAtMs = String(now);
    }
    return this.toRequest(await this.requestRepo.save(r));
  }

  async reject(userId: string, id: string): Promise<CoSignRequest> {
    const r = await this.requestRepo.findOne({ where: { id } });
    if (!r) throw new NotFoundException('not found');
    if (r.initiatorUserId !== userId) throw new BadRequestException('only initiator can reject');
    r.status = 'rejected';
    r.finalizedAtMs = String(Date.now());
    return this.toRequest(await this.requestRepo.save(r));
  }

  async get(id: string): Promise<CoSignRequest> {
    const r = await this.requestRepo.findOne({ where: { id } });
    if (!r) throw new NotFoundException('not found');
    return this.toRequest(r);
  }

  async list(userId: string, status?: CoSignRequest['status']): Promise<CoSignRequest[]> {
    let arr = (await this.requestRepo.find({ where: { initiatorUserId: userId }, order: { createdAtMs: 'DESC' } }))
      .map((request) => this.toRequest(request));
    if (status) arr = arr.filter((r) => r.status === status);
    return arr.sort((a, b) => b.createdAt - a.createdAt);
  }

  private toRequest(row: CoSignRequestEntity): CoSignRequest {
    return {
      id: row.id,
      initiatorUserId: row.initiatorUserId,
      action_kind: row.actionKind as CoSignRequest['action_kind'],
      resource: row.resource,
      amount_cents: row.amountCents,
      required_signatures: row.requiredSignatures,
      required_surfaces: (row.requiredSurfaces ?? []) as SignSurface[],
      signatures: (row.signatures ?? []).map((signature) => ({
        surface: signature.surface as SignSurface,
        device_id: signature.device_id,
        ts: signature.ts,
        method: signature.method,
      })),
      status: row.status as CoSignRequest['status'],
      createdAt: Number(row.createdAtMs),
      expiresAt: Number(row.expiresAtMs),
      finalizedAt: row.finalizedAtMs ? Number(row.finalizedAtMs) : undefined,
    };
  }
}
