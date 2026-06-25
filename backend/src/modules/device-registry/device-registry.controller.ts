import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DeviceRegistryService } from './device-registry.service';
import { OtaService } from './ota.service';

/**
 * REST surface for ClawCore device registry + OTA (Phase 5 BE-10.2 / 10.3).
 *
 * Endpoints:
 *   POST   /v1/devices/pair/ticket      → mint a one-shot pairing ticket
 *   POST   /v1/devices/pair             → consume ticket + register device
 *   GET    /v1/devices                  → list current user's devices
 *   DELETE /v1/devices/:deviceId        → revoke device
 *   GET    /v1/ota/manifest             → ?device_class=xx&channel=stable
 *   GET    /v1/ota/:packageId/chunk/:i  → fetch a single chunk
 */
@UseGuards(JwtAuthGuard)
@Controller('v1')
export class DeviceRegistryController {
  constructor(
    private readonly devices: DeviceRegistryService,
    private readonly ota: OtaService,
  ) {}

  private uid(req: any): string {
    return req.user?.userId || req.user?.sub || req.user?.id;
  }

  @Post('devices/pair/ticket')
  issueTicket(@Req() req: any) {
    const t = this.devices.issueTicket(this.uid(req));
    return { ticket: t.ticket, expires_at: t.expiresAt };
  }

  @Post('devices/pair')
  async pair(
    @Body()
    body: {
      ticket: string;
      device_id: string;
      device_class?: string;
      vendor?: string;
      firmware_version?: string;
      label?: string;
    },
  ) {
    const r = await this.devices.pair({
      ticket: body.ticket,
      deviceId: body.device_id,
      deviceClass: body.device_class,
      vendor: body.vendor,
      firmwareVersion: body.firmware_version,
      label: body.label,
    });
    return {
      device: this.toDto(r.device),
      dst: r.dst, // returned exactly once
    };
  }

  @Get('devices')
  async list(@Req() req: any) {
    const items = await this.devices.list(this.uid(req));
    return { items: items.map((d) => this.toDto(d)) };
  }

  @Delete('devices/:deviceId')
  async revoke(@Req() req: any, @Param('deviceId') deviceId: string) {
    await this.devices.revoke(this.uid(req), deviceId);
    return { ok: true };
  }

  @Get('ota/manifest')
  manifest(@Query('device_class') deviceClass: string, @Query('channel') channel?: string) {
    return this.ota.manifestFor(deviceClass, channel || 'stable');
  }

  @Get('ota/:packageId/chunk/:index')
  chunk(@Param('packageId') packageId: string, @Param('index') indexStr: string) {
    return this.ota.getChunk(packageId, Number(indexStr));
  }

  private toDto(d: any) {
    return {
      device_id: d.deviceId,
      label: d.label,
      device_class: d.deviceClass,
      vendor: d.vendor,
      firmware_version: d.firmwareVersion,
      online: d.online,
      last_seen_at: d.lastSeenAt,
      created_at: d.createdAt,
    };
  }
}
