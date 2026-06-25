/**
 * TrustGateService — Marketplace-purchase Trust gating + signed-confirmation
 * verification for the Economy_Bridge (design §6, R7.4 / R7.6 / R15.4).
 *
 * 不可协商安全不变量：经济动作的授权判定在服务端、沙箱不可达处完成。沙箱永远只能
 * **请求**经济动作 (`economy.requestCharge`)，并附带一个由 Trust_Level 3 确认流程
 * (生物识别 / co-sign) 签发的 `signedConfirmation` 令牌；本服务校验该令牌的
 * 完整性与绑定关系，解析其声明的 Trust 等级，并要求 Trust_Level ≥ 3。任何失败都
 * 返回结构化 {@link WorldCreationError} 且 **绝不**触碰账户余额 (R7.6)。
 *
 * 复用 v5 设施：
 *  - HMAC-SHA256 签名/校验模式沿用 `webhook.service.ts`
 *    (crypto.createHmac + crypto.timingSafeEqual，常量时间比较防时序攻击)。
 *  - Trust_Level 3 = Marketplace 购买门控，沿用 v5 Trust 模型常量
 *    {@link TRUST_LEVEL_PURCHASE}（approval.service.ts 的 0–3 Trust 语义，
 *    co-sign / privacy-fence 的 L3 签名流程是该令牌的签发方）。
 *
 * 令牌结构（紧凑、自包含、可被签发方与服务端独立校验）：
 *   `${base64url(payloadJson)}.${hmacHexOf(payloadJson)}`
 * payload = { userId, plotId, amountRef, trustLevel, exp }
 * 服务端用共享密钥重算 HMAC，沙箱无密钥 → 无法伪造。令牌绑定到
 * (userId, plotId, amountRef) 三元组，防止跨请求重放。
 *
 * 纯校验、无副作用 → 可被 task 7.4 安全回归测试直接驱动
 * (Trust 不足 / 签名缺失 / 签名无效 → 拒绝且余额不变)。
 *
 * @see .kiro/specs/ai-world-creation-platform/design.md — §6 Economy_Bridge
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

import type { WorldCreationError } from '../../../../shared/types/world-creation';
import { TRUST_LEVEL_PURCHASE } from '../../../../shared/types/world-creation';

/** Decoded payload of a Trust-3 signed confirmation token. */
export interface TrustConfirmationPayload {
  /** Authenticated user the confirmation was issued to (must equal the payer). */
  userId: string;
  /** Plot the charge originates from (binds the token to one charge context). */
  plotId: string;
  /** Sandbox cart/item reference the confirmation authorizes. */
  amountRef: string;
  /** Trust level asserted by the issuing confirmation flow (must be ≥ 3). */
  trustLevel: number;
  /** Token expiry as a unix epoch in milliseconds. */
  exp: number;
}

/** Input to the Marketplace-purchase Trust gate. */
export interface PurchaseGateInput {
  /** Authenticated payer user id (never trusted from the sandbox). */
  userId: string;
  plotId: string;
  amountRef: string;
  /** Trust-gated signed confirmation token supplied by the request (R7.4). */
  signedConfirmation?: string;
}

@Injectable()
export class TrustGateService {
  private readonly logger = new Logger(TrustGateService.name);

  /** Shared HMAC secret for confirmation tokens (reuse v5 config pattern). */
  private readonly secret: string;

  constructor(config: ConfigService) {
    this.secret =
      config.get<string>('WORLD_CREATION_TRUST_SECRET') ??
      config.get<string>('JWT_SECRET') ??
      'world-creation-trust-dev-secret';
  }

  // ============================================================
  // Purchase gate (R7.4 / R7.6 / R15.4)
  // ============================================================

  /**
   * Evaluate the Marketplace-purchase Trust gate for a charge.
   *
   * Requires a valid Trust_Level 3 signed confirmation bound to this exact
   * charge context. Returns a structured error on any failure (missing /
   * forged / mismatched / expired confirmation, or insufficient Trust level)
   * and `null` when the gate passes. This is a pure read-only check — it never
   * alters any account balance (R7.6).
   */
  checkPurchaseGate(input: PurchaseGateInput): WorldCreationError | null {
    // 1. signedConfirmation 缺失 → 拒绝 (R7.4).
    if (!input.signedConfirmation) {
      return {
        error: 'ECONOMY_REJECTED',
        detail: 'Marketplace purchase requires a Trust_Level 3 signed confirmation',
      };
    }

    // 2. signedConfirmation 无效（伪造 / 篡改）→ 拒绝 (R7.6).
    const payload = this.verifyToken(input.signedConfirmation);
    if (!payload) {
      this.logger.warn(
        `Trust gate: signed confirmation failed verification for user ${input.userId} on plot ${input.plotId}`,
      );
      return {
        error: 'ECONOMY_REJECTED',
        detail: 'Signed confirmation failed verification',
      };
    }

    // 3. 令牌绑定校验：必须匹配本次 charge 的 (userId, plotId, amountRef)，防重放。
    if (
      payload.userId !== input.userId ||
      payload.plotId !== input.plotId ||
      payload.amountRef !== input.amountRef
    ) {
      return {
        error: 'ECONOMY_REJECTED',
        detail: 'Signed confirmation does not match the charge context',
      };
    }

    // 4. 过期校验。
    if (typeof payload.exp === 'number' && payload.exp < Date.now()) {
      return {
        error: 'ECONOMY_REJECTED',
        detail: 'Signed confirmation has expired',
      };
    }

    // 5. 解析 Trust 等级 < 3 → 拒绝 (R7.4).
    const trustLevel = this.resolveTrustLevel(payload);
    if (trustLevel < TRUST_LEVEL_PURCHASE) {
      return {
        error: 'ECONOMY_REJECTED',
        detail: `Trust_Level ${TRUST_LEVEL_PURCHASE} required for purchase (resolved level ${trustLevel})`,
      };
    }

    return null;
  }

  /**
   * Resolve the authoritative Trust level from a verified confirmation payload.
   *
   * Pluggable seam: the canonical Trust_Level 0–3 is asserted by the v5 Trust-3
   * confirmation flow (approval / co-sign) and carried in the verified token. A
   * future persisted user-trust source can override this method without
   * touching the gate logic. An unparseable level collapses to 0 (deny).
   */
  resolveTrustLevel(payload: TrustConfirmationPayload): number {
    return Number.isFinite(payload.trustLevel) ? payload.trustLevel : 0;
  }

  // ============================================================
  // Token signing / verification (HMAC-SHA256, reuse v5 pattern)
  // ============================================================

  /**
   * Mint a signed confirmation token. Used by the Trust-3 confirmation flow
   * (biometric / co-sign) once a user has authorized a specific charge, and by
   * tests. The sandbox cannot call this — it has no access to the secret.
   */
  signConfirmation(payload: TrustConfirmationPayload): string {
    const json = JSON.stringify(payload);
    const body = Buffer.from(json, 'utf8').toString('base64url');
    return `${body}.${this.hmac(json)}`;
  }

  /** Verify a token's HMAC + decode its payload; returns null when invalid. */
  private verifyToken(token: string): TrustConfirmationPayload | null {
    const dot = token.indexOf('.');
    if (dot <= 0 || dot === token.length - 1) return null;

    const body = token.slice(0, dot);
    const signature = token.slice(dot + 1);

    let json: string;
    try {
      json = Buffer.from(body, 'base64url').toString('utf8');
    } catch {
      return null;
    }

    const expected = this.hmac(json);
    let match = false;
    try {
      match = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      // Length mismatch (and any other compare error) ⇒ invalid signature.
      return null;
    }
    if (!match) return null;

    try {
      const payload = JSON.parse(json) as TrustConfirmationPayload;
      if (
        typeof payload?.userId !== 'string' ||
        typeof payload?.plotId !== 'string' ||
        typeof payload?.amountRef !== 'string' ||
        typeof payload?.trustLevel !== 'number'
      ) {
        return null;
      }
      return payload;
    } catch {
      return null;
    }
  }

  /** HMAC-SHA256 over the canonical payload (hex). */
  private hmac(payloadJson: string): string {
    return crypto.createHmac('sha256', this.secret).update(payloadJson).digest('hex');
  }
}
