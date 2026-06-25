/**
 * Creator Studio Service — Unified entry point for all creative tasks.
 *
 * Registered as the `creator_studio` tool in skill-executor. Routes tasks
 * to the appropriate executor based on action type and device availability:
 *
 *   - Cloud actions (pet_3d, video, photo_to_3d, scan_to_3d): Execute on backend
 *   - Desktop-preferred actions (poster, ppt, skin_list): Route to desktop if online
 *   - Mobile-only actions (nft_mint): Route to mobile for signing
 *
 * @see .kiro/specs/creator-studio-mvp/design.md
 */
import { Injectable, Logger } from '@nestjs/common';
import { PetGenerationService } from '../pet-generation/pet-generation.service';
import { DesktopSyncService } from '../desktop-sync/desktop-sync.service';
import { emitDesktopSyncEvent } from '../desktop-sync/desktop-sync.events';
import { emitAgentSyncEvent } from '../agent-intelligence/agent-sync.events';
import type { ExecutionContext } from '../skill/skill-executor.service';

// ============================================================
// Types
// ============================================================

export type CreatorAction =
  | 'poster'         // Generate marketing poster (PNG)
  | 'ppt'            // Generate presentation (.pptx)
  | 'video'          // Generate video (multi-scene)
  | 'pet_3d'         // Text/image → 3D pet (alias for pet_generate)
  | 'pet_variants'   // Generate multi-form variants
  | 'skin_list'      // List skin on marketplace
  | 'nft_mint'       // Mint NFT (requires mobile signing)
  | 'photo_to_3d'    // Single photo → 3D
  | 'scan_to_3d';    // Multi-view scan → 3D

type ExecutionTarget = 'cloud' | 'desktop' | 'mobile';

interface ActionRouting {
  target: ExecutionTarget;
  fallback?: ExecutionTarget;
  description: string;
}

const ACTION_ROUTING: Record<CreatorAction, ActionRouting> = {
  poster:       { target: 'desktop', fallback: 'cloud', description: 'Generate marketing poster' },
  ppt:          { target: 'desktop', fallback: 'cloud', description: 'Generate presentation slides' },
  video:        { target: 'cloud',                      description: 'Generate video (multi-scene composition)' },
  pet_3d:       { target: 'cloud',                      description: 'Generate 3D pet from text/image' },
  pet_variants: { target: 'cloud',                      description: 'Generate multi-form pet variants' },
  skin_list:    { target: 'desktop', fallback: 'cloud', description: 'List skin on marketplace' },
  nft_mint:     { target: 'mobile',                     description: 'Mint NFT (requires wallet signature)' },
  photo_to_3d:  { target: 'cloud',                      description: 'Transform photo into 3D model' },
  scan_to_3d:   { target: 'cloud',                      description: 'Multi-view scan to 3D reconstruction' },
};

export interface CreatorStudioParams {
  action: CreatorAction;
  // Poster params
  title?: string;
  subtitle?: string;
  bullets?: string[];
  cta?: string;
  template?: string;
  size?: string;
  primaryColor?: string;
  // PPT params
  topic?: string;
  pages?: number;
  slides?: Array<{ title: string; bullets?: string[]; layout?: string }>;
  style?: string;
  // Pet/3D params
  prompt?: string;
  mode?: string;
  provider?: string;
  referenceImageUrl?: string;
  imageUrl?: string;
  scanImageUrls?: string[];
  // Variant params
  parentSkinId?: string;
  modes?: string[];
  // Marketplace params
  skinId?: string;
  price?: number;
  priceCurrency?: string;
  description?: string;
  clan?: string;
  tags?: string[];
  // NFT params
  chain?: string;
  // Generic
  [key: string]: unknown;
}

// ============================================================
// Service
// ============================================================

@Injectable()
export class CreatorStudioService {
  private readonly logger = new Logger(CreatorStudioService.name);

  constructor(
    private readonly petGenerationService: PetGenerationService,
    private readonly desktopSyncService: DesktopSyncService,
  ) {}

  /**
   * Main tool entry point. Called by skill-executor when LLM invokes `creator_studio`.
   */
  async executeTool(params: CreatorStudioParams, context: ExecutionContext): Promise<Record<string, unknown>> {
    const userId = context.userId;
    if (!userId) {
      throw new Error('creator_studio requires an authenticated user context');
    }

    const action = params.action;
    if (!action || !ACTION_ROUTING[action]) {
      return {
        error: true,
        message: `Unknown action: ${action}. Supported: ${Object.keys(ACTION_ROUTING).join(', ')}`,
        supportedActions: Object.entries(ACTION_ROUTING).map(([k, v]) => ({
          action: k,
          description: v.description,
          executesOn: v.target,
        })),
      };
    }

    const routing = ACTION_ROUTING[action];
    this.logger.log(`[creator_studio] action=${action} target=${routing.target} user=${userId}`);

    // Route based on action type
    switch (action) {
      // ── Cloud-executed actions ──────────────────────────────────
      case 'pet_3d':
      case 'photo_to_3d':
      case 'scan_to_3d':
        return this.handlePetGeneration(params, context);

      case 'pet_variants':
        return this.handlePetVariants(params, context);

      case 'video':
        return this.handleVideoGeneration(params, context);

      // ── Desktop-preferred actions ──────────────────────────────
      case 'poster':
      case 'ppt':
      case 'skin_list':
        return this.handleDesktopTask(action, params, context);

      // ── Mobile-only actions ────────────────────────────────────
      case 'nft_mint':
        return this.handleNftMint(params, context);

      default:
        return { error: true, message: `Action ${action} not yet implemented` };
    }
  }

  // ── Handlers ─────────────────────────────────────────────────────

  private async handlePetGeneration(
    params: CreatorStudioParams,
    context: ExecutionContext,
  ): Promise<Record<string, unknown>> {
    // Delegate to existing pet_generate tool
    const petParams: Record<string, unknown> = {
      mode: params.action === 'scan_to_3d' ? 'scan'
        : (params.mode || (params.referenceImageUrl || params.imageUrl ? 'image' : 'text')),
      prompt: params.prompt,
      provider: params.provider || 'meshy',
      style: params.style || 'chibi',
      referenceImageUrl: params.referenceImageUrl || params.imageUrl,
      scanImageUrls: params.scanImageUrls,
    };
    return this.petGenerationService.executeTool(petParams as any, context);
  }

  private async handlePetVariants(
    params: CreatorStudioParams,
    context: ExecutionContext,
  ): Promise<Record<string, unknown>> {
    const basePrompt = params.prompt || '';
    if (!basePrompt) {
      return { error: true, message: 'pet_variants requires a prompt describing the base pet' };
    }

    const modes = (params.modes || ['living', 'pro', 'economy']) as string[];
    const variantModifiers: Record<string, string> = {
      living: 'cute, round, chibi proportions, big eyes, curled up, soft glow, relaxed pose',
      pro: 'standing tall, sleek, glowing data streams, focused expression, holographic UI elements',
      economy: 'slightly plump, tiny top hat, holding glowing coin, satisfied smirk, golden accents',
    };

    const taskIds: string[] = [];
    for (const mode of modes) {
      const modifier = variantModifiers[mode] || '';
      const variantPrompt = `${basePrompt}. Form variant (${mode}): ${modifier}`;
      try {
        const result = await this.petGenerationService.executeTool({
          mode: 'text',
          prompt: variantPrompt,
          provider: params.provider || 'meshy',
          style: params.style || 'chibi',
          enableAnimation: true,
        } as any, context);
        if (result.taskId) taskIds.push(result.taskId as string);
      } catch (err: any) {
        this.logger.warn(`Variant ${mode} failed: ${err.message}`);
      }
    }

    return {
      accepted: true,
      async: true,
      action: 'pet_variants',
      modes,
      taskIds,
      message: `Submitted ${taskIds.length} variant generation tasks. Each takes ~60-90s. Use pet_generate with taskId to check status.`,
    };
  }

  private async handleVideoGeneration(
    params: CreatorStudioParams,
    context: ExecutionContext,
  ): Promise<Record<string, unknown>> {
    // Delegate to existing video_compose tool via skill executor
    // For now, return guidance
    return {
      accepted: false,
      action: 'video',
      message: 'Video generation is available via the video_compose tool. Use: video_compose({ script: "...", scenes: [...] })',
      hint: 'For a 60s video, provide 12 scene descriptions (5s each). The system will generate clips and compose them.',
    };
  }

  private async handleDesktopTask(
    action: CreatorAction,
    params: CreatorStudioParams,
    context: ExecutionContext,
  ): Promise<Record<string, unknown>> {
    const userId = context.userId!;

    // Check if user has a desktop device online
    const isDesktopOnline = await this.isDesktopOnline(userId);

    if (isDesktopOnline) {
      // Dispatch to desktop via DesktopSync command
      const commandPayload = {
        type: action,
        params: this.sanitizeParams(params),
      };

      // Emit as a desktop-sync command event
      emitDesktopSyncEvent(userId, 'desktop-sync:creator-task', {
        action,
        taskId: `creator-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        params: commandPayload.params,
        sessionId: context.sessionId,
        requestedAt: Date.now(),
      });

      return {
        accepted: true,
        async: true,
        action,
        executedOn: 'desktop',
        message: this.getDesktopMessage(action),
      };
    }

    // Desktop offline — execute on cloud (degraded mode)
    return this.handleCloudFallback(action, params, context);
  }

  private async handleNftMint(
    params: CreatorStudioParams,
    context: ExecutionContext,
  ): Promise<Record<string, unknown>> {
    const userId = context.userId!;

    // NFT minting requires mobile wallet signature
    // Push a notification to mobile to initiate the signing flow
    emitAgentSyncEvent(userId, 'agent:session_update', context.sessionId || '', {
      type: 'nft_mint_request',
      skinId: params.skinId,
      chain: params.chain || 'polygon',
      message: 'Please confirm NFT minting on your mobile device.',
    });

    return {
      accepted: true,
      async: true,
      action: 'nft_mint',
      executedOn: 'mobile',
      message: '🔐 NFT 铸造需要移动端钱包签名。已推送到你的手机，请在手机上确认。',
      chain: params.chain || 'polygon',
      skinId: params.skinId,
    };
  }

  // ── Helpers ──────────────────────────────────────────────────────

  private async isDesktopOnline(userId: string): Promise<boolean> {
    try {
      const state = await this.desktopSyncService.getState(userId);
      const devices = (state as any)?.devices || [];
      return devices.some((d: any) => d.isOnline && d.deviceType === 'desktop');
    } catch {
      return false;
    }
  }

  private handleCloudFallback(
    action: CreatorAction,
    params: CreatorStudioParams,
    context: ExecutionContext,
  ): Record<string, unknown> {
    // For poster/ppt, we can still generate on the server (simplified)
    switch (action) {
      case 'poster':
        return {
          accepted: false,
          action,
          executedOn: 'cloud_fallback',
          message: '桌面端不在线。海报生成需要桌面端的 Canvas 渲染能力。请打开桌面端后重试，或在桌面端 Creator Studio 中直接操作。',
          hint: 'Open Agentrix Desktop → Creator Studio → Poster tab',
        };
      case 'ppt':
        return {
          accepted: false,
          action,
          executedOn: 'cloud_fallback',
          message: '桌面端不在线。PPT 生成需要桌面端。请打开桌面端后重试。',
          hint: 'Open Agentrix Desktop → Creator Studio',
        };
      case 'skin_list':
        return {
          accepted: false,
          action,
          message: '皮肤上架建议在桌面端操作（可以 3D 预览确认效果）。也可以在 Web 端 agentrix.top/console/marketplace 操作。',
        };
      default:
        return { accepted: false, action, message: `${action} requires desktop or specific device` };
    }
  }

  private getDesktopMessage(action: CreatorAction): string {
    switch (action) {
      case 'poster': return '🎨 已发送到桌面端生成海报。完成后会推送通知到你的手机。';
      case 'ppt': return '📊 已发送到桌面端生成 PPT。完成后会推送通知。';
      case 'skin_list': return '🛍 已发送到桌面端进行皮肤上架确认。请在桌面端查看 3D 预览并确认。';
      default: return `已发送到桌面端执行 ${action}。`;
    }
  }

  private sanitizeParams(params: CreatorStudioParams): Record<string, unknown> {
    const { action, ...rest } = params;
    // Remove undefined values
    return Object.fromEntries(
      Object.entries(rest).filter(([_, v]) => v !== undefined && v !== null),
    );
  }
}
