import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
  Put,
  Query,
  RawBodyRequest,
  Req,
  Headers,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  OpenClawConnectionService,
  BindOpenClawDto,
  ProvisionCloudDto,
  RegisterLocalRelayDto,
} from './openclaw-connection.service';
import { TelegramBotService, TelegramUpdate } from './telegram-bot.service';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('openclaw')
@Controller('openclaw')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OpenClawConnectionController {
  constructor(
    private readonly service: OpenClawConnectionService,
    private readonly telegramBot: TelegramBotService,
  ) {}

  // ===== Instance Listing =====

  @Get('instances')
  @ApiOperation({ summary: 'List my OpenClaw instances' })
  async getMyInstances(@Request() req: any) {
    return this.service.getInstancesByUser(req.user.id);
  }

  @Get('instances/:id')
  @ApiOperation({ summary: 'Get an OpenClaw instance by ID' })
  async getInstance(@Request() req: any, @Param('id') id: string) {
    return this.service.getInstanceById(req.user.id, id);
  }

  @Patch('instances/:id/agent-account')
  @ApiOperation({ summary: 'Bind or clear the Agent Account used by this instance' })
  async bindAgentAccount(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { agentAccountId?: string | null },
  ) {
    return this.service.bindAgentAccount(req.user.id, id, body?.agentAccountId ?? null);
  }

  // ===== Bind Self-Hosted =====

  @Post('bind')
  @ApiOperation({ summary: 'Bind an existing OpenClaw instance (URL + token)' })
  @ApiResponse({ status: 201, description: 'Instance bound successfully' })
  async bindInstance(@Request() req: any, @Body() dto: BindOpenClawDto) {
    return this.service.bindInstance(req.user.id, dto);
  }

  // ===== Cloud Provision =====

  @Post('cloud/provision')
  @ApiOperation({ summary: 'Provision a cloud-hosted OpenClaw instance (30s)' })
  @ApiResponse({ status: 201, description: 'Provisioning started' })
  async provisionCloud(@Request() req: any, @Body() dto: ProvisionCloudDto) {
    return this.service.provisionCloudInstance(req.user.id, dto);
  }

  // ===== Auto-Provision (one-tap / voice activation) =====

  @Post('auto-provision')
  @ApiOperation({ summary: 'Auto-provision a cloud instance with sensible defaults' })
  @ApiResponse({ status: 201, description: 'Instance provisioned' })
  async autoProvision(@Request() req: any) {
    const instance = await this.service.provisionCloudInstance(req.user.id, {
      name: 'My Agent',
    });
    return { instance };
  }

  // ===== Primary =====

  @Put('instances/:id/primary')
  @ApiOperation({ summary: 'Set instance as primary' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async setPrimary(@Request() req: any, @Param('id') id: string) {
    await this.service.setPrimaryInstance(req.user.id, id);
  }

  // ===== Unbind =====

  @Delete('instances/:id')
  @ApiOperation({ summary: 'Unbind / remove an instance' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async unbind(@Request() req: any, @Param('id') id: string) {
    await this.service.unbindInstance(req.user.id, id);
  }

  @Delete('instances')
  @ApiOperation({ summary: 'Batch-delete instances by status (e.g. error, unlinked)' })
  async batchCleanup(
    @Request() req: any,
    @Query('status') status: string,
  ) {
    return this.service.batchCleanupByStatus(req.user.id, status || 'error');
  }

  // ===== QR Bind Session =====

  @Post('bind-session')
  @ApiOperation({ summary: 'Create a QR bind session (for QR code login to bind)' })
  async createBindSession(@Request() req: any) {
    return this.service.createBindSession(req.user.id);
  }

  @Get('bind-session/:sessionId/poll')
  @ApiOperation({ summary: 'Poll QR bind session resolution' })
  async pollBindSession(@Param('sessionId') sessionId: string) {
    return this.service.pollBindSession(sessionId);
  }

  // ===== Social Relay — Telegram Bind QR =====

  @Post('social/telegram/qr')
  @ApiOperation({ summary: 'Generate Telegram binding QR deep-link for an instance' })
  async generateTelegramQr(
    @Request() req: any,
    @Body('instanceId') instanceId: string,
  ) {
    return this.service.generateSocialBindQr(req.user.id, instanceId, 'telegram');
  }

  @Delete('social/telegram/:instanceId')
  @ApiOperation({ summary: 'Unlink Telegram from an instance' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async unlinkTelegram(@Request() req: any, @Param('instanceId') instanceId: string) {
    await this.service.unlinkSocial(req.user.id, instanceId, 'telegram');
  }

  // ===== Local Agent — relay token provisioning =====

  @Post('local/provision')
  @ApiOperation({ summary: 'Create a local instance entry and return relay token + download URL' })
  async provisionLocal(@Request() req: any, @Body() dto: ProvisionCloudDto) {
    return this.service.provisionLocalInstance(req.user.id, dto);
  }

  @Post('local/register')
  @ApiOperation({ summary: 'Register a desktop-installed local relay agent after QR scan pairing' })
  async registerLocal(@Request() req: any, @Body() dto: RegisterLocalRelayDto) {
    return this.service.registerLocalRelayInstance(req.user.id, dto);
  }

  @Get('local/:instanceId/relay-status')
  @ApiOperation({ summary: 'Check if local agent is currently relay-connected' })
  async relayStatus(@Request() req: any, @Param('instanceId') instanceId: string) {
    return this.service.getRelayStatus(req.user.id, instanceId);
  }

  // ===== Model Switching =====

  @Get('models')
  @ApiOperation({ summary: 'Get available LLM models for switching' })
  async getAvailableModels() {
    return this.service.getAvailableModels();
  }

  @Get('instances/:id/model')
  @ApiOperation({ summary: 'Get the active model for an instance' })
  async getInstanceModel(@Request() req: any, @Param('id') id: string) {
    return this.service.getInstanceModel(req.user.id, id);
  }

  @Patch('instances/:id/model')
  @ApiOperation({ summary: 'Switch the LLM model for an instance (cloud or local)' })
  async switchInstanceModel(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { modelId: string },
  ) {
    return this.service.switchInstanceModel(req.user.id, id, body.modelId);
  }

  // ===== Telegram Webhook (public — validated by bot token secret) =====

  @Public()
  @Post('webhook/telegram')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Telegram Bot webhook (public endpoint)' })
  async telegramWebhook(@Body() update: TelegramUpdate) {
    await this.telegramBot.handleUpdate(update);
    return { ok: true };
  }
}
