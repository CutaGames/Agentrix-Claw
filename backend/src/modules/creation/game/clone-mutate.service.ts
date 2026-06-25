import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';

/**
 * CloneMutateService — 「克隆-变异」可靠生成引擎(把游戏做"多且复杂")。
 *
 * 策略(见 AI_GAME_COMPETITIVE_STRATEGY):不靠裸 LLM codegen 碰运气,而是在一个
 * **已验证可玩的游戏语料库**(自研模板:射击/消除/方块…)上做**参数变异**——选一个
 * 与玩家描述匹配的基底模板,采样一套配置(主题/难度/标题…)注入模板,产出自包含 HTML。
 * 因为基底是验证过的,产物**永远可玩**;同时配置变异带来"每次不同"的多样性。
 *
 * 注入方式:在模板 `<script>` 之前插入 `window.__GAME_CONFIG = {...}`;模板内已读取该
 * 配置(标题/难度等)。配置不改变核心循环,只调玩法/观感旋钮 → 不破坏可玩性。
 */

export interface CloneMutateResult {
  html: string;
  baseKey: string;
  config: Record<string, unknown>;
}

interface CorpusEntry {
  key: string;
  /** games-authored 下的模板文件相对路径。 */
  file: string;
  /** 匹配玩家描述的关键字。 */
  match: RegExp;
  /** 可变异旋钮(注入到 window.__GAME_CONFIG)。 */
  difficulties: string[];
}

@Injectable()
export class CloneMutateService {
  private readonly logger = new Logger(CloneMutateService.name);

  /** 已验证可玩的游戏语料库(随自研游戏增多而增长 → 组合空间变大)。 */
  private readonly corpus: CorpusEntry[] = [
    { key: 'shooter', file: 'shooter/index.html', match: /射击|飞行|飞机|战机|雷电|打飞机|shoot|raid|space|弹幕/i, difficulties: ['easy', 'normal', 'hard'] },
    { key: 'match3', file: 'match3/index.html', match: /消除|消消乐|宝石|连连|三消|match|gem|puzzle|益智/i, difficulties: ['easy', 'normal', 'hard'] },
    { key: 'tetris', file: 'tetris/index.html', match: /方块|俄罗斯|tetris|block|堆叠/i, difficulties: ['normal'] },
    { key: 'breakout', file: 'breakout/index.html', match: /弹球|打砖块|砖块|breakout|挡板|接球|arkanoid/i, difficulties: ['easy', 'normal', 'hard'] },
    { key: 'runner', file: 'runner/index.html', match: /跑酷|酷跑|跑步|奔跑|runner|无限跑|跳跃|障碍/i, difficulties: ['easy', 'normal', 'hard'] },
    { key: 'snake', file: 'snake/index.html', match: /贪吃蛇|蛇|snake|吃豆/i, difficulties: ['easy', 'normal', 'hard'] },
    { key: 'poker', file: 'poker/index.html', match: /扑克|纸牌|德州|梭哈|21点|发牌|poker|card|blackjack|赌/i, difficulties: ['easy', 'normal', 'hard'] },
    { key: 'towerdefense', file: 'towerdefense/index.html', match: /塔防|守城|防御|炮塔|tower|defen[cs]e|td|布防/i, difficulties: ['easy', 'normal', 'hard'] },
    { key: 'rhythm', file: 'rhythm/index.html', match: /节奏|音乐|音游|打节拍|鼓点|钢琴块|rhythm|music|beat|tap/i, difficulties: ['easy', 'normal', 'hard'] },
    { key: 'racing', file: 'racing/index.html', match: /赛车|飞车|赛跑|开车|躲车|竞速|racing|race|car|drive|drift/i, difficulties: ['easy', 'normal', 'hard'] },
  ];

  /** 是否有匹配玩家描述的语料模板(决定是否走 clone-mutate)。 */
  matchBase(prompt: string): CorpusEntry | null {
    const text = prompt || '';
    return this.corpus.find((c) => c.match.test(text)) || null;
  }

  /**
   * 生成一个可玩变体。优先按 prompt 匹配基底;无匹配时按 fallback 关键字或随机选一个。
   * 返回自包含 HTML(已注入配置)。读不到模板文件 → 返回 null(调用方降级)。
   */
  async generateVariant(title: string, prompt: string): Promise<CloneMutateResult | null> {
    const base = this.matchBase(prompt) || this.matchBase(title);
    if (!base) return null;
    let raw: string;
    try {
      raw = await fs.readFile(this.resolveTemplatePath(base.file), 'utf8');
    } catch (e: any) {
      this.logger.warn(`clone-mutate template read failed (${base.file}): ${e?.message || e}`);
      return null;
    }
    const config = this.sampleConfig(base, title, prompt);
    const inject = `<script>window.__GAME_CONFIG=${JSON.stringify(config)};</script>`;
    // 在第一个 <script> 之前注入配置(模板内脚本读取它)。
    const idx = raw.indexOf('<script>');
    const html = idx >= 0 ? raw.slice(0, idx) + inject + '\n' + raw.slice(idx) : inject + raw;
    return { html, baseKey: base.key, config };
  }

  /** 模板文件位置:backend/games-authored/<file>(运行期 cwd=backend)。 */
  private resolveTemplatePath(file: string): string {
    return join(process.cwd(), 'games-authored', file);
  }

  /** 由 prompt + 随机采样一套配置(标题/难度);旋钮不破坏可玩性。 */
  private sampleConfig(base: CorpusEntry, title: string, prompt: string): Record<string, unknown> {
    const text = `${title} ${prompt}`;
    // 难度:描述含"难/地狱/hard"→hard;"简单/休闲/easy"→easy;否则随机。
    let difficulty: string;
    if (/地狱|很难|困难|hard|挑战|hardcore/i.test(text)) difficulty = 'hard';
    else if (/简单|休闲|轻松|easy|新手|casual/i.test(text)) difficulty = 'easy';
    else difficulty = base.difficulties[Math.floor(Math.random() * base.difficulties.length)];
    if (base.difficulties.indexOf(difficulty) < 0) difficulty = base.difficulties[0];
    return {
      title: (title || '').slice(0, 40) || undefined,
      difficulty,
      seed: Math.floor(Math.random() * 1e9),
      base: base.key,
    };
  }
}
