/**
 * PetGreetController — `/v1/pet/greet` endpoint family.
 *
 * Phase 1: GET /v1/pet/greet?scenario=morning|evening|comeback|milestone|manual&lang=zh|en
 *   Returns one greeting line for the active pet of the authenticated
 *   user. Bedrock-generated when possible, fallback templates otherwise.
 *
 * Mobile uses this from `voiceGreetScheduler.service` (T11). Quota /
 * dedup is enforced client-side (per-day count cap in AsyncStorage); the
 * endpoint itself is idempotent and unrate-limited at this layer.
 *
 * Spec: requirements.md R3.3 / R10.10, design.md §Components/Core 2.
 */
import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PetGreetService, type GreetScenario } from './pet-greet.service';

const VALID_SCENARIOS: GreetScenario[] = ['morning', 'evening', 'comeback', 'milestone', 'manual'];

@ApiTags('pet/greet')
@Controller('v1/pet')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PetGreetController {
  constructor(private readonly svc: PetGreetService) {}

  @Get('greet')
  @ApiOperation({
    summary: 'Generate one Voice_Greet line for the active pet',
    description:
      'Mobile calls this on app foreground / activity transitions / manual taps. ' +
      'Returns text only — TTS playback ownership stays on the device.',
  })
  async greet(
    @Req() req: any,
    @Query('scenario') scenarioRaw?: string,
    @Query('lang') langRaw?: string,
  ) {
    const userId = req.user?.id || req.user?.sub || req.user?.userId;
    const scenario = (VALID_SCENARIOS.includes(scenarioRaw as GreetScenario)
      ? scenarioRaw
      : 'manual') as GreetScenario;
    const lang = langRaw === 'en' ? 'en' : 'zh';
    const result = await this.svc.generateGreet(userId, scenario, lang);
    return {
      scenario: result.scenario,
      lang: result.lang,
      text: result.text,
      source: result.source,
      ttsUrl: null,
    };
  }
}
