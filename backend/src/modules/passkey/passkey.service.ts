import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes, createHash } from 'crypto';
import { PasskeyCredential } from '../../entities/passkey-credential.entity';

/**
 * In-memory challenge cache. For production this should move to Redis with
 * TTL; for v1 we keep a per-process Map with explicit expiry.
 */
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

interface PendingChallenge {
  userId: string;
  challenge: string;
  kind: 'register' | 'authenticate';
  expiresAt: number;
}

/**
 * PasskeyService — Phase 4 W8 / WB-T4.1 / WB-T4.2.
 *
 * v1 implementation (no @simplewebauthn/server dep):
 *   - Issues random 32-byte challenges (base64url)
 *   - Stores credentialId + publicKey on register
 *   - On authenticate, verifies (a) credentialId ownership, (b) clientDataJSON
 *     contains the issued challenge, (c) sign-count monotonically increases.
 *
 * P1 follow-up: add full FIDO2 attestation chain validation via
 * @simplewebauthn/server (COSE-key parse + signature verify).
 */
@Injectable()
export class PasskeyService {
  private readonly logger = new Logger(PasskeyService.name);
  private readonly challenges = new Map<string, PendingChallenge>();

  constructor(
    @InjectRepository(PasskeyCredential)
    private readonly repo: Repository<PasskeyCredential>,
  ) {}

  // ---------- Registration ----------

  startRegistration(userId: string): { challenge: string; rpId: string; rpName: string } {
    const challenge = b64url(randomBytes(32));
    this.putChallenge(userId, challenge, 'register');
    return { challenge, rpId: 'agentrix.top', rpName: 'Agentrix' };
  }

  async finishRegistration(
    userId: string,
    body: {
      credential_id: string;
      public_key: string;
      client_data_json: string; // base64url
      label?: string;
      transports?: string;
    },
  ): Promise<PasskeyCredential> {
    if (!body?.credential_id || !body?.public_key || !body?.client_data_json) {
      throw new BadRequestException('credential_id, public_key, client_data_json are required');
    }
    this.assertChallengeMatches(userId, body.client_data_json, 'register');

    // Reject duplicates.
    const existing = await this.repo.findOne({ where: { credentialId: body.credential_id } });
    if (existing) {
      throw new BadRequestException('credential already registered');
    }

    const cred = this.repo.create({
      userId,
      credentialId: body.credential_id,
      publicKey: body.public_key,
      signCount: '0',
      label: body.label ?? null,
      transports: body.transports ?? null,
    });
    const saved = await this.repo.save(cred);
    this.logger.log(`Passkey registered user=${userId} cred=${shortId(body.credential_id)}`);
    return saved;
  }

  // ---------- Authentication (used for L3 co-sign) ----------

  async startAuthentication(userId: string): Promise<{ challenge: string; allow_credentials: string[] }> {
    const credentials = await this.repo.find({ where: { userId } });
    if (credentials.length === 0) {
      throw new NotFoundException('no passkey registered for user');
    }
    const challenge = b64url(randomBytes(32));
    this.putChallenge(userId, challenge, 'authenticate');
    return {
      challenge,
      allow_credentials: credentials.map((c) => c.credentialId),
    };
  }

  async finishAuthentication(
    userId: string,
    body: {
      credential_id: string;
      client_data_json: string;
      authenticator_data: string; // unused in v1 but kept for forward compat
      signature: string; // unused in v1 but kept for forward compat
      sign_count?: number;
    },
  ): Promise<{ ok: true; cred_id: string; assertion_token: string }> {
    if (!body?.credential_id || !body?.client_data_json) {
      throw new BadRequestException('credential_id + client_data_json required');
    }
    this.assertChallengeMatches(userId, body.client_data_json, 'authenticate');

    const cred = await this.repo.findOne({ where: { credentialId: body.credential_id } });
    if (!cred) throw new NotFoundException('credential not found');
    if (cred.userId !== userId) throw new UnauthorizedException('credential does not belong to user');

    const newCount = body.sign_count ?? Number(cred.signCount) + 1;
    if (newCount <= Number(cred.signCount)) {
      // FIDO2 §6.1 — possible cloned authenticator; reject.
      throw new UnauthorizedException('sign_count regression — possible cloned authenticator');
    }
    cred.signCount = String(newCount);
    await this.repo.save(cred);

    // Issue a short-lived assertion token that downstream services (e.g.
    // ApprovalService L3) can attach to a co-sign call.
    const assertionToken =
      'pk:' + b64url(createHash('sha256').update(`${cred.id}:${newCount}:${Date.now()}`).digest());
    this.logger.log(`Passkey authenticated user=${userId} cred=${shortId(cred.credentialId)}`);
    return { ok: true, cred_id: cred.id, assertion_token: assertionToken };
  }

  async listForUser(userId: string): Promise<PasskeyCredential[]> {
    return this.repo.find({ where: { userId }, order: { createdAt: 'ASC' } });
  }

  async deleteOwn(userId: string, credId: string): Promise<void> {
    const cred = await this.repo.findOne({ where: { id: credId } });
    if (!cred) throw new NotFoundException('credential not found');
    if (cred.userId !== userId) throw new UnauthorizedException('not owner');
    await this.repo.delete({ id: credId });
  }

  // ---------- helpers ----------

  private putChallenge(userId: string, challenge: string, kind: 'register' | 'authenticate'): void {
    this.challenges.set(this.key(userId, kind), {
      userId,
      challenge,
      kind,
      expiresAt: Date.now() + CHALLENGE_TTL_MS,
    });
  }

  private assertChallengeMatches(
    userId: string,
    clientDataJsonB64: string,
    kind: 'register' | 'authenticate',
  ): void {
    const k = this.key(userId, kind);
    const pending = this.challenges.get(k);
    if (!pending) throw new BadRequestException('no pending challenge — call start endpoint first');
    if (Date.now() > pending.expiresAt) {
      this.challenges.delete(k);
      throw new BadRequestException('challenge expired');
    }
    let clientData: { type?: string; challenge?: string; origin?: string };
    try {
      const decoded = Buffer.from(clientDataJsonB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
      clientData = JSON.parse(decoded);
    } catch {
      throw new BadRequestException('client_data_json is not valid base64url(JSON)');
    }
    if (clientData.challenge !== pending.challenge) {
      throw new UnauthorizedException('challenge mismatch');
    }
    const expectedType = kind === 'register' ? 'webauthn.create' : 'webauthn.get';
    if (clientData.type !== expectedType) {
      throw new BadRequestException(`type must be ${expectedType}`);
    }
    // One-time use
    this.challenges.delete(k);
  }

  private key(userId: string, kind: string): string {
    return `${userId}:${kind}`;
  }
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function shortId(s: string): string {
  return s.length > 12 ? `${s.slice(0, 8)}...${s.slice(-4)}` : s;
}
