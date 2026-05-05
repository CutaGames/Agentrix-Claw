import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DecryptCommand, EncryptCommand, KMSClient } from '@aws-sdk/client-kms';
import * as crypto from 'crypto';
import { decryptShard, encryptShard } from './mpc-shard-crypto.util';

export type MPCShardProtectionMode = 'legacy-password' | 'local-secret' | 'aws-kms';

export interface MPCShardProtectionDescriptor {
  mode: MPCShardProtectionMode;
  keyId?: string;
  region?: string;
  encryptionContext?: Record<string, string>;
}

export interface ProtectedShard {
  encryptedShard: string;
  descriptor: MPCShardProtectionDescriptor;
}

@Injectable()
export class MPCShardProtectionService {
  private readonly logger = new Logger(MPCShardProtectionService.name);
  private readonly kmsClients = new Map<string, KMSClient>();

  constructor(private readonly configService: ConfigService) {}

  async protectShard(ownerId: string, shardHex: string, legacyPassword?: string): Promise<ProtectedShard> {
    const keyId = this.getKmsKeyId();
    if (keyId) {
      const region = this.getRegion();
      const encryptionContext = this.buildEncryptionContext(ownerId);
      return {
        encryptedShard: await this.encryptWithKms(region, keyId, shardHex, encryptionContext),
        descriptor: {
          mode: 'aws-kms',
          keyId,
          region,
          encryptionContext,
        },
      };
    }

    const localSecret = this.getLocalSecret();
    if (localSecret) {
      return {
        encryptedShard: encryptShard(shardHex, this.buildLocalSecretPassword(ownerId, localSecret)),
        descriptor: { mode: 'local-secret' },
      };
    }

    if (!legacyPassword) {
      throw new BadRequestException('No shard protection backend configured');
    }

    return {
      encryptedShard: encryptShard(shardHex, legacyPassword),
      descriptor: { mode: 'legacy-password' },
    };
  }

  async unprotectShard(
    ownerId: string,
    encryptedShard: string,
    descriptor?: MPCShardProtectionDescriptor,
    legacyPassword?: string,
  ): Promise<string> {
    const mode = descriptor?.mode ?? 'legacy-password';

    if (mode === 'aws-kms') {
      const region = descriptor?.region ?? this.getRegion();
      const encryptionContext = descriptor?.encryptionContext ?? this.buildEncryptionContext(ownerId);
      return this.decryptWithKms(region, descriptor?.keyId, encryptedShard, encryptionContext);
    }

    if (mode === 'local-secret') {
      const localSecret = this.getLocalSecret();
      if (!localSecret) {
        if (legacyPassword) {
          this.logger.warn('MPC server shard secret missing, falling back to legacy shard password decryption');
          return decryptShard(encryptedShard, legacyPassword);
        }
        throw new BadRequestException('MPC server shard secret is not configured');
      }
      return decryptShard(encryptedShard, this.buildLocalSecretPassword(ownerId, localSecret));
    }

    if (!legacyPassword) {
      throw new BadRequestException('Shard password is required for legacy shard protection');
    }

    return decryptShard(encryptedShard, legacyPassword);
  }

  private async encryptWithKms(
    region: string,
    keyId: string,
    shardHex: string,
    encryptionContext: Record<string, string>,
  ): Promise<string> {
    const response = await this.getKmsClient(region).send(
      new EncryptCommand({
        KeyId: keyId,
        Plaintext: Buffer.from(shardHex, 'hex'),
        EncryptionContext: encryptionContext,
      }),
    );

    if (!response.CiphertextBlob) {
      throw new BadRequestException('AWS KMS did not return ciphertext for shard B');
    }

    return Buffer.from(response.CiphertextBlob).toString('base64');
  }

  private async decryptWithKms(
    region: string,
    keyId: string | undefined,
    encryptedShard: string,
    encryptionContext: Record<string, string>,
  ): Promise<string> {
    const response = await this.getKmsClient(region).send(
      new DecryptCommand({
        KeyId: keyId,
        CiphertextBlob: Buffer.from(encryptedShard, 'base64'),
        EncryptionContext: encryptionContext,
      }),
    );

    if (!response.Plaintext) {
      throw new BadRequestException('AWS KMS did not return plaintext for shard B');
    }

    return Buffer.from(response.Plaintext as Uint8Array).toString('hex');
  }

  private buildEncryptionContext(ownerId: string): Record<string, string> {
    return {
      agentrix_purpose: 'mpc-shard-b',
      owner_id: ownerId,
    };
  }

  private buildLocalSecretPassword(ownerId: string, localSecret: string): string {
    return crypto
      .createHash('sha256')
      .update(`${localSecret}:${ownerId}:mpc-shard-b`)
      .digest('hex');
  }

  private getLocalSecret(): string | undefined {
    return (
      this.configService.get<string>('MPC_SERVER_SHARD_SECRET') ||
      this.configService.get<string>('JWT_SECRET') ||
      this.configService.get<string>('AUTH_SECRET') ||
      this.configService.get<string>('APP_SECRET')
    );
  }

  private getKmsKeyId(): string | undefined {
    return (
      this.configService.get<string>('MPC_AWS_KMS_KEY_ID') ||
      this.configService.get<string>('AWS_KMS_MPC_KEY_ID')
    );
  }

  private getRegion(): string {
    return (
      this.configService.get<string>('MPC_AWS_KMS_REGION') ||
      this.configService.get<string>('AWS_REGION') ||
      'ap-southeast-1'
    );
  }

  private getKmsClient(region: string): KMSClient {
    const existing = this.kmsClients.get(region);
    if (existing) {
      return existing;
    }

    const created = new KMSClient({ region });
    this.kmsClients.set(region, created);
    return created;
  }
}