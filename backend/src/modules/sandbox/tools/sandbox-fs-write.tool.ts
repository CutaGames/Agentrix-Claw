import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AgentrixTool, ToolCategory, ToolContext, ToolResult } from '../../tool-registry/interfaces';
import { RegisterTool } from '../../tool-registry/decorators/register-tool.decorator';
import { DockerSandboxService } from '../docker-sandbox.service';

const inputSchema = z.object({
  instanceId: z.string().describe('Sandbox instance ID'),
  path: z.string().describe('Absolute path to write to'),
  content: z.string().describe('File content (utf8 by default; pass encoding=base64 for binary)'),
  encoding: z.enum(['utf8', 'base64']).optional().describe('Content encoding (default utf8)'),
  mkdirp: z.boolean().optional().describe('Create parent directories (default true)'),
});

type Input = z.infer<typeof inputSchema>;

@RegisterTool()
@Injectable()
export class SandboxFsWriteTool implements AgentrixTool<Input> {
  readonly name = 'sandbox_fs_write';
  readonly category = ToolCategory.SYSTEM;
  readonly description = 'Write a file inside the sandbox. Returns bytes written and path.';
  readonly inputSchema = inputSchema;
  readonly isReadOnly = false;
  readonly isConcurrencySafe = false;
  readonly requiresPayment = false;
  readonly riskLevel = 1 as const;
  readonly maxResultChars = 1000;

  constructor(private readonly sandbox: DockerSandboxService) {}

  async execute(input: Input, ctx: ToolContext): Promise<ToolResult> {
    if (!ctx.userId) {
      return { success: false, error: 'Authentication required.' };
    }
    try {
      const r = await this.sandbox.fsWrite(
        input.instanceId,
        {
          path: input.path,
          content: input.content,
          encoding: input.encoding,
          mkdirp: input.mkdirp,
        },
        ctx.userId,
      );
      return { success: true, data: r };
    } catch (e: any) {
      return { success: false, error: e?.message ?? String(e) };
    }
  }
}
