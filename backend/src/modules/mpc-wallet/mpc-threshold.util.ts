import { BadRequestException } from '@nestjs/common';
import * as shamirsSecretSharing from 'shamirs-secret-sharing';

export function splitSecret(secretHex: string, totalShares: number, threshold: number): string[] {
  if (threshold > totalShares) {
    throw new BadRequestException('threshold cannot exceed totalShares');
  }

  return shamirsSecretSharing
    .split(Buffer.from(secretHex, 'hex'), { shares: totalShares, threshold })
    .map((share) => Buffer.from(share).toString('hex'));
}

export function combineShares(shares: string[]): string {
  const normalized = shares.filter((share): share is string => Boolean(share));
  if (normalized.length < 2) {
    throw new BadRequestException('Need at least 2 shares to recover');
  }

  return Buffer.from(
    shamirsSecretSharing.combine(normalized.map((share) => Buffer.from(share, 'hex'))),
  ).toString('hex');
}