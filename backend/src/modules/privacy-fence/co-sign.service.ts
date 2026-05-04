import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

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
  private requests = new Map<string, CoSignRequest>();

  private genId() {
    return `cosign_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  create(userId: string, body: {
    action_kind: CoSignRequest['action_kind'];
    resource: string;
    amount_cents: number;
    required_signatures?: number;
    required_surfaces?: SignSurface[];
    ttl_ms?: number;
  }): CoSignRequest {
    if (!body?.resource) throw new BadRequestException('resource required');
    if (!body.amount_cents || body.amount_cents <= 0) throw new BadRequestException('amount_cents required');
    const surfaces = body.required_surfaces || ['mobile', 'watch'];
    const required = body.required_signatures ?? Math.min(2, surfaces.length);
    if (required > surfaces.length) throw new BadRequestException('required_signatures > required_surfaces');

    const r: CoSignRequest = {
      id: this.genId(),
      initiatorUserId: userId,
      action_kind: body.action_kind,
      resource: body.resource,
      amount_cents: body.amount_cents,
      required_signatures: required,
      required_surfaces: surfaces,
      signatures: [],
      status: 'pending',
      createdAt: Date.now(),
      expiresAt: Date.now() + (body.ttl_ms || 5 * 60 * 1000),
    };
    this.requests.set(r.id, r);
    return r;
  }

  sign(userId: string, id: string, body: { surface: SignSurface; device_id?: string; method?: string }): CoSignRequest {
    const r = this.requests.get(id);
    if (!r) throw new NotFoundException('co-sign request not found');
    if (r.initiatorUserId !== userId) throw new BadRequestException('only initiator can sign');
    if (r.status !== 'pending') throw new BadRequestException(`request is ${r.status}`);
    if (Date.now() > r.expiresAt) {
      r.status = 'expired';
      throw new BadRequestException('expired');
    }
    if (!r.required_surfaces.includes(body.surface)) {
      throw new BadRequestException(`surface ${body.surface} not in required_surfaces`);
    }
    if (r.signatures.some((s) => s.surface === body.surface)) {
      throw new BadRequestException(`surface ${body.surface} already signed`);
    }
    r.signatures.push({
      surface: body.surface,
      device_id: body.device_id,
      method: body.method,
      ts: Date.now(),
    });
    if (r.signatures.length >= r.required_signatures) {
      r.status = 'approved';
      r.finalizedAt = Date.now();
    }
    return r;
  }

  reject(userId: string, id: string): CoSignRequest {
    const r = this.requests.get(id);
    if (!r) throw new NotFoundException('not found');
    if (r.initiatorUserId !== userId) throw new BadRequestException('only initiator can reject');
    r.status = 'rejected';
    r.finalizedAt = Date.now();
    return r;
  }

  get(id: string): CoSignRequest {
    const r = this.requests.get(id);
    if (!r) throw new NotFoundException('not found');
    return r;
  }

  list(userId: string, status?: CoSignRequest['status']): CoSignRequest[] {
    let arr = Array.from(this.requests.values()).filter((r) => r.initiatorUserId === userId);
    if (status) arr = arr.filter((r) => r.status === status);
    return arr.sort((a, b) => b.createdAt - a.createdAt);
  }
}
