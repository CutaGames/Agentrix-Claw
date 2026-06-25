import {
  Controller,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SandboxService } from './sandbox.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('sandbox')
@Controller('sandbox')
export class SandboxController {
  constructor(private readonly sandboxService: SandboxService) {}

  @Post('execute')
  @ApiOperation({ summary: '执行沙箱代码（V3.0：交互式沙盒）' })
  @ApiResponse({ status: 200, description: '返回执行结果' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async executeCode(@Body() body: {
    code: string;
    language: 'typescript' | 'javascript' | 'python';
    apiKey?: string;
  }) {
    return this.sandboxService.executeCode(body);
  }
}

