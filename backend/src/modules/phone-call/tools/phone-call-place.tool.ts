import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AgentrixTool, ToolCategory, ToolContext, ToolResult } from '../../tool-registry/interfaces';
import { RegisterTool } from '../../tool-registry/decorators/register-tool.decorator';
import { PhoneCallService } from '../phone-call.service';

const inputSchema = z.object({
  to: z.string().describe('Destination phone number in E.164 format (e.g. +14155552671)'),
  assistantId: z.string().optional().describe('Pre-created Vapi assistant id'),
  assistant: z
    .object({
      firstMessage: z.string().optional(),
      systemPrompt: z.string().optional(),
      voiceId: z.string().optional(),
      model: z.string().optional(),
    })
    .optional()
    .describe('Inline assistant config (used if assistantId not given)'),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

type Input = z.infer<typeof inputSchema>;

/**
 * Place an outbound voice call via Vapi. Riskier than other tools (real PSTN
 * cost + spam risk), so requires medium approval.
 */
@RegisterTool()
@Injectable()
export class PhoneCallPlaceTool implements AgentrixTool<Input> {
  readonly name = 'phone_call_place';
  readonly category = ToolCategory.SKILL;
  readonly description =
    'Place an outbound AI voice call to a phone number using Vapi. Returns the Vapi call id for status tracking.';
  readonly inputSchema = inputSchema;
  readonly isReadOnly = false;
  readonly isConcurrencySafe = false;
  readonly requiresPayment = true; // PSTN minutes cost real money
  readonly riskLevel = 2 as const;
  readonly maxResultChars = 4000;

  constructor(private readonly svc: PhoneCallService) {}

  async execute(input: Input, ctx: ToolContext): Promise<ToolResult> {
    if (!ctx.userId) return { success: false, error: 'authentication required' };
    const start = Date.now();
    try {
      const result = await this.svc.place(input);
      return {
        success: true,
        data: result,
        durationMs: Date.now() - start,
      };
    } catch (e: any) {
      return { success: false, error: e?.message ?? String(e), durationMs: Date.now() - start };
    }
  }
}
