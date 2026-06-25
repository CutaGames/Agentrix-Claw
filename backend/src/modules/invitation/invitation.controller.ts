import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Query,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { InvitationService } from './invitation.service';
import { ValidateCodeDto, RedeemCodeDto } from './dto/validate-code.dto';
import { GenerateCodesDto } from './dto/generate-codes.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { InvitationCodeStatus } from '../../entities/invitation-code.entity';

@ApiTags('invitation')
@Controller('invitation')
export class InvitationController {
  constructor(private readonly invitationService: InvitationService) {}

  // ── Public endpoints ─────────────────────────────────────────────────

  @Public()
  @Post('validate')
  @ApiOperation({ summary: 'Validate an invitation code (does not consume it)' })
  async validate(@Body() dto: ValidateCodeDto) {
    return this.invitationService.validateCode(dto.code);
  }

  @UseGuards(JwtAuthGuard)
  @Post('redeem')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Redeem an invitation code (binds to authenticated user)' })
  async redeem(@Body() dto: RedeemCodeDto, @Request() req: any) {
    return this.invitationService.redeemCode(dto.code, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check if the current user has a valid invitation' })
  async status(@Request() req: any) {
    const hasInvitation = await this.invitationService.hasValidInvitation(req.user.id);
    return { hasInvitation };
  }
}

// ── Admin endpoints (separate controller, same module) ─────────────────

@ApiTags('admin-invitation')
@Controller('admin/invitation')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class InvitationAdminController {
  constructor(private readonly invitationService: InvitationService) {}

  @Post('generate')
  @ApiOperation({ summary: 'Generate a batch of invitation codes' })
  async generate(@Body() dto: GenerateCodesDto) {
    return this.invitationService.generateCodes(dto);
  }

  @Get('list')
  @ApiOperation({ summary: 'List invitation codes with filters' })
  @ApiQuery({ name: 'batch', required: false })
  @ApiQuery({ name: 'status', required: false, enum: InvitationCodeStatus })
  @ApiQuery({ name: 'channel', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async list(
    @Query('batch') batch?: string,
    @Query('status') status?: InvitationCodeStatus,
    @Query('channel') channel?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.invitationService.listCodes({
      batch,
      status,
      channel,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get invitation code statistics' })
  async stats() {
    return this.invitationService.getStatistics();
  }

  @Patch('disable')
  @ApiOperation({ summary: 'Disable specific invitation codes' })
  async disable(@Body() body: { codeIds: string[] }) {
    return this.invitationService.disableCodes(body.codeIds);
  }

  @Patch('disable-batch')
  @ApiOperation({ summary: 'Disable all available codes in a batch' })
  async disableBatch(@Body() body: { batch: string }) {
    return this.invitationService.disableBatch(body.batch);
  }
}
