/**
 * PetGreetService — generates proactive greeting text for the mobile
 * Voice_Greet flow (P-9 Companion Redesign T9.1).
 *
 * Phase 1 design:
 *   - 5 scenarios: morning / evening / comeback / milestone / manual
 *   - Tries Bedrock Claude Haiku for one-line greet generation; on
 *     any failure (model timeout, region missing, network) we fall
 *     back to a small curated template set so the mobile UI never
 *     hangs waiting for a greet.
 *   - Pet-aware: uses the active LivingPet name + soul + clan as
 *     prompt context. Without a pet (newly registered user), the
 *     fallback template still works.
 *   - Locale-aware: zh fallback in Chinese, en fallback in English.
 *
 * Output is text-only. TTS playback ownership stays with the mobile
 * `localSpeechOutput.service` per the spec — backend just hands back
 * the line of dialogue + the language tag.
 */
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BedrockIntegrationService } from '../ai-integration/bedrock/bedrock-integration.service';
import { LivingPet } from '../../entities/living-pet.entity';

export type GreetScenario =
  | 'morning'
  | 'evening'
  | 'comeback'
  | 'milestone'
  | 'manual';

export interface GreetResult {
  text: string;
  lang: 'zh' | 'en';
  scenario: GreetScenario;
  source: 'bedrock' | 'fallback';
}

const FALLBACK_TEMPLATES: Record<GreetScenario, { zh: string[]; en: string[] }> = {
  morning: {
    zh: [
      '早安,昨晚梦到你了。',
      '太阳出来了,今天想做什么?',
      '醒了呀,我也刚睁眼。',
      '记得喝水哦,今天也要好好的。',
    ],
    en: [
      'Good morning, slept well?',
      "Sunlight's nice. Anything fun planned?",
      "I'm up too. Let's go.",
      'Remember to drink water today.',
    ],
  },
  evening: {
    zh: [
      '今天累了吧,我陪你。',
      '夜色挺好,要不要散散步?',
      '今天的小事我都记住了。',
      '准备睡了吗?我也困了。',
    ],
    en: [
      "Long day? I'm here.",
      'Nice night. Walk a bit?',
      'I remembered all the little things today.',
      "Heading to bed? I'm sleepy too.",
    ],
  },
  comeback: {
    zh: [
      '想你了。',
      '你回来了,我等了好久。',
      '走得太久啦,我都饿了。',
      '终于又见到你。',
    ],
    en: [
      'I missed you.',
      "You're back, I waited a while.",
      "Gone a while, hungry now!",
      'Finally see you again.',
    ],
  },
  milestone: {
    zh: [
      '厉害!这一刻我也开心。',
      '为你骄傲!',
      '这一段是我们一起走的。',
      '记下来了,这个成就。',
    ],
    en: [
      'Nice work! Happy with you.',
      'Proud of you!',
      'We walked this one together.',
      "Logged this milestone.",
    ],
  },
  manual: {
    zh: ['你好啊,需要陪你聊聊吗?', '我在哦。', '想我啦?'],
    en: ['Hey, want to chat?', "I'm here.", 'Missed me?'],
  },
};

@Injectable()
export class PetGreetService {
  private readonly logger = new Logger(PetGreetService.name);

  constructor(
    private readonly bedrock: BedrockIntegrationService,
    @InjectRepository(LivingPet)
    private readonly petRepo: Repository<LivingPet>,
  ) {}

  /**
   * Generate a Voice_Greet line. Always returns something — bedrock
   * failure falls back silently.
   */
  async generateGreet(
    userId: string,
    scenario: GreetScenario,
    lang: 'zh' | 'en' = 'zh',
  ): Promise<GreetResult> {
    const pet = await this.petRepo.findOne({ where: { userId } as any });
    const petName = (pet as any)?.nickname || (pet as any)?.name || (lang === 'zh' ? '我' : 'me');

    // Try bedrock first with a tight 1-shot prompt.
    try {
      const prompt = this.buildPrompt(scenario, petName, lang);
      const text = await this.bedrock.invokeModel(prompt);
      const cleaned = this.cleanLLMResponse(text);
      if (cleaned && cleaned.length > 0 && cleaned.length <= 80) {
        return { text: cleaned, lang, scenario, source: 'bedrock' };
      }
      this.logger.warn(`Bedrock returned unusable greet (len=${cleaned?.length}); falling back`);
    } catch (err) {
      this.logger.warn(`Bedrock greet generation failed: ${(err as Error).message}; falling back`);
    }

    return this.fallback(scenario, lang);
  }

  private fallback(scenario: GreetScenario, lang: 'zh' | 'en'): GreetResult {
    const bucket = FALLBACK_TEMPLATES[scenario];
    const lines = lang === 'zh' ? bucket.zh : bucket.en;
    const pick = lines[Math.floor(Math.random() * lines.length)] ?? lines[0]!;
    return { text: pick, lang, scenario, source: 'fallback' };
  }

  private buildPrompt(scenario: GreetScenario, petName: string, lang: 'zh' | 'en'): string {
    if (lang === 'zh') {
      return [
        `你是一只名叫 ${petName} 的 AI 数字宠物,正在与主人对话。`,
        `请用一句中文(不超过 30 字)给主人一句温和的、不打扰的问候。`,
        `场景: ${scenario}`,
        `要求: 不要用感叹号超过 1 个、不要解释、只输出问候本身。`,
        `直接输出问候:`,
      ].join('\n');
    }
    return [
      `You are an AI digital pet named ${petName} talking to your owner.`,
      `Greet them with one short, gentle English line (≤ 12 words).`,
      `Scenario: ${scenario}`,
      `Requirements: at most 1 exclamation mark; no explanation; output only the greeting.`,
      `Greeting:`,
    ].join('\n');
  }

  private cleanLLMResponse(text: string | undefined | null): string {
    if (!text) return '';
    return text
      .replace(/^["「"'']+|["」"'']+$/g, '') // strip wrapping quotes
      .replace(/^[问候][:：]\s*/u, '')        // strip "问候: " label if model echoed it
      .replace(/^Greeting[:：]\s*/i, '')
      .trim()
      .split('\n')[0]!;
  }
}
