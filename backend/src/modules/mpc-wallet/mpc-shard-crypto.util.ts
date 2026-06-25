import { BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';

const SHARD_CIPHER_SALT = 'salt';

export function encryptShard(shard: string, password: string): string {
  const algorithm = 'aes-256-gcm';
  const key = crypto.scryptSync(password, SHARD_CIPHER_SALT, 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);

  let encrypted = cipher.update(shard, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decryptShard(encryptedShard: string, password: string): string {
  const algorithm = 'aes-256-gcm';
  const parts = encryptedShard.split(':');
  if (parts.length !== 3) {
    throw new BadRequestException('Invalid encrypted shard format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];

  const key = crypto.scryptSync(password, SHARD_CIPHER_SALT, 32);
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}