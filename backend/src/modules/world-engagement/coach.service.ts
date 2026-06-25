import { Injectable, Logger, Optional } from '@nestjs/common';
import { LlmCompletionService } from '../ai-provider/llm-completion.service';

/**
 * CoachService — 「每个游戏即时 AI 解说/陪练」(P0-① 差异化 Wow)。
 *
 * 玩家在游戏内点「🧠 教练」→ 客户端读取 `window.render_game_to_text()` 的实时状态文本 →
 * 这里喂给 LLM,产出一句口语化的解说 + 一条可执行的策略建议(中文,简短)。
 * 优先用户 BYO 模型(LlmCompletionService);无模型/失败 → 关键词兜底贴士(永不空手)。
 *
 * 这是 Astrocade 等"静态单机"给不了的:任何游戏一进去就有 agent 陪你打/点评。
 */
@Injectable()
export class CoachService {
  private readonly logger = new Logger(CoachService.name);

  constructor(@Optional() private readonly llm?: LlmCompletionService) {}

  async coach(input: {
    userId?: string;
    title?: string;
    state?: string | null;
    history?: string[];
  }): Promise<{ tip: string; byModel: string | null }> {
    const title = (input.title || '小游戏').slice(0, 60);
    const state = this.normalizeState(input.state);

    if (this.llm) {
      try {
        const res = await this.llm.complete({
          userId: input.userId,
          system:
            '你是热情、专业又会玩梗的游戏陪练教练。只说中文。回答必须简短(总长不超过55字),' +
            '包含:①一句有感染力的解说/鼓励,②一条此刻可立即执行的具体策略。不要前缀、不要列表、不要解释。',
          prompt:
            `游戏:《${title}》。\n` +
            (state ? `实时状态(JSON):${state}\n` : '玩家刚进入,还没有状态。\n') +
            (input.history?.length ? `最近你说过:${input.history.slice(-2).join(' / ')}\n` : '') +
            '现在给玩家一句教练点评+一条策略建议:',
          maxTokens: 160,
          timeoutMs: 20_000,
          platformModel: 'claude-haiku-4-5',
        });
        const tip = this.clean(res.text);
        if (tip) return { tip, byModel: res.modelUsed };
      } catch (e: any) {
        this.logger.warn(`coach LLM failed: ${e?.message ?? e}; using fallback.`);
      }
    }
    return { tip: this.fallback(title, state), byModel: null };
  }

  private normalizeState(state?: string | null): string | null {
    if (!state) return null;
    const s = String(state).slice(0, 600);
    return s.trim() || null;
  }

  /** 去掉模型可能带的引号/前缀/markdown,压成一行短句。 */
  private clean(text?: string): string {
    if (!text) return '';
    let t = text
      .trim()
      .replace(/[*#`>_]/g, '') // 去 markdown 记号
      .replace(/\s+/g, ' ')
      .replace(/^["'「『【\[]+|["'」』】\]]+$/g, '')
      .replace(/^(教练点评|教练|解说|点评|建议|策略)[:：]?\s*/g, '')
      .trim();
    return t.slice(0, 90);
  }

  /** 无模型/失败时的关键词兜底贴士(按标题猜品类)。 */
  private fallback(title: string, state: string | null): string {
    const t = title;
    let scoreHint = '';
    try {
      if (state) {
        const obj = JSON.parse(state);
        if (typeof obj.score === 'number') scoreHint = `已经 ${obj.score} 分,稳住别浪!`;
        if (obj.over) scoreHint = `这局结束啦,${scoreHint || '再来一把冲更高!'}`;
      }
    } catch { /* ignore */ }
    if (/射击|飞机|战机|shoot/i.test(t)) return scoreHint + '走位优先,贴边躲弹幕,攒能量再开火。';
    if (/消除|消消乐|三消|match/i.test(t)) return scoreHint + '先找能连锁的特殊块,从底部消引发连击。';
    if (/塔防|td|defen/i.test(t)) return scoreHint + '拐角多叠炮塔,先升攻速再铺数量。';
    if (/赛车|飞驰|race|drive/i.test(t)) return scoreHint + '提前看两条车道,贴线吃金币别恋战。';
    if (/节奏|音游|rhythm|beat/i.test(t)) return scoreHint + '盯判定线提前半拍,长连击分更高。';
    if (/贪吃蛇|snake/i.test(t)) return scoreHint + '贴边绕圈留出路,别把自己困死。';
    if (/方块|俄罗斯|tetris/i.test(t)) return scoreHint + '左侧留一列等长条,一次清四行。';
    if (/弹球|打砖块|breakout/i.test(t)) return scoreHint + '把球打到顶端夹层,自动连消更省心。';
    if (/跑酷|酷跑|runner|跳/i.test(t)) return scoreHint + '听节奏二段跳,贴近障碍再跳更稳。';
    return scoreHint || '稳住心态,先求稳再求高分,你可以的!';
  }
}
