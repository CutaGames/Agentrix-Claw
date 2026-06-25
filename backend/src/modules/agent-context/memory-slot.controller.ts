import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MemorySlotService, MemorySlot, RecallOptions } from './memory-slot.service';
import { MemoryScope, MemoryType } from '../../entities/agent-memory.entity';

@ApiTags('memory-slots')
@Controller('memory-slots')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MemorySlotController {
  constructor(private readonly memorySlotService: MemorySlotService) {}

  @Get(':key')
  @ApiOperation({ summary: 'Read a memory slot by key' })
  async readSlot(
    @Request() req: any,
    @Param('key') key: string,
    @Query('scope') scope?: MemoryScope,
  ) {
    return this.memorySlotService.readSlot(req.user.id, key, scope);
  }

  @Post()
  @ApiOperation({ summary: 'Write a memory slot (upsert)' })
  async writeSlot(
    @Request() req: any,
    @Body() body: {
      key: string;
      value: any;
      scope: MemoryScope;
      type: MemoryType;
      importance?: number;
      tags?: string[];
      expiresAt?: string;
      sessionId?: string;
      agentId?: string;
    },
  ) {
    const slot: MemorySlot = {
      key: body.key,
      value: body.value,
      scope: body.scope,
      type: body.type,
      importance: body.importance,
      tags: body.tags,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
    };
    return this.memorySlotService.writeSlot(req.user.id, slot, body.sessionId, body.agentId);
  }

  @Delete(':key')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a memory slot' })
  async deleteSlot(
    @Request() req: any,
    @Param('key') key: string,
    @Query('scope') scope?: MemoryScope,
  ) {
    const deleted = await this.memorySlotService.deleteSlot(req.user.id, key, scope);
    return { deleted };
  }

  @Post('recall')
  @ApiOperation({ summary: 'Recall memories with filtering and ranking' })
  async recall(
    @Request() req: any,
    @Body() body: {
      agentId?: string;
      sessionId?: string;
      limit?: number;
      scopes?: MemoryScope[];
      types?: MemoryType[];
      tags?: string[];
      since?: string;
    },
  ) {
    const options: RecallOptions = {
      userId: req.user.id,
      agentId: body.agentId,
      sessionId: body.sessionId,
      limit: body.limit,
      scopes: body.scopes,
      types: body.types,
      tags: body.tags,
      since: body.since ? new Date(body.since) : undefined,
    };
    return this.memorySlotService.recall(options);
  }

  @Post('flush')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Flush pending memory writes for a session' })
  async flush(
    @Request() req: any,
    @Body() body: { sessionId: string; agentId?: string },
  ) {
    const count = await this.memorySlotService.flushPendingWrites(
      req.user.id,
      body.sessionId,
      body.agentId,
    );
    return { flushed: count };
  }
}
