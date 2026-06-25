import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { DesktopReleaseEntity } from '../../entities/desktop-release.entity';

export interface DesktopUpdateManifest {
  version: string;
  notes: string;
  pub_date: string;
  platforms: Record<string, { signature: string; url: string }>;
}

/**
 * Resolves Tauri updater manifests with DB-first lookup, env-fallback.
 *
 * Lookup order:
 *   1. `agentrix_desktop.releases` table (preferred — supports gradual rollout)
 *   2. Environment variables (legacy / single-stable channel)
 *
 * @see .kiro/specs/desktop-go-live/design.md §3.2
 */
@Injectable()
export class DesktopUpdateService {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(DesktopReleaseEntity)
    private readonly releasesRepo: Repository<DesktopReleaseEntity>,
  ) {}

  async getUpdateManifest(
    target: string,
    arch: string,
    currentVersion: string,
    options: { channel?: string; deviceFingerprint?: string } = {},
  ): Promise<DesktopUpdateManifest | null> {
    const channel = options.channel || 'stable';
    const platformKey = this.toPlatformKey(target, arch);

    // 1. DB-first lookup (Sprint G-2 / US-G2-2)
    const dbManifest = await this.findFromDb(target, arch, currentVersion, channel, platformKey, options.deviceFingerprint);
    if (dbManifest) return dbManifest;

    // 2. Env fallback (legacy)
    return this.findFromEnv(target, arch, currentVersion, platformKey);
  }

  private async findFromDb(
    target: string,
    arch: string,
    currentVersion: string,
    channel: string,
    platformKey: string,
    fingerprint?: string,
  ): Promise<DesktopUpdateManifest | null> {
    // Try both raw target/arch and the normalized key — release rows might
    // have been inserted with either form.
    const normalizedTarget = platformKey.split('-')[0];
    const normalizedArch = platformKey.split('-')[1];

    const candidates = await this.releasesRepo.find({
      where: [
        { target: normalizedTarget, arch: normalizedArch, channel, isActive: true },
        { target, arch, channel, isActive: true },
      ],
      order: { pubDate: 'DESC' },
      take: 5,
    });

    for (const release of candidates) {
      if (!this.isVersionNewer(release.version, currentVersion)) continue;
      // Gradual rollout
      if (release.rolloutPercent < 100) {
        const bucket = this.deterministicBucket(fingerprint || '', target, arch);
        if (bucket >= release.rolloutPercent) continue;
      }
      return {
        version: release.version,
        notes: release.notesMd || `Agentrix Desktop ${release.version}`,
        pub_date: release.pubDate.toISOString(),
        platforms: {
          [platformKey]: {
            signature: release.signature,
            url: release.url,
          },
        },
      };
    }
    return null;
  }

  private findFromEnv(
    target: string,
    arch: string,
    currentVersion: string,
    platformKey: string,
  ): DesktopUpdateManifest | null {
    const version = this.configService.get<string>('DESKTOP_UPDATE_VERSION')?.trim();
    const baseUrl = this.configService.get<string>('DESKTOP_UPDATE_BASE_URL')?.trim()?.replace(/\/$/, '');
    const signature = this.configService
      .get<string>(`DESKTOP_UPDATE_SIGNATURE_${platformKey.toUpperCase().replace(/[-]/g, '_')}`)
      ?.trim();
    const assetName = this.configService
      .get<string>(`DESKTOP_UPDATE_ASSET_${platformKey.toUpperCase().replace(/[-]/g, '_')}`)
      ?.trim() || this.defaultAssetName(target, arch, version || '');

    if (!version || !baseUrl || !signature || !assetName) return null;
    if (!this.isVersionNewer(version, currentVersion)) return null;

    return {
      version,
      notes: this.configService.get<string>('DESKTOP_UPDATE_NOTES') || `Agentrix Desktop ${version}`,
      pub_date: this.configService.get<string>('DESKTOP_UPDATE_PUB_DATE') || new Date().toISOString(),
      platforms: {
        [platformKey]: {
          signature,
          url: `${baseUrl}/${assetName}`,
        },
      },
    };
  }

  private toPlatformKey(target: string, arch: string): string {
    const t = target.toLowerCase();
    const a = arch.toLowerCase();
    const normalizedTarget = t.includes('windows') ? 'windows'
      : t.includes('darwin') ? 'darwin'
      : t.includes('linux') ? 'linux'
      : t;
    const normalizedArch = a.includes('x86_64') || a.includes('amd64') || a === 'x64' ? 'x86_64'
      : a.includes('aarch64') || a.includes('arm64') ? 'aarch64'
      : a;
    return `${normalizedTarget}-${normalizedArch}`;
  }

  private defaultAssetName(target: string, arch: string, version: string): string {
    const key = this.toPlatformKey(target, arch);
    if (key === 'windows-x86_64') return `Agentrix Desktop_${version}_x64-setup.exe`;
    if (key === 'darwin-aarch64') return `Agentrix Desktop_${version}_aarch64.dmg`;
    if (key === 'darwin-x86_64') return `Agentrix Desktop_${version}_x64.dmg`;
    if (key === 'linux-x86_64') return `agentrix-desktop_${version}_amd64.AppImage`;
    return `agentrix-desktop-${version}-${key}`;
  }

  private isVersionNewer(candidate: string, current: string): boolean {
    const left = this.parseVersion(candidate);
    const right = this.parseVersion(current);
    for (let index = 0; index < Math.max(left.length, right.length); index++) {
      const a = left[index] || 0;
      const b = right[index] || 0;
      if (a > b) return true;
      if (a < b) return false;
    }
    return false;
  }

  private parseVersion(version: string): number[] {
    return version
      .replace(/^desktop-v/i, '')
      .replace(/^v/i, '')
      .split(/[.-]/)
      .map(part => Number.parseInt(part, 10))
      .filter(part => Number.isFinite(part));
  }

  private deterministicBucket(fingerprint: string, target: string, arch: string): number {
    const salt = `${target}:${arch}`;
    const h = crypto.createHash('sha256').update(`${salt}:${fingerprint}`).digest();
    return h.readUInt32BE(0) % 100;
  }
}
