import { Controller, Get, Headers, HttpCode, Param, Query, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { DesktopUpdateService } from './desktop-update.service';

@ApiTags('Desktop Update')
@Controller('desktop/update')
export class DesktopUpdateController {
  constructor(private readonly desktopUpdateService: DesktopUpdateService) {}

  @Get(':target/:arch/:currentVersion')
  @HttpCode(200)
  @ApiOperation({ summary: 'Return Tauri updater manifest for desktop clients' })
  @ApiQuery({ name: 'channel', required: false, description: 'stable | beta | dev' })
  @ApiResponse({ status: 200, description: 'Update manifest returned' })
  @ApiResponse({ status: 204, description: 'No update available or update metadata incomplete' })
  async getUpdate(
    @Param('target') target: string,
    @Param('arch') arch: string,
    @Param('currentVersion') currentVersion: string,
    @Query('channel') channel: string | undefined,
    @Headers('user-agent') userAgent: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const fingerprint = `${userAgent || ''}|${request.ip || ''}`;
    const manifest = await this.desktopUpdateService.getUpdateManifest(target, arch, currentVersion, {
      channel,
      deviceFingerprint: fingerprint,
    });
    if (!manifest) {
      response.status(204);
      return undefined;
    }
    return manifest;
  }
}
