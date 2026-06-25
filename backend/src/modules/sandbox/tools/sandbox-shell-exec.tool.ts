import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AgentrixTool, ToolCategory, ToolContext, ToolResult } from '../../tool-registry/interfaces';
import { RegisterTool } from '../../tool-registry/decorators/register-tool.decorator';
import { DockerSandboxService } from '../docker-sandbox.service';

const inputSchema = z.object({
  instanceId: z.string().describe('Sandbox instance ID returned by sandbox.spawn'),
  cmd: z.string().describe('Shell command to run (executed via sh -c)'),
  workDir: z.string().optional().describe('Override working directory'),
  timeoutMs: z.number().int().min(100).max(120_000).optional().describe('Per-exec timeout (default 30000)'),
});

type Input = z.infer<typeof inputSchema>;

@RegisterTool()
@Injectable()
export class SandboxShellExecTool implements AgentrixTool<Input> {
  readonly name = 'sandbox_shell_exec';
  readonly category = ToolCategory.SYSTEM;
  readonly description =
    'Execute a shell command inside an isolated Docker sandbox. Returns stdout/stderr/exitCode.';
  readonly inputSchema = inputSchema;
  readonly isReadOnly = false;
  readonly isConcurrencySafe = false;
  readonly requiresPayment = false;
  readonly riskLevel = 2 as const;
  readonly maxResultChars = 8000;

  constructor(private readonly sandbox: DockerSandboxService) {}

  async execute(input: Input, ctx: ToolContext): Promise<ToolResult> {
    if (!ctx.userId) {
      return { success: false, error: 'Authentication required.' };
    }
    try {
      const r = await this.sandbox.exec(
        input.instanceId,
        { cmd: input.cmd, workDir: input.workDir, timeoutMs: input.timeoutMs },
        ctx.userId,
      );
      return {
        success: r.exitCode === 0,
        data: r,
        durationMs: r.durationMs,
        error: r.exitCode === 0 ? undefined : `exit ${r.exitCode}`,
      };
    } catch (e: any) {
      return { success: false, error: e?.message ?? String(e) };
    }
  }
}
