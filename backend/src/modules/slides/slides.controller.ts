import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GenerateSlidesInput, SlidesService } from './slides.service';

/**
 * Slides REST controller. Mirror of the slides_generate tool for direct calls
 * (e.g. desktop preview iframe loads /api/slides/render).
 */
@UseGuards(JwtAuthGuard)
@Controller('slides')
export class SlidesController {
  constructor(private readonly slides: SlidesService) {}

  @Post('generate')
  generate(@Body() input: GenerateSlidesInput) {
    return this.slides.generate(input);
  }
}
