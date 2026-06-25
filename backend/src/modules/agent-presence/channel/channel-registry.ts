import { Injectable, Logger } from '@nestjs/common';
import { ChannelAdapter, HealthStatus } from './channel-adapter.interface';

/**
 * Central registry for all ChannelAdapter implementations.
 * New adapters register themselves here on module init.
 */
@Injectable()
export class ChannelRegistry {
  private readonly logger = new Logger(ChannelRegistry.name);
  private readonly adapters = new Map<string, ChannelAdapter>();

  register(adapter: ChannelAdapter): void {
    this.adapters.set(adapter.platform, adapter);
    this.logger.log(`Channel adapter registered: ${adapter.platform}`);
  }

  get(platform: string): ChannelAdapter | undefined {
    return this.adapters.get(platform);
  }

  getAll(): ChannelAdapter[] {
    return Array.from(this.adapters.values());
  }

  has(platform: string): boolean {
    return this.adapters.has(platform);
  }

  async healthCheckAll(): Promise<Record<string, HealthStatus>> {
    const results: Record<string, HealthStatus> = {};
    for (const [platform, adapter] of this.adapters) {
      try {
        results[platform] = await adapter.healthCheck();
      } catch (err: any) {
        results[platform] = { connected: false, details: { error: err.message } };
      }
    }
    return results;
  }
}
