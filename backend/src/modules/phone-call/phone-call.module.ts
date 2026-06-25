import { Module } from '@nestjs/common';
import { PhoneCallService } from './phone-call.service';
import { PhoneCallController } from './phone-call.controller';
import { PhoneCallPlaceTool } from './tools/phone-call-place.tool';

/**
 * PhoneCallModule (P1-#5) — outbound voice calls via Vapi.
 *   - Tool: phone_call_place (auto-discovered by ToolRegistry)
 *   - REST: /api/phone/*
 */
@Module({
  controllers: [PhoneCallController],
  providers: [PhoneCallService, PhoneCallPlaceTool],
  exports: [PhoneCallService],
})
export class PhoneCallModule {}
