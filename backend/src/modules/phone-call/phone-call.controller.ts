import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PhoneCallInput, PhoneCallService } from './phone-call.service';

/**
 * P1-#5 Phone Call REST endpoints. Mirror the tool for direct calls.
 *   POST /api/phone/call         place outbound call
 *   GET  /api/phone/call/:id     poll status
 *   GET  /api/phone/mode         live | stub
 */
@UseGuards(JwtAuthGuard)
@Controller('phone')
export class PhoneCallController {
  constructor(private readonly svc: PhoneCallService) {}

  @Get('mode')
  mode() {
    return { live: this.svc.isLiveMode() };
  }

  @Post('call')
  place(@Body() body: PhoneCallInput) {
    return this.svc.place(body);
  }

  @Get('call/:id')
  status(@Param('id') id: string) {
    return this.svc.getStatus(id);
  }
}
