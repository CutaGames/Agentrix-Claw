import {
  Controller,
  Get,
  Post,
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
import { SlashCommandService } from './slash-command.service';

@ApiTags('slash-commands')
@Controller('slash-commands')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SlashCommandController {
  constructor(private readonly slashCommandService: SlashCommandService) {}

  @Get()
  @ApiOperation({ summary: 'List all available slash commands' })
  async listCommands(@Request() req: any) {
    return this.slashCommandService.listCommands(req.user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a custom slash command' })
  async createCommand(
    @Request() req: any,
    @Body() body: {
      name: string;
      description?: string;
      promptTemplate: string;
      parameters?: Array<{ name: string; description?: string; required?: boolean; type?: 'string' | 'number' | 'boolean' }>;
    },
  ) {
    return this.slashCommandService.createCommand(req.user.id, body);
  }

  @Delete(':commandId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a custom slash command' })
  async deleteCommand(@Request() req: any, @Param('commandId') commandId: string) {
    const ok = await this.slashCommandService.deleteCommand(req.user.id, commandId);
    return { ok };
  }

  @Post(':name/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resolve a slash command prompt with arguments' })
  async resolveCommand(
    @Request() req: any,
    @Param('name') name: string,
    @Body() body: { args: string },
  ) {
    const command = await this.slashCommandService.getCommand(req.user.id, name);
    if (!command) return { error: 'Command not found' };
    const prompt = this.slashCommandService.resolveCommandPrompt(command, body.args || '');
    return { prompt, command: command.name, description: command.description };
  }
}
