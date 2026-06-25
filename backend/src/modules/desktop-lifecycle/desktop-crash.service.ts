import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { DesktopCrashRecordEntity } from '../../entities/desktop-crash-record.entity';

export interface IncomingCrash {
  deviceId: string;            // raw, not yet hashed
  userId?: string | null;
  appVersion: string;
  type: string;                // 'rust_panic' | 'js_error' | 'unhandled_rejection' | 'react_error'
  message: string;
  stack?: string | null;
  location?: string | null;
  osPlatform?: string | null;
  osVersion?: string | null;
  arch?: string | null;
  occurredAt: number;          // unix ms
}

const DEDUPE_WINDOW_MS = 10 * 60 * 1000;

@Injectable()
export class DesktopCrashService {
  constructor(
    @InjectRepository(DesktopCrashRecordEntity)
    private readonly crashRepo: Repository<DesktopCrashRecordEntity>,
  ) {}

  /**
   * Record a single crash. Within a 10-minute window the same fingerprint
   * from the same device is deduped — the existing row's `count` is bumped.
   */
  async record(incoming: IncomingCrash): Promise<{ ok: true; deduped: boolean; id: string }> {
    const deviceIdHash = sha256(incoming.deviceId);
    const fingerprint = computeFingerprint(incoming.type, incoming.message);

    const since = new Date(Date.now() - DEDUPE_WINDOW_MS);
    const existing = await this.crashRepo.findOne({
      where: {
        deviceIdHash,
        fingerprint,
        reportedAt: MoreThan(since),
      },
      order: { reportedAt: 'DESC' },
    });

    if (existing) {
      existing.count += 1;
      await this.crashRepo.save(existing);
      return { ok: true, deduped: true, id: existing.id };
    }

    const sanitizedMessage = sanitizePath(incoming.message);
    const sanitizedStack = incoming.stack ? sanitizePath(incoming.stack) : null;
    const sanitizedLocation = incoming.location ? sanitizePath(incoming.location) : null;

    const saved = await this.crashRepo.save(
      this.crashRepo.create({
        deviceIdHash,
        userId: incoming.userId || null,
        appVersion: incoming.appVersion,
        fingerprint,
        type: incoming.type,
        message: truncate(sanitizedMessage, 4000),
        stack: sanitizedStack ? truncate(sanitizedStack, 8000) : null,
        location: sanitizedLocation ? truncate(sanitizedLocation, 255) : null,
        osPlatform: incoming.osPlatform || null,
        osVersion: incoming.osVersion || null,
        arch: incoming.arch || null,
        occurredAt: new Date(incoming.occurredAt),
      }),
    );
    return { ok: true, deduped: false, id: saved.id };
  }
}

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function computeFingerprint(type: string, message: string): string {
  const head = (message || '').slice(0, 100);
  return crypto.createHash('sha256').update(`${type}:${head}`).digest('hex').slice(0, 32);
}

/**
 * Replace user-identifying file paths with `<user>` so the crash text never
 * carries someone's local path / username. Covers Win, Mac, Linux.
 */
export function sanitizePath(text: string): string {
  if (!text) return text;
  return text
    .replace(/[A-Z]:\\Users\\[^\\\/\s'"]+/gi, 'C:\\Users\\<user>')
    .replace(/\/Users\/[^/\s'"]+/g, '/Users/<user>')
    .replace(/\/home\/[^/\s'"]+/g, '/home/<user>');
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…[truncated]`;
}
