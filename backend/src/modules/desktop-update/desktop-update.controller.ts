import { Controller, Get, HttpCode, Param, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { DesktopUpdateService } from './desktop-update.service';

@ApiTags('Desktop Update')
@Controller('desktop/update')
export class DesktopUpdateController {
  constructor(private readonly desktopUpdateService: DesktopUpdateService) {}

  @Get(':target/:arch/:currentVersion')
  @HttpCode(200)
  @ApiOperation({ summary: 'Return Tauri updater manifest for desktop clients' })
  @ApiResponse({ status: 200, description: 'Update manifest returned' })
  @ApiResponse({ status: 204, description: 'No update available or update metadata incomplete' })
  async getUpdate(
    @Param('target') target: string,
    @Param('arch') arch: string,
    @Param('currentVersion') currentVersion: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const manifest = this.desktopUpdateService.getUpdateManifest(target, arch, currentVersion);
    if (!manifest) {
      response.status(204);
      return undefined;
    }
    return manifest;
  }
}