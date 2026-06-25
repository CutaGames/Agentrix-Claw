import { Module } from '@nestjs/common';
import { SlidesService } from './slides.service';
import { SlidesController } from './slides.controller';
import { SlidesGenerateTool } from './tools/slides-generate.tool';

/**
 * SlidesModule (P0-#3) — AI Slides Generator skill.
 *
 * Exposes the `slides_generate` tool (auto-discovered by ToolRegistry) and a
 * REST endpoint for direct preview rendering.
 */
@Module({
  controllers: [SlidesController],
  providers: [SlidesService, SlidesGenerateTool],
  exports: [SlidesService],
})
export class SlidesModule {}
