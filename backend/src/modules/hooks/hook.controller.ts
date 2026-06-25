import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { HookService } from './hook.service';
import { HookEventType, HookHandlerType } from '../../entities/hook-config.entity';

@ApiTags('hooks')
@Controller('hooks')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class HookController {
  constructor(private readonly hookService: HookService) {}

  @Get()
  @ApiOperation({ summary: 'List all hooks for current user' })
  async listHooks(@Request() req: any) {
    return this.hookService.listHooks(req.user.id);
  }

  @Get(':hookId')
  @ApiOperation({ summary: 'Get hook by ID' })
  async getHook(@Param('hookId') hookId: string) {
    const hook = await this.hookService.getHook(hookId);
    if (!hook) return { error: 'Hook not found' };
    return hook;
  }

  @Post()
  @ApiOperation({ summary: 'Create a new hook' })
  async createHook(
    @Request() req: any,
    @Body() body: {
      eventType: HookEventType;
      handlerType?: HookHandlerType;
      handler: string;
      priority?: number;
      filter?: { toolNames?: string[]; sessionIds?: string[]; models?: string[] };
      config?: { timeout?: number; retries?: number; headers?: Record<string, string>; secret?: string };
      description?: string;
    },
  ) {
    return this.hookService.createHook(req.user.id, body);
  }

  @Put(':hookId')
  @ApiOperation({ summary: 'Update a hook' })
  async updateHook(
    @Param('hookId') hookId: string,
    @Body() body: Partial<{
      eventType: HookEventType;
      handlerType: HookHandlerType;
      handler: string;
      priority: number;
      filter: any;
      config: any;
      isEnabled: boolean;
      description: string;
    }>,
  ) {
    const hook = await this.hookService.updateHook(hookId, body);
    if (!hook) return { error: 'Hook not found' };
    return hook;
  }

  @Delete(':hookId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a hook' })
  async deleteHook(@Param('hookId') hookId: string) {
    const ok = await this.hookService.deleteHook(hookId);
    return { ok };
  }

  @Post(':hookId/toggle')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enable/disable a hook' })
  async toggleHook(
    @Param('hookId') hookId: string,
    @Body() body: { enabled: boolean },
  ) {
    const hook = await this.hookService.toggleHook(hookId, body.enabled);
    if (!hook) return { error: 'Hook not found' };
    return hook;
  }
}
