import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CreationGameBundleEntity } from '../entities/creation-game-bundle.entity';
import { BedrockIntegrationService } from '../../ai-integration/bedrock/bedrock-integration.service';
import { LlmCompletionService } from '../../ai-provider/llm-completion.service';
import { AiProviderService } from '../../ai-provider/ai-provider.service';
import { CloneMutateService } from './clone-mutate.service';
import { GamePlaytestService } from './game-playtest.service';
import { User } from '../../../entities/user.entity';
import { AgentAccount } from '../../../entities/agent-account.entity';
import { pickTemplateByPrompt, renderTemplate } from './game-templates';

/** HTML 大小上限(防超大产物撑爆 WebView / 传输)。 */
const MAX_HTML = 220_000;
const MIN_HTML = 200;

/** 平台档位默认模型(友好名;Bedrock resolveModelId 自动映射)。仅"无 BYO"用户走平台。 */
const FREE_MODEL = 'claude-haiku-4-5';
const PRO_DEFAULT_MODEL = 'claude-sonnet-4-6';

/**
 * 外链/嵌入游戏的域名白名单(快速扩库:开源库 / 分发网络 / 受信主机)。
 * 仅注册期校验来源合规;只允许 https。后缀匹配(host === d || host.endsWith('.'+d))。
 * 生产可逐步收敛/扩充,或改为后台可配置。
 */
const GAME_EMBED_ALLOWLIST: string[] = [
  // 自托管(开源游戏迁到我们自己的域名,更稳更合规)
  'agentrix.top',
  'api.agentrix.top',
  // 开源游戏官方演示(GitHub Pages 等)
  'github.io',
  'hextris.io',
  'play2048.co',
  'gabrielecirulli.github.io',
  // 分发网络(官方 embed,后续接 SDK/分成)
  'gamedistribution.com',
  'html5.gamedistribution.com',
  'cdn.gamedistribution.com',
  'crazygames.com',
  'games.crazygames.com',
  'gamemonetize.com',
  'html5.gamemonetize.com',
  'poki.com',
  'games.poki.com',
  'itch.io',
  'itch.zone',
  'html-classic.itch.zone',
];

/** 解析出的 embed 来源分类(展示/归因)。 */
type EmbedProvider = 'opensource' | 'distribution' | 'upload' | string;

type Tier = 'free' | 'pro' | 'business' | 'enterprise';

/** 校验结果。 */
export interface GameHtmlValidation {
  ok: boolean;
  reason?: string;
}

/**
 * CreationGameService — game 创作的可玩 HTML5 产物生成/存取(方案 A)。
 *
 * 主路径:LLM 生成自包含 HTML(canvas/JS);校验不过 → 内置模板兜底(保证可玩)。
 * 安全:服务端做"无外联/无 iframe/无 cookie 外泄"等防御性静态校验;运行期真正的
 * 沙箱由客户端 WebView 施加(CSP/无 token/无任意网络)。
 *
 * LLM 依赖 {@link BedrockIntegrationService} 设为 @Optional —— 未注入(单测/降级)时
 * 直接走模板兜底,闭环不依赖模型可用性。
 */
@Injectable()
export class CreationGameService {
  private readonly logger = new Logger(CreationGameService.name);

  constructor(
    @InjectRepository(CreationGameBundleEntity)
    private readonly repo: Repository<CreationGameBundleEntity>,
    @Optional() private readonly bedrock?: BedrockIntegrationService,
    @Optional() private readonly llm?: LlmCompletionService,
    @Optional() private readonly aiProvider?: AiProviderService,
    @Optional() private readonly cloneMutate?: CloneMutateService,
    @Optional() private readonly playtest?: GamePlaytestService,
    @Optional()
    @InjectRepository(User)
    private readonly userRepo?: Repository<User>,
    @Optional()
    @InjectRepository(AgentAccount)
    private readonly agentRepo?: Repository<AgentAccount>,
  ) {}

  // ── 外链/嵌入游戏(快速扩库:自上传 / 分发网络 / 开源库)──────────────

  /** 校验 embed URL:必须 https + host 命中白名单。返回归一化 URL 与来源分类,否则 null。 */
  validateEmbedUrl(rawUrl: string): { url: string; provider: EmbedProvider } | null {
    let u: URL;
    try {
      u = new URL((rawUrl || '').trim());
    } catch {
      return null;
    }
    if (u.protocol !== 'https:') return null;
    const host = u.hostname.toLowerCase();
    const matched = GAME_EMBED_ALLOWLIST.find((d) => host === d || host.endsWith('.' + d));
    if (!matched) return null;
    // 来源分类(展示/归因)。
    let provider: EmbedProvider = host;
    if (/agentrix\.top$/.test(host)) provider = 'opensource';
    else if (/github\.io$|hextris\.io$|play2048\.co$|gabrielecirulli/.test(host)) provider = 'opensource';
    else if (/gamedistribution|crazygames|gamemonetize|poki/.test(host)) provider = 'distribution';
    else if (/itch\.io$|itch\.zone$/.test(host)) provider = 'opensource';
    return { url: u.toString(), provider };
  }

  /** 该用户是否拥有此创作(owner 校验:AgentAccount.ownerId === userId)。 */
  async userOwnsCreation(userId: string | undefined, ownerAccountId: string): Promise<boolean> {
    if (!userId || !this.agentRepo) return false;
    try {
      const acct = await this.agentRepo.findOne({ where: { id: ownerAccountId } });
      return acct?.ownerId === userId;
    } catch {
      return false;
    }
  }

  /**
   * 把一个外链/嵌入网页游戏设为创作的当前可玩包(source='embed')。
   * URL 必须通过 {@link validateEmbedUrl}(https + 白名单)。版本单调递增。
   */
  async setEmbedGame(
    creationId: string,
    rawUrl: string,
    title: string,
    provider?: EmbedProvider,
  ): Promise<CreationGameBundleEntity> {
    const v = this.validateEmbedUrl(rawUrl);
    if (!v) {
      throw new Error('EMBED_URL_REJECTED: must be https and from an allowlisted domain');
    }
    return this.saveEmbedBundle(creationId, v.url, title, provider || v.provider);
  }

  /**
   * 用户自助导入「自己网站上的游戏」(任意 https URL,非白名单)。
   * 安全:仅 https;拒绝 localhost / 内网 / 链路本地 / 云元数据等(防 SSRF);WebView 侧已沙箱化。
   * provider='import',与白名单来源区分;内容审核(恶意/侵权)由运营/后续审核流程兜底。
   */
  async importGame(
    creationId: string,
    rawUrl: string,
    title: string,
  ): Promise<CreationGameBundleEntity> {
    const url = this.validateImportUrl(rawUrl);
    if (!url) {
      throw new Error('IMPORT_URL_REJECTED: must be a public https URL');
    }
    return this.saveEmbedBundle(creationId, url, title, 'import');
  }

  /** 校验用户导入 URL:必须 https + 公网主机(拒内网/本机/云元数据)。返回归一化 URL 或 null。 */
  validateImportUrl(rawUrl: string): string | null {
    let u: URL;
    try { u = new URL((rawUrl || '').trim()); } catch { return null; }
    if (u.protocol !== 'https:') return null;
    const host = u.hostname.toLowerCase();
    // 拒绝本机/内网/链路本地/云元数据(SSRF 防护)。
    if (
      host === 'localhost' || host === '0.0.0.0' || host.endsWith('.local') ||
      host === '::1' || host === '169.254.169.254' ||
      /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^169\.254\./.test(host) ||
      /^(fc|fd)[0-9a-f]{2}:/i.test(host) || /^fe80:/i.test(host)
    ) return null;
    // 至少要有一个点的域名(或合法公网 IP)。粗略放行,细化审核交内容审核环节。
    if (!host.includes('.') && !host.includes(':')) return null;
    return u.toString();
  }

  /** 共用:创建/递增 embed 包(source='embed')。 */
  private async saveEmbedBundle(
    creationId: string,
    url: string,
    title: string,
    provider: EmbedProvider,
  ): Promise<CreationGameBundleEntity> {
    const prev = await this.getCurrentBundle(creationId);
    const version = (prev?.version ?? 0) + 1;
    const entity = this.repo.create({
      creationId,
      version,
      title: title || 'Web Game',
      engine: 'embed-web',
      source: 'embed',
      html: '', // embed 无内联 html
      url,
      provider,
      prompt: null,
      modelUsed: null,
    });
    return this.repo.save(entity);
  }

  /**
   * 决定"无 BYO 用户"的平台默认模型(友好名)。
   *   - free 档 → 平台 haiku-4-5(封顶;前端提示能力有限)。
   *   - pro+ 档 → 平台 sonnet(强于 haiku)。
   * 注:有 BYO 配置的用户由 LlmCompletionService 直接用其自己的 provider/模型,本值被忽略。
   * 永不抛错:异常按 free 处理。
   */
  async resolvePlatformModel(userId?: string): Promise<string> {
    if (!userId) return PRO_DEFAULT_MODEL;
    let tier: Tier = 'free';
    try {
      const user = await this.userRepo?.findOne({ where: { id: userId } });
      const raw = (user?.metadata as any)?.preferences?.subscriptionTier;
      if (raw === 'pro' || raw === 'business' || raw === 'enterprise') tier = raw;
    } catch { /* default free */ }
    return tier === 'free' ? FREE_MODEL : PRO_DEFAULT_MODEL;
  }

  /** 防御性静态校验:自包含、无外联、无明显越权。 */
  validateGameHtml(html: unknown): GameHtmlValidation {
    if (typeof html !== 'string') return { ok: false, reason: 'not a string' };
    const s = html.trim();
    if (s.length < MIN_HTML) return { ok: false, reason: 'too short' };
    if (s.length > MAX_HTML) return { ok: false, reason: 'too large' };
    const lower = s.toLowerCase();
    if (!lower.includes('<html') && !lower.includes('<!doctype')) return { ok: false, reason: 'not an html document' };
    if (!lower.includes('<canvas') && !lower.includes('<script')) return { ok: false, reason: 'no game runtime markers' };
    // 安全:禁外联脚本/iframe/网络/cookie 外泄(自包含离线游戏不需要这些)。
    const forbidden = [
      '<iframe',
      'document.cookie',
      'xmlhttprequest',
      'navigator.sendbeacon',
      'window.parent',
      'window.top',
      'src="http',
      "src='http",
      'import(',
    ];
    for (const f of forbidden) {
      if (lower.includes(f)) return { ok: false, reason: `forbidden token: ${f}` };
    }
    // 允许 localStorage(WebView 内隔离的本地分数);但禁止 fetch 到外部 http(s)。
    if (/fetch\s*\(\s*['"`]https?:/i.test(s)) return { ok: false, reason: 'external fetch' };
    return { ok: true };
  }

  /** 从 LLM 文本里抽取完整 HTML 文档(去 markdown 围栏 + 截取 <!doctype/<html>…</html>)。 */
  extractHtml(text: string): string | null {
    if (!text) return null;
    let t = text.trim();
    // 去 ```html ... ``` / ``` ... ``` 围栏。
    const fence = t.match(/```(?:html)?\s*([\s\S]*?)```/i);
    if (fence) t = fence[1].trim();
    const lower = t.toLowerCase();
    const start = lower.indexOf('<!doctype');
    const startHtml = lower.indexOf('<html');
    const from = start >= 0 ? start : startHtml;
    if (from < 0) return null;
    const endIdx = lower.lastIndexOf('</html>');
    if (endIdx < 0) return null;
    return t.slice(from, endIdx + '</html>'.length);
  }

  /** 构造生成 prompt:强约束"只输出自包含 HTML 游戏"。 */
  buildPrompt(title: string, description: string): string {
    return [
      'You are an expert HTML5 mini-game generator.',
      'Produce a COMPLETE, SELF-CONTAINED, single-file HTML document for a small, fun, PLAYABLE mobile game.',
      '',
      'HARD REQUIREMENTS:',
      '- Output ONLY the HTML document. No prose, no markdown fences.',
      '- Everything inline: one <html> with inline <style> and inline <script>. NO external scripts, NO CDNs, NO network calls (no fetch/XHR/iframe), NO external images. Use canvas drawing, CSS, emoji, or generated shapes for visuals.',
      '- Mobile-first PORTRAIT layout; TOUCH controls (tap/swipe/drag) as primary input; also accept arrow keys.',
      '- Dark theme background (#0e1016). Show a score and a clearly visible "restart" button. Handle game-over.',
      '- Keep it lightweight: 2D canvas or DOM only; no heavy assets; runs smoothly on low-end Android WebView.',
      '- Robust: must not crash on load; guard all timers/listeners.',
      '- IMPORTANT: keep the whole file COMPACT (target under ~12KB) and COMPLETE — it MUST end with </html>. Do not get cut off.',
      '',
      `GAME TITLE: ${title || 'Mini Game'}`,
      `PLAYER DESCRIPTION: ${description || title || 'a simple casual arcade game'}`,
      '',
      'Return the full HTML now:',
    ].join('\n');
  }

  /** 自修复 prompt:把上一版产物 + play-test/校验错误回灌,要求只改坏的地方并重新输出完整 HTML。 */
  buildRepairPrompt(title: string, description: string, prevHtml: string, reason: string): string {
    return [
      'You previously generated an HTML5 mini-game, but it FAILED an automated play-test.',
      `FAILURE REASON: ${reason}`,
      '',
      'Fix the bug and return a CORRECTED, COMPLETE, SELF-CONTAINED single-file HTML document.',
      'Keep the same game concept. Common causes: the script was truncated (must end properly and the file must end with </html>), a ReferenceError from a misspelled/undeclared variable, calling a method on null (guard getElementById results), or an unterminated string/bracket.',
      'HARD REQUIREMENTS (unchanged): output ONLY the HTML (no markdown fences); everything inline; no external scripts/CDNs/network/iframe/images; mobile-first portrait; touch + arrow-key input; visible score and restart button; must not throw on load or during the animation loop.',
      '',
      `GAME TITLE: ${title || 'Mini Game'}`,
      `PLAYER DESCRIPTION: ${description || title || 'a simple casual arcade game'}`,
      '',
      'PREVIOUS (BROKEN) VERSION:',
      prevHtml.slice(0, 60_000),
      '',
      'Return the corrected full HTML now:',
    ].join('\n');
  }

  /**
   * 自由 codegen 产物的可玩性把关:跑 play-test;不过→回灌错误让 LLM 修一次→再跑。
   * 返回通过校验+play-test 的 HTML(及是否经过修复);两次都不过 → null(调用方退场降级)。
   * 未注入 playtest 服务时不阻断(已过静态校验)→ 原样返回。
   */
  private async verifyOrRepair(
    html: string,
    title: string,
    description: string,
    userId: string | undefined,
    platformModel: string,
  ): Promise<{ html: string; repaired: boolean } | null> {
    if (!this.playtest) return { html, repaired: false };

    let pt = await this.playtest.playtest(html);
    if (pt.ok) {
      this.logger.log(`play-test PASS (frames=${pt.frames})`);
      return { html, repaired: false };
    }
    this.logger.warn(`play-test FAIL: ${pt.reason}; attempting one self-repair.`);

    // 自修复一次(仅当有 LLM)。
    if (!this.llm) return null;
    try {
      const res = await this.llm.complete({
        userId,
        prompt: this.buildRepairPrompt(title, description, html, pt.reason || 'failed play-test'),
        maxTokens: 16000,
        platformModel,
        timeoutMs: 240_000,
      });
      const fixed = this.extractHtml(res.text ?? '');
      const v = this.validateGameHtml(fixed);
      if (!fixed || !v.ok) {
        this.logger.warn(`self-repair output rejected by static validation (${v.reason ?? 'no html'}).`);
        return null;
      }
      pt = await this.playtest.playtest(fixed);
      if (pt.ok) {
        this.logger.log(`play-test PASS after repair (frames=${pt.frames}).`);
        return { html: fixed, repaired: true };
      }
      this.logger.warn(`play-test still FAIL after repair: ${pt.reason}; retiring.`);
      return null;
    } catch (e: any) {
      this.logger.warn(`self-repair failed: ${e?.message ?? e}; retiring.`);
      return null;
    }
  }

  /** 取某创作的当前(最新版本)游戏包。 */
  async getCurrentBundle(creationId: string): Promise<CreationGameBundleEntity | null> {
    return this.repo.findOne({
      where: { creationId },
      order: { version: 'DESC' },
    });
  }

  /**
   * 为创作生成并存储一个可玩游戏包。LLM 成功且通过校验 → source='llm';
   * 否则关键词匹配内置模板兜底 → source='template'。返回存储后的包。
   */
  async generateForCreation(
    creationId: string,
    title: string,
    description: string,
    userId?: string,
  ): Promise<CreationGameBundleEntity> {
    let html: string | null = null;
    let source: 'llm' | 'template' = 'template';
    let modelUsed: string | null = null;

    // 0) 克隆-变异(可靠引擎):描述匹配已验证语料(射击/消除/方块…)→ 直接产出
    //    参数化变体(保证可玩 + 难度/标题变异),不靠 LLM 碰运气。
    if (this.cloneMutate) {
      try {
        const variant = await this.cloneMutate.generateVariant(title, description || title);
        if (variant && this.validateGameHtml(variant.html).ok !== false) {
          const prev0 = await this.getCurrentBundle(creationId);
          const v0 = (prev0?.version ?? 0) + 1;
          const ent0 = this.repo.create({
            creationId, version: v0, title: title || 'Mini Game',
            engine: 'html5-canvas', source: 'llm', html: variant.html,
            prompt: description || null, modelUsed: `clone-mutate:${variant.baseKey}`,
          });
          this.logger.log(`Game via clone-mutate base=${variant.baseKey} cfg=${JSON.stringify(variant.config)}`);
          return this.repo.save(ent0);
        }
      } catch (e: any) {
        this.logger.warn(`clone-mutate failed: ${e?.message ?? e}; falling back to LLM/template.`);
      }
    }

    // 优先用户 BYO(任意 provider:Anthropic/OpenAI/Gemini/Bedrock...);无 BYO 才用平台模型。
    if (this.llm) {
      const platformModel = await this.resolvePlatformModel(userId);
      try {
        const res = await this.llm.complete({
          userId,
          prompt: this.buildPrompt(title, description),
          maxTokens: 16000,
          platformModel,
          timeoutMs: 240_000,
        });
        this.logger.log(`Game gen via ${res.provider} model=${res.modelUsed} byo=${res.byo}`);
        let extracted = this.extractHtml(res.text ?? '');
        const v = this.validateGameHtml(extracted);
        if (extracted && v.ok) {
          // 自由 codegen 必须过 play-test(真跑若干帧);不过则回灌错误自修复一次。
          const verified = await this.verifyOrRepair(extracted, title, description, userId, platformModel);
          if (verified) {
            html = verified.html;
            source = 'llm';
            modelUsed = verified.repaired ? `${res.modelUsed}+repair` : res.modelUsed;
          } else {
            this.logger.warn(`LLM game gen failed play-test (even after repair) [model=${res.modelUsed}]; retiring -> clone-mutate/template.`);
          }
        } else {
          this.logger.warn(`LLM game gen rejected (${v.reason ?? 'no html'}) [model=${res.modelUsed}, byo=${res.byo}]; falling back to template.`);
        }
      } catch (e: any) {
        this.logger.warn(`LLM game gen failed: ${e?.message ?? e}; falling back to template.`);
      }
    } else if (this.bedrock) {
      // 无 LlmCompletionService(单测/降级)→ 直接平台 Bedrock。
      try {
        const platformModel = await this.resolvePlatformModel(userId);
        const raw = await this.bedrock.invokeModel(this.buildPrompt(title, description), platformModel, undefined, 16000);
        const extracted = this.extractHtml(raw ?? '');
        const v = this.validateGameHtml(extracted);
        if (extracted && v.ok) {
          html = extracted;
          source = 'llm';
          modelUsed = platformModel;
        } else {
          this.logger.warn(`LLM game gen rejected (${v.reason ?? 'no html'}); falling back to template.`);
        }
      } catch (e: any) {
        this.logger.warn(`LLM game gen failed: ${e?.message ?? e}; falling back to template.`);
      }
    }

    if (!html) {
      html = renderTemplate(pickTemplateByPrompt(description || title || ''));
      source = 'template';
      modelUsed = null;
    }

    const prev = await this.getCurrentBundle(creationId);
    const version = (prev?.version ?? 0) + 1;
    const entity = this.repo.create({
      creationId,
      version,
      title: title || 'Mini Game',
      engine: 'html5-canvas',
      source,
      html,
      prompt: description || null,
      modelUsed,
    });
    return this.repo.save(entity);
  }
}
