import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AgentrixTool, ToolCategory, ToolContext, ToolResult } from '../../tool-registry/interfaces';
import { RegisterTool } from '../../tool-registry/decorators/register-tool.decorator';
import { DockerSandboxService } from '../docker-sandbox.service';

const inputSchema = z.object({
  instanceId: z.string().describe('Sandbox instance ID'),
  path: z.string().describe('Absolute path inside the sandbox (e.g. /workspace/foo.txt)'),
  maxBytes: z.number().int().min(1).max(1_048_576).optional().describe('Max bytes to read (default 65536)'),
});

type Input = z.infer<typeof inputSchema>;

@RegisterTool()
@Injectable()
export class SandboxFsReadTool implements AgentrixTool<Input> {
  readonly name = 'sandbox_fs_read';
  readonly category = ToolCategory.SYSTEM;
  readonly description = 'Read a file from the sandbox filesystem (UTF-8). Returns content + bytes.';
  readonly inputSchema = inputSchema;
  readonly isReadOnly = true;
  readonly isConcurrencySafe = true;
  readonly requiresPayment = false;
  readonly riskLevel = 0 as const;
  readonly maxResultChars = 16000;

  constructor(private readonly sandbox: DockerSandboxService) {}

  async execute(input: Input, ctx: ToolContext): Promise<ToolResult> {
    if (!ctx.userId) {
      return { success: false, error: 'Authentication required.' };
    }
    try {
      const r = await this.sandbox.fsRead(
        input.instanceId,
        { path: input.path, maxBytes: input.maxBytes },
        ctx.userId,
      );
      return { success: true, data: r };
    } catch (e: any) {
      return { success: false, error: e?.message ?? String(e) };
    }
  }
}
