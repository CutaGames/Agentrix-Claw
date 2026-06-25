import { Body, Controller, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { Device } from '../../entities/device.entity';

/**
 * Phase 5 BE-10.1 — EMQX HTTP authentication hook.
 *
 * Public endpoint (NOT auth-guarded) called by the EMQX broker on every
 * device CONNECT. We compare SHA-256(password) to the stored DST hash; on
 * match we return `{ result: "allow" }` per EMQX 5 protocol; otherwise
 * `{ result: "deny" }`.
 *
 * Always returns 200 with a result body so EMQX caches the decision instead
 * of treating non-200 as an error — this matches EMQX docs' recommendation.
 */
@Controller('v1/devices/mqtt')
export class MqttAuthnController {
  constructor(
    @InjectRepository(Device)
    private readonly deviceRepo: Repository<Device>,
  ) {}

  @Post('authn')
  @HttpCode(HttpStatus.OK)
  async authn(@Body() body: { client_id?: string; username?: string; password?: string }) {
    const id = body.client_id || body.username;
    if (!id || !body.password) return { result: 'deny' };
    const dev = await this.deviceRepo.findOne({ where: { deviceId: id } });
    if (!dev || !dev.dstHash) return { result: 'deny' };
    const presented = crypto.createHash('sha256').update(body.password).digest('hex');
    const ok = (() => {
      try { return crypto.timingSafeEqual(Buffer.from(presented), Buffer.from(dev.dstHash)); }
      catch { return false; }
    })();
    if (!ok) return { result: 'deny' };
    // Update presence opportunistically; broker will also fire LWT later.
    dev.online = true;
    dev.lastSeenAt = new Date();
    await this.deviceRepo.save(dev);
    return { result: 'allow', is_superuser: false };
  }
}
