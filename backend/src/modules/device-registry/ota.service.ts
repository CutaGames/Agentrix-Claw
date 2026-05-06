import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { OtaPackage } from '../../entities/ota-package.entity';

export interface OtaManifest {
  package_id: string;
  device_class: string;
  version: string;
  channel: string;
  size_bytes: number;
  sha256: string;
  chunk_size: number;
  chunk_count: number;
  mandatory: boolean;
}

export interface OtaChunk {
  package_id: string;
  index: number;
  total: number;
  /** base64 of chunk_size bytes (last chunk may be smaller). */
  data: string;
  /** SHA-256 hex of this chunk for per-chunk verify. */
  chunk_sha256: string;
}

const DEFAULT_CHUNK_SIZE = 4096;

/**
 * OtaService — Phase 5 BE-10.3 (L1 chunked OTA).
 *
 * - publish(): registers a new firmware build (writes file to storagePath
 *   and computes sha256 + size).
 * - manifestFor(deviceClass, channel?): returns the latest version manifest.
 * - getChunk(packageId, index): returns one base64 chunk of the firmware.
 *
 * Chunk integrity is verified per-chunk so devices can recover from
 * corrupt frames without restarting the entire OTA.
 */
@Injectable()
export class OtaService {
  private readonly logger = new Logger(OtaService.name);
  private readonly chunkCache = new Map<string, Buffer>();

  constructor(
    @InjectRepository(OtaPackage)
    private readonly otaRepo: Repository<OtaPackage>,
  ) {}

  async publish(input: {
    deviceClass: string;
    version: string;
    channel?: string;
    bytes: Buffer;
    notes?: string;
    mandatory?: boolean;
    storageDir?: string;
  }): Promise<OtaPackage> {
    if (!input.deviceClass || !input.version) {
      throw new BadRequestException('deviceClass and version required');
    }
    const channel = input.channel || 'stable';
    const sha256 = crypto.createHash('sha256').update(input.bytes).digest('hex');
    const dir = input.storageDir || path.join(process.cwd(), 'tmp', 'ota');
    fs.mkdirSync(dir, { recursive: true });
    const storagePath = path.join(dir, `${input.deviceClass}-${input.version}.bin`);
    fs.writeFileSync(storagePath, input.bytes);

    const existing = await this.otaRepo.findOne({
      where: { deviceClass: input.deviceClass, version: input.version },
    });
    const row =
      existing ||
      this.otaRepo.create({
        deviceClass: input.deviceClass,
        version: input.version,
        channel,
        sizeBytes: String(input.bytes.length),
        sha256,
        storagePath,
        notes: input.notes || null,
        mandatory: !!input.mandatory,
      });
    row.channel = channel;
    row.sha256 = sha256;
    row.sizeBytes = String(input.bytes.length);
    row.storagePath = storagePath;
    row.notes = input.notes ?? row.notes;
    row.mandatory = input.mandatory ?? row.mandatory;
    return this.otaRepo.save(row);
  }

  async manifestFor(deviceClass: string, channel = 'stable', chunkSize = DEFAULT_CHUNK_SIZE): Promise<OtaManifest> {
    const row = await this.otaRepo
      .createQueryBuilder('o')
      .where('o.device_class = :dc', { dc: deviceClass })
      .andWhere('o.channel = :ch', { ch: channel })
      .orderBy('o.created_at', 'DESC')
      .getOne();
    if (!row) throw new NotFoundException('no firmware available');
    const size = Number(row.sizeBytes);
    return {
      package_id: row.id,
      device_class: row.deviceClass,
      version: row.version,
      channel: row.channel,
      size_bytes: size,
      sha256: row.sha256,
      chunk_size: chunkSize,
      chunk_count: Math.ceil(size / chunkSize),
      mandatory: row.mandatory,
    };
  }

  async getChunk(packageId: string, index: number, chunkSize = DEFAULT_CHUNK_SIZE): Promise<OtaChunk> {
    const row = await this.otaRepo.findOne({ where: { id: packageId } });
    if (!row) throw new NotFoundException('package not found');
    const size = Number(row.sizeBytes);
    const total = Math.ceil(size / chunkSize);
    if (!Number.isInteger(index) || index < 0 || index >= total) {
      throw new BadRequestException(`chunk index out of range [0, ${total})`);
    }

    let buf = this.chunkCache.get(row.storagePath);
    if (!buf) {
      buf = fs.readFileSync(row.storagePath);
      // Verify integrity once on load
      const sha = crypto.createHash('sha256').update(buf).digest('hex');
      if (sha !== row.sha256) throw new BadRequestException('package integrity check failed');
      this.chunkCache.set(row.storagePath, buf);
    }

    const start = index * chunkSize;
    const end = Math.min(size, start + chunkSize);
    const slice = buf.subarray(start, end);
    const chunk_sha256 = crypto.createHash('sha256').update(slice).digest('hex');

    return {
      package_id: row.id,
      index,
      total,
      data: slice.toString('base64'),
      chunk_sha256,
    };
  }
}
