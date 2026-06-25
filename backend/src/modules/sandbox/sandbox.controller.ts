import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SandboxService } from './sandbox.service';
import { DockerSandboxService } from './docker-sandbox.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

interface AuthedRequest {
  user?: { userId?: string; sub?: string; id?: string };
}

function pickUserId(req: AuthedRequest): string {
  const u = req.user as any;
  return u?.userId || u?.sub || u?.id || '';
}

@ApiTags('sandbox')
@Controller('sandbox')
export class SandboxController {
  constructor(
    private readonly sandboxService: SandboxService,
    private readonly dockerSandbox: DockerSandboxService,
  ) {}

  // ── Legacy v3 mock endpoint (kept for backward compatibility) ──────
  @Post('execute')
  @ApiOperation({ summary: '执行沙箱代码（legacy V3.0 mock）' })
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

  // ── M1: Real Docker sandbox ────────────────────────────────────────
  @Get('health')
  @ApiOperation({ summary: 'Docker sandbox 健康检查（无需鉴权用于 ops）' })
  async health() {
    return this.dockerSandbox.getDiagnostics();
  }

  @Post('spawn')
  @ApiOperation({ summary: '创建一个 Docker 沙箱实例' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async spawn(@Req() req: AuthedRequest, @Body() body: {
    image?: string;
    workDir?: string;
    taskId?: string;
    sessionId?: string;
    limits?: { memoryMb?: number; cpuShares?: number; ttlSec?: number };
  }) {
    const userId = pickUserId(req);
    if (!userId) return { success: false, error: 'unauthorized' };
    const inst = await this.dockerSandbox.spawn({
      userId,
      image: body?.image,
      workDir: body?.workDir,
      taskId: body?.taskId,
      sessionId: body?.sessionId,
      limits: body?.limits,
    });
    return {
      success: true,
      sandboxId: inst.id,
      containerId: inst.containerId,
      image: inst.image,
      status: inst.status,
      workDir: inst.workDir,
      limits: inst.limits,
    };
  }

  @Get('list')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async list(@Req() req: AuthedRequest) {
    const userId = pickUserId(req);
    if (!userId) return { success: false, error: 'unauthorized' };
    const items = await this.dockerSandbox.list(userId);
    return { success: true, items };
  }

  @Post(':id/exec')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async exec(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: { cmd: string | string[]; workDir?: string; timeoutMs?: number; env?: Record<string, string> },
  ) {
    const userId = pickUserId(req);
    if (!userId) return { success: false, error: 'unauthorized' };
    try {
      const r = await this.dockerSandbox.exec(id, body, userId);
      return { success: true, ...r };
    } catch (e: any) {
      return { success: false, error: e?.message ?? String(e) };
    }
  }

  @Post(':id/fs/read')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async fsRead(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: { path: string; maxBytes?: number },
  ) {
    const userId = pickUserId(req);
    if (!userId) return { success: false, error: 'unauthorized' };
    try {
      const r = await this.dockerSandbox.fsRead(id, body, userId);
      return { success: true, ...r };
    } catch (e: any) {
      return { success: false, error: e?.message ?? String(e) };
    }
  }

  @Post(':id/fs/write')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async fsWrite(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: { path: string; content: string; encoding?: 'utf8' | 'base64'; mkdirp?: boolean },
  ) {
    const userId = pickUserId(req);
    if (!userId) return { success: false, error: 'unauthorized' };
    try {
      const r = await this.dockerSandbox.fsWrite(id, body, userId);
      return { success: true, ...r };
    } catch (e: any) {
      return { success: false, error: e?.message ?? String(e) };
    }
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async destroy(@Req() req: AuthedRequest, @Param('id') id: string) {
    const userId = pickUserId(req);
    if (!userId) return { success: false, error: 'unauthorized' };
    await this.dockerSandbox.destroy(id, userId);
    return { success: true };
  }
}

