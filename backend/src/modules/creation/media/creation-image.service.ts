import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { promises as fs } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

import { CreationRepository } from '../creation.repository';
import { CreationGameBundleEntity } from '../entities/creation-game-bundle.entity';
import {
  BedrockIntegrationService,
  BedrockUserCredentials,
} from '../../ai-integration/bedrock/bedrock-integration.service';
import { AiProviderService } from '../../ai-provider/ai-provider.service';
import type { CreationType } from '../../../../shared/types/creation';
import type { DramaStory } from '../../../../shared/types/drama';
import { DRAMA_ENGINE } from '../drama/creation-drama.service';

/** 托管目录(由 main.ts useStaticAssets('uploads', '/api/uploads/') 暴露)。 */
const MEDIA_SUBDIR = 'creation-media';

/** 封面竖版尺寸(512x768，2:3，比 768x1152 更省图像额度）。 */
const COVER_W = 512;
const COVER_H = 768;

/** 类型 -> 封面美术风格提示词片段。 */
const TYPE_STYLE: Record<CreationType, string> = {
  game: 'vibrant playful mobile game key art, bright saturated colors, fun, polished, appealing',
  drama: 'beautiful cinematic poster art, warm tasteful lighting, emotional and romantic, elegant, appealing, tasteful',
  shop: 'clean modern storefront brand art, product hero, bright and inviting',
  livestream: 'energetic live broadcast thumbnail, neon, dynamic, friendly',
  stage: 'concert stage poster, colorful spotlights, performance, festive',
  place: 'beautiful illustrated location, atmospheric, warm, inviting',
};

/** 全局负向提示词：杜绝恐怖/血腥/惊悚/低质，避免"封面像恐怖片"。 */
const SAFE_NEGATIVE =
  'horror, scary, creepy, frightening, gore, blood, zombie, monster, ghost, skull, disturbing, dark horror, grotesque, nsfw, violence, text, letters, words, watermark, logo, ugly, blurry, deformed, low quality';

/** 互动剧场景 bg 关键字 -> 画面提示词（电影感但不惊悚）。 */
const DRAMA_BG_PROMPT: Record<string, string> = {
  night: 'quiet city street at night, soft glowing lights, cinematic, calm and atmospheric',
  rain: 'gentle rainy evening in the city, soft reflections on wet streets, cinematic mood',
  sunset: 'warm golden-hour city skyline, hopeful and romantic, cinematic',
  office: 'modern office at night with city lights through the window, cinematic',
  cafe: 'cozy warm cafe at night, soft inviting light, cinematic',
};

/**
 * CreationImageService — AI 出图管线（封面 + 互动剧场景图）。
 *
 * 默认走免费 Pollinations(FLUX)；失败回退到 BYO/平台 Bedrock 图像模型
 * (Titan/Nova/Stability，Sonnet 本身不能出图)。生成 PNG -> 落盘到 uploads/ ->
 * 返回 https URL。失败优雅抛错，调用方降级回渐变封面。
 *
 *   - generateCover：为创作生成竖版封面，写入 creation.preview。
 *   - illustrateDrama：为互动剧生成封面 + 每集主场景图，回写 scene.bg = URL。
 */
@Injectable()
export class CreationImageService {
  private readonly logger = new Logger(CreationImageService.name);
  /** 公网可访问的 API 基址(uploads 静态资源前缀在其下)。 */
  private readonly publicBase = (process.env.PUBLIC_API_URL || 'https://api.agentrix.top').replace(/\/+$/, '');

  constructor(
    private readonly repo: CreationRepository,
    private readonly bedrock: BedrockIntegrationService,
    @InjectRepository(CreationGameBundleEntity)
    private readonly bundleRepo: Repository<CreationGameBundleEntity>,
    @Optional() private readonly aiProvider?: AiProviderService,
  ) {}

  /** 解析用户 BYO AWS Bedrock 凭据；非 bedrock provider / 无凭据 -> undefined。 */
  private async resolveBedrockCreds(userId?: string): Promise<BedrockUserCredentials | undefined> {
    if (!userId || !this.aiProvider) return undefined;
    try {
      const cfg = await this.aiProvider.getDefaultConfig(userId);
      if (!cfg) return undefined;
      const pid = cfg.providerId;
      if (pid !== 'aws-bedrock' && pid !== 'aws-bedrock-byok') return undefined;
      const creds = await this.aiProvider.getDecryptedKey(userId, pid);
      if (!creds?.apiKey || !creds.secretKey) return undefined;
      return {
        accessKeyId: creds.apiKey,
        secretAccessKey: creds.secretKey,
        region: creds.region || 'us-east-1',
      };
    } catch {
      return undefined;
    }
  }

  /** 生成图片(Pollinations 免费优先 -> Bedrock 回退)并落盘，返回 https URL。 */
  async generateAndHost(
    prompt: string,
    userId?: string,
    opts?: { width?: number; height?: number; negativePrompt?: string },
  ): Promise<string> {
    const width = opts?.width ?? COVER_W;
    const height = opts?.height ?? COVER_H;
    const provider = (process.env.IMAGE_PROVIDER || 'auto').toLowerCase();

    if (provider === 'pollinations' || provider === 'auto') {
      try {
        const base64 = await this.generateViaPollinations(prompt, width, height);
        return this.hostPng(base64);
      } catch (e: any) {
        this.logger.warn(`Pollinations image failed: ${e?.message || e}`);
        if (provider === 'pollinations') throw e;
      }
    }

    const userCredentials = await this.resolveBedrockCreds(userId);
    const base64 = await this.bedrock.generateImage(prompt, {
      userCredentials,
      width,
      height,
      negativePrompt: opts?.negativePrompt,
    });
    return this.hostPng(base64);
  }

  /**
   * 免费出图：Pollinations(FLUX)。GET /image/<text> 直接返回图片字节。
   * 设置 POLLINATIONS_API_KEY 走注册档(免费/付费)；尊重 HTTPS_PROXY。
   */
  private async generateViaPollinations(prompt: string, width: number, height: number): Promise<string> {
    const seed = Math.floor(Math.random() * 1_000_000_000);
    const enc = encodeURIComponent((prompt || '').slice(0, 1500));
    const params = new URLSearchParams({
      width: String(width),
      height: String(height),
      seed: String(seed),
      nologo: 'true',
      model: process.env.POLLINATIONS_MODEL || 'flux',
      referrer: 'agentrix',
    });
    const url = `https://gen.pollinations.ai/image/${enc}?${params.toString()}`;
    const headers: Record<string, string> = { 'User-Agent': 'Agentrix/1.0' };
    const key = process.env.POLLINATIONS_API_KEY;
    if (key) headers.Authorization = `Bearer ${key}`;
    const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
    const resp = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 120_000,
      headers,
      proxy: false,
      ...(proxy ? { httpsAgent: new HttpsProxyAgent(proxy) } : {}),
    });
    const buf = Buffer.from(resp.data);
    if (buf.length < 1000) throw new Error('Pollinations returned a too-small/empty image');
    return buf.toString('base64');
  }

  /** base64 PNG -> uploads/creation-media/<uuid>.png -> https URL。 */
  private async hostPng(base64: string): Promise<string> {
    const dir = join(process.cwd(), 'uploads', MEDIA_SUBDIR);
    await fs.mkdir(dir, { recursive: true });
    const file = `${randomUUID()}.png`;
    await fs.writeFile(join(dir, file), Buffer.from(base64, 'base64'));
    return `${this.publicBase}/api/uploads/${MEDIA_SUBDIR}/${file}`;
  }

  /** 为创作生成竖版封面并写入 preview。返回封面 URL。 */
  async generateCover(creationId: string, userId?: string): Promise<string> {
    const creation = await this.repo.findById(creationId);
    if (!creation) throw new NotFoundException(`Creation not found: ${creationId}`);
    const style = TYPE_STYLE[creation.type] ?? TYPE_STYLE.game;
    const prompt = [
      `Cover art for "${creation.title}".`,
      creation.summary ? `Theme: ${creation.summary}.` : '',
      style,
      'vertical 2:3 poster composition, centered subject, rich tasteful colors, family-friendly, no text.',
    ].filter(Boolean).join(' ');

    const url = await this.generateAndHost(prompt, userId, { width: COVER_W, height: COVER_H, negativePrompt: SAFE_NEGATIVE });
    creation.preview = { kind: 'cover', url, width: COVER_W, height: COVER_H };
    await this.repo.save(creation);
    this.logger.log(`Cover generated for creation ${creationId}: ${url}`);
    return url;
  }

  /**
   * 为互动剧生成封面 + 每集主场景图，回写故事 bundle 的 scene.bg = URL。
   * 为控成本/时延：封面 1 张 + 每集第一个场景 1 张（通常 3 张）。
   */
  async illustrateDrama(
    creationId: string,
    userId?: string,
  ): Promise<{ coverUrl: string | null; sceneImages: number }> {
    const bundle = await this.bundleRepo.findOne({ where: { creationId }, order: { version: 'DESC' } });
    if (!bundle || bundle.engine !== DRAMA_ENGINE) {
      throw new NotFoundException('该创作不是互动剧。');
    }
    let story: DramaStory;
    try { story = JSON.parse(bundle.html) as DramaStory; }
    catch { throw new NotFoundException('互动剧故事损坏。'); }

    let coverUrl: string | null = null;
    try { coverUrl = await this.generateCover(creationId, userId); } catch (e: any) {
      this.logger.warn(`drama cover gen failed: ${e?.message || e}`);
    }

    let count = 0;
    const firstSceneByEpisode = new Map<number, string>();
    for (const sc of story.scenes) {
      if (!firstSceneByEpisode.has(sc.episode)) firstSceneByEpisode.set(sc.episode, sc.id);
    }
    for (const [, sceneId] of firstSceneByEpisode) {
      const sc = story.scenes.find((s) => s.id === sceneId);
      if (!sc) continue;
      const bgKey = sc.bg && !/^https?:/i.test(sc.bg) ? sc.bg : undefined;
      const moodPrompt = (bgKey && DRAMA_BG_PROMPT[bgKey]) || 'beautiful cinematic scene, soft cinematic lighting, romantic mood';
      const prompt = `Cinematic vertical still for a romance/drama story "${story.title}". Scene: ${moodPrompt}. Tasteful, beautiful, emotional, film-grade color, family-friendly. No text.`;
      try {
        const url = await this.generateAndHost(prompt, userId, { width: COVER_W, height: COVER_H, negativePrompt: SAFE_NEGATIVE });
        sc.bg = url;
        count += 1;
      } catch (e: any) {
        this.logger.warn(`drama scene image failed (${sceneId}): ${e?.message || e}`);
      }
    }

    if (count > 0) {
      const version = (bundle.version ?? 0) + 1;
      await this.bundleRepo.save(this.bundleRepo.create({
        creationId, version, title: bundle.title, engine: DRAMA_ENGINE,
        source: 'llm', html: JSON.stringify(story), prompt: bundle.prompt, modelUsed: 'drama-vn+art',
      }));
    }
    return { coverUrl, sceneImages: count };
  }
}
