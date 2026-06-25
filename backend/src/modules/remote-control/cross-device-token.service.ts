/**
 * CrossDeviceTokenService — issues + verifies short-lived JWT tokens used
 * to authorize a single remote-control invocation from mobile to another
 * device of the same user.
 *
 * P-9 wave 10 simplification:
 *   - Phase 1 backend signs the JWT with `JWT_SECRET` keyed by userId
 *     instead of the user's MPC share-1 (which would require client-side
 *     key derivation infra).
 *   - Mobile requests a token via /v1/cross-device/token, includes it
 *     in the `remote-control:execute` socket payload, and the gateway
 *     verifies before forwarding.
 *   - 30s expiry per spec R8.5.
 */
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export interface CrossDeviceTokenClaims {
  /** User the token is scoped to (sub). */
  userId: string;
  /** Target device id this token authorizes. */
  targetDeviceId: string;
  /** Random nonce to prevent replay if same-device. */
  nonce: string;
  /** Originator-supplied requestId so the ack channel correlates. */
  requestId: string;
  /** Command to be executed; rebound to whitelist server-side. */
  command: string;
}

@Injectable()
export class CrossDeviceTokenService {
  constructor(private readonly jwt: JwtService) {}

  /** Mint a 30s scoped JWT bound to (userId, targetDeviceId, command). */
  async mint(claims: Omit<CrossDeviceTokenClaims, 'nonce'>): Promise<{ token: string; expiresAt: number }> {
    const nonce = `${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 10)}`;
    const exp = Math.floor((Date.now() + 30_000) / 1000);
    const token = await this.jwt.signAsync(
      { ...claims, nonce, exp },
      { algorithm: 'HS256' },
    );
    return { token, expiresAt: exp * 1000 };
  }

  /** Verify a token and return its claims; throws on invalid / expired. */
  async verify(token: string): Promise<CrossDeviceTokenClaims> {
    const decoded = await this.jwt.verifyAsync<CrossDeviceTokenClaims & { exp: number }>(token);
    return decoded;
  }
}
