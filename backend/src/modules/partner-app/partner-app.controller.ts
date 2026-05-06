import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Req,
  Query,
  UseGuards,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  PartnerAppService,
  RegisterPartnerAppDto,
  UpdateBillingDto,
  PARTNER_APP_SCOPES,
  PartnerAppScope,
} from './partner-app.service';
import { PartnerAppStatus } from '../../entities/partner-app.entity';

/**
 * Phase 6 M5 — partner app SDK controllers.
 *
 * Two surfaces:
 *   /api/v1/partner-apps/*       — owner dashboard, JwtAuthGuard
 *   /api/v1/partner-runtime/*    — SDK runtime, X-Agentrix-App-Key header
 */

@UseGuards(JwtAuthGuard)
@Controller('v1/partner-apps')
export class PartnerAppController {
  constructor(private readonly service: PartnerAppService) {}

  @Get('scopes')
  scopes() {
    return { scopes: PARTNER_APP_SCOPES };
  }

  @Get()
  async listMine(@Req() req: any) {
    const userId = uid(req);
    const apps = await this.service.listMine(userId);
    return { items: apps.map((a) => this.service.toDto(a)) };
  }

  @Get(':id')
  async get(@Param('id') id: string, @Req() req: any) {
    const userId = uid(req);
    return this.service.toDto(await this.service.getOwn(id, userId));
  }

  @Post()
  async register(@Body() body: RegisterPartnerAppDto, @Req() req: any) {
    const userId = uid(req);
    const { app, apiKey } = await this.service.register(userId, body);
    return { app: this.service.toDto(app), api_key: apiKey };
  }

  @Post(':id/rotate-key')
  async rotate(@Param('id') id: string, @Req() req: any) {
    const userId = uid(req);
    const { app, apiKey } = await this.service.rotateKey(id, userId);
    return { app: this.service.toDto(app), api_key: apiKey };
  }

  @Patch(':id/status')
  async setStatus(
    @Param('id') id: string,
    @Body() body: { status: PartnerAppStatus },
    @Req() req: any,
  ) {
    const userId = uid(req);
    return this.service.toDto(await this.service.setStatus(id, userId, body.status));
  }

  @Patch(':id/billing')
  async setBilling(
    @Param('id') id: string,
    @Body() body: UpdateBillingDto,
    @Req() req: any,
  ) {
    const userId = uid(req);
    return this.service.toDto(await this.service.updateBilling(id, userId, body));
  }

  @Get(':id/usage')
  async usage(
    @Param('id') id: string,
    @Query('month') month: string | undefined,
    @Req() req: any,
  ) {
    const userId = uid(req);
    const m = (month && /^\d{4}-\d{2}$/.test(month)) ? month : new Date().toISOString().slice(0, 7);
    return { month: m, days: await this.service.usageForMonth(id, userId, m) };
  }
}

/**
 * Runtime endpoints: zero JWT, only X-Agentrix-App-Key.
 * For v1 we ship a single ping endpoint that records usage so SDK consumers
 * can wire in their billing without depending on the future scope-specific
 * endpoints.
 */
@Controller('v1/partner-runtime')
export class PartnerRuntimeController {
  constructor(private readonly service: PartnerAppService) {}

  @Get('whoami')
  async whoami(@Headers('x-agentrix-app-key') key: string) {
    const app = await this.service.authenticate(key);
    return {
      app_id: app.id,
      slug: app.slug,
      scopes: app.scopes,
      billing_mode: app.billingMode,
    };
  }

  @Post('ping')
  async ping(
    @Headers('x-agentrix-app-key') key: string,
    @Body() body: { scope?: PartnerAppScope; cost_usd?: number },
  ) {
    const app = await this.service.authenticate(key);
    const scope = body?.scope ?? 'pet.read';
    if (!this.service.hasScope(app, scope)) {
      throw new ForbiddenException(`missing scope ${scope}`);
    }
    const cost = body?.cost_usd;
    if (cost != null && (typeof cost !== 'number' || cost < 0 || cost > 100)) {
      throw new BadRequestException('cost_usd must be 0..100');
    }
    try {
      const usage = await this.service.recordCall(app.id, cost);
      return { ok: true, day: usage.day, calls_today: usage.calls, cost_today_usd: usage.costUsd };
    } catch (e: any) {
      // Convert "monthly_cap_exceeded" BadRequestException to HTTP 429.
      const msg = String(e?.message ?? '');
      if (msg.includes('monthly_cap_exceeded')) {
        throw new HttpException(msg, HttpStatus.TOO_MANY_REQUESTS);
      }
      throw e;
    }
  }
}

function uid(req: any): string {
  const u = req?.user?.userId || req?.user?.sub || req?.user?.id;
  if (!u) throw new ForbiddenException('no user context');
  return u;
}
