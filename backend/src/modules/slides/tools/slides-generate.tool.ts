import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AgentrixTool, ToolCategory, ToolContext, ToolResult } from '../../tool-registry/interfaces';
import { RegisterTool } from '../../tool-registry/decorators/register-tool.decorator';
import { SlidesService } from '../slides.service';

const sectionSchema = z.object({
  heading: z.string().min(1).describe('Section / slide heading'),
  bullets: z.array(z.string()).optional().describe('Bullet points for the slide'),
  body: z.string().optional().describe('Optional paragraph body above the bullets'),
  notes: z.string().optional().describe('Speaker notes (Marp HTML comment)'),
});

const inputSchema = z.object({
  title: z.string().min(1).describe('Deck title (cover slide)'),
  subtitle: z.string().optional(),
  author: z.string().optional(),
  sections: z.array(sectionSchema).min(1).describe('Body slides'),
  theme: z.enum(['default', 'gaia', 'uncover']).optional().describe('Marp theme'),
  paginate: z.boolean().optional(),
});

type Input = z.infer<typeof inputSchema>;

@RegisterTool()
@Injectable()
export class SlidesGenerateTool implements AgentrixTool<Input> {
  readonly name = 'slides_generate';
  readonly category = ToolCategory.SKILL;
  readonly description =
    'Generate a Marp slide deck (markdown + preview HTML) from a structured outline. Pair with an LLM that produces the outline.';
  readonly inputSchema = inputSchema;
  readonly isReadOnly = true;
  readonly isConcurrencySafe = true;
  readonly requiresPayment = false;
  readonly riskLevel = 0 as const;
  readonly maxResultChars = 16000;

  constructor(private readonly slides: SlidesService) {}

  async execute(input: Input, _ctx: ToolContext): Promise<ToolResult> {
    const start = Date.now();
    try {
      const result = this.slides.generate(input);
      return {
        success: true,
        data: {
          markdown: result.markdown,
          slideCount: result.slideCount,
          theme: result.theme,
          title: result.title,
          previewHtml: result.previewHtml,
        },
        durationMs: Date.now() - start,
      };
    } catch (e: any) {
      return { success: false, error: e?.message ?? String(e), durationMs: Date.now() - start };
    }
  }
}
