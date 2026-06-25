import { Injectable } from '@nestjs/common';
import { IPlatformAdapter } from './platform-adapter.interface';
import { PlatformRegistryService } from '../services/platform-registry.service';

/**
 * AdapterFactory 已废弃，请使用 PlatformRegistryService
 * 保留此文件以保持向后兼容
 */
@Injectable()
export class AdapterFactory {
  constructor(private platformRegistry: PlatformRegistryService) {}

  getAdapter(platform: string): IPlatformAdapter {
    return this.platformRegistry.getAdapter(platform);
  }

  getAllAdapters(): IPlatformAdapter[] {
    return this.platformRegistry.getAllAdapters();
  }
}


