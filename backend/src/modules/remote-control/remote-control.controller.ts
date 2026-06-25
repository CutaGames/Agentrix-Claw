/**
 * RemoteControlController — HTTP endpoint for minting cross-device
 * tokens. Mobile calls this BEFORE emitting the socket execute event.
 *
 * Endpoint:
 *   POST /v1/cross-device/token
 *     Body: { targetDeviceId, command, requestId? }
 *     Returns: { token, expiresAt }
 *
 * Spec: requirements.md R8.5, R8.6, R8.10.
 */
import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CrossDeviceTokenService } from './cross-device-token.service';
import { REMOTE_CONTROL_FORBIDDEN, REMOTE_CONTROL_WHITELIST } from '../../../../shared/types/remote-control';

interface MintTokenBody {
  targetDeviceId: string;
  command: string;
  requestId?: string;
}

@ApiTags('cross-device')
@Controller('v1/cross-device')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RemoteControlController {
  constructor(private readonly tokens: CrossDeviceTokenService) {}

  @Post('token')
  @ApiOperation({
    summary: 'Mint a 30s cross-device token bound to (user, target, command)',
  })
  async mintToken(@Request() req: any, @Body() body: MintTokenBody) {
    const userId = req.user?.id || req.user?.sub || req.user?.userId;
    if (!body?.targetDeviceId) throw new BadRequestException('targetDeviceId required');
    if (!body?.command) throw new BadRequestException('command required');
    if ((REMOTE_CONTROL_FORBIDDEN as readonly string[]).includes(body.command)) {
      throw new BadRequestException('command is on the forbidden list');
    }
    if (!(REMOTE_CONTROL_WHITELIST as readonly string[]).includes(body.command)) {
      throw new BadRequestException('command is not whitelisted');
    }
    return this.tokens.mint({
      userId,
      targetDeviceId: body.targetDeviceId,
      command: body.command,
      requestId: body.requestId || `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    });
  }
}
