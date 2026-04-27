import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface DesktopUpdateManifest {
  version: string;
  notes: string;
  pub_date: string;
  platforms: Record<string, { signature: string; url: string }>;
}

@Injectable()
export class DesktopUpdateService {
  constructor(private readonly configService: ConfigService) {}

  getUpdateManifest(target: string, arch: string, currentVersion: string): DesktopUpdateManifest | null {
    const version = this.configService.get<string>('DESKTOP_UPDATE_VERSION')?.trim();
    const baseUrl = this.configService.get<string>('DESKTOP_UPDATE_BASE_URL')?.trim()?.replace(/\/$/, '');
    const platformKey = this.toPlatformKey(target, arch);
    const signature = this.configService.get<string>(`DESKTOP_UPDATE_SIGNATURE_${platformKey.toUpperCase().replace(/[-]/g, '_')}`)?.trim();
    const assetName = this.configService.get<string>(`DESKTOP_UPDATE_ASSET_${platformKey.toUpperCase().replace(/[-]/g, '_')}`)?.trim()
      || this.defaultAssetName(target, arch, version || '');

    if (!version || !baseUrl || !signature || !assetName) {
      return null;
    }

    if (!this.isVersionNewer(version, currentVersion)) {
      return null;
    }

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
    const normalizedTarget = target.toLowerCase().includes('windows') ? 'windows'
      : target.toLowerCase().includes('darwin') ? 'darwin'
      : target.toLowerCase().includes('linux') ? 'linux'
      : target.toLowerCase();
    const normalizedArch = arch.toLowerCase().includes('x86_64') || arch.toLowerCase().includes('amd64') ? 'x86_64'
      : arch.toLowerCase().includes('aarch64') || arch.toLowerCase().includes('arm64') ? 'aarch64'
      : arch.toLowerCase();
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
}