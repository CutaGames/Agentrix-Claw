import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PasskeyService } from './passkey.service';

/**
 * Passkey / WebAuthn API — Phase 4 W8 (WB-T4.1 / WB-T4.2).
 *
 *   POST   /api/v1/passkey/register/start
 *   POST   /api/v1/passkey/register/finish
 *   POST   /api/v1/passkey/auth/start
 *   POST   /api/v1/passkey/auth/finish
 *   GET    /api/v1/passkey
 *   DELETE /api/v1/passkey/:id
 */
@UseGuards(JwtAuthGuard)
@Controller('v1/passkey')
export class PasskeyController {
  constructor(private readonly svc: PasskeyService) {}

  private uid(req: any): string {
    return req.user?.userId || req.user?.sub || req.user?.id;
  }

  @Post('register/start')
  startRegister(@Req() req: any) {
    return this.svc.startRegistration(this.uid(req));
  }

  @Post('register/finish')
  async finishRegister(@Req() req: any, @Body() body: any) {
    const cred = await this.svc.finishRegistration(this.uid(req), body);
    return {
      credential: {
        id: cred.id,
        credential_id: cred.credentialId,
        label: cred.label,
        created_at: cred.createdAt,
      },
    };
  }

  @Post('auth/start')
  startAuth(@Req() req: any) {
    return this.svc.startAuthentication(this.uid(req));
  }

  @Post('auth/finish')
  finishAuth(@Req() req: any, @Body() body: any) {
    return this.svc.finishAuthentication(this.uid(req), body);
  }

  @Get()
  async list(@Req() req: any) {
    const items = await this.svc.listForUser(this.uid(req));
    return {
      items: items.map((c) => ({
        id: c.id,
        credential_id: c.credentialId,
        label: c.label,
        transports: c.transports,
        created_at: c.createdAt,
      })),
    };
  }

  @Delete(':id')
  async remove(@Req() req: any, @Param('id') id: string) {
    await this.svc.deleteOwn(this.uid(req), id);
    return { ok: true };
  }
}
