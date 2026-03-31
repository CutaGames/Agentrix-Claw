import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { randomBytes } from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

import {
  OpenClawInstance,
  OpenClawInstanceStatus,
  OpenClawInstanceType,
} from '../../entities/openclaw-instance.entity';
import { AgentAccount, AgentAccountStatus, AgentType } from '../../entities/agent-account.entity';
import { UserAgent } from '../../entities/user-agent.entity';
import { getDefaultSkillHandlerNames } from '../skill/agent-preset-skills.config';

export interface BindOpenClawDto {
  name: string;
  instanceUrl: string;
  instanceToken: string;
  isPrimary?: boolean;
}

/** Returns true for localhost, 127.x, 10.x, 192.168.x, 172.16-31.x — unreachable from cloud server */
function isPrivateOrLocalUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return (
      host === 'localhost' ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2[0-9]|3[01])\./.test(host) ||
      host === '::1'
    );
  } catch {
    return false;
  }
}

export interface ProvisionCloudDto {
  name: string;
  llmProvider?: string;
  personality?: string;
}

export interface RegisterLocalRelayDto {
  relayToken: string;
  name?: string;
  wsRelayUrl?: string;
}

/**
 * Available LLM models for user switching.
 * availability: 'available' = ready to use, 'coming_soon' = not yet wired, 'requires_key' = user must provide API key.
 */
export interface AvailableModel {
  id: string;
  label: string;
  provider: string;
  bedrockModelId?: string;
  icon: string;
  badge?: string;
  availability: 'available' | 'coming_soon' | 'requires_key';
  costTier: 'free_trial' | 'starter' | 'pro';
}

export const PLATFORM_MODELS: AvailableModel[] = [
  {
    id: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5',
    provider: 'AWS Bedrock',
    bedrockModelId: 'anthropic.claude-haiku-4-5-20251001-v1:0',
    icon: '🤖',
    badge: 'Default',
    availability: 'available',
    costTier: 'free_trial',
  },
  {
    id: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    provider: 'AWS Bedrock',
    bedrockModelId: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
    icon: '💎',
    badge: 'Pro',
    availability: 'available',
    costTier: 'pro',
  },
  {
    id: 'deepseek-v3',
    label: 'DeepSeek V3',
    provider: 'DeepSeek',
    icon: '🔬',
    badge: 'Cost‑efficient',
    availability: 'available',
    costTier: 'free_trial',
  },
  {
    id: 'gemini-2.0-flash',
    label: 'Gemini 2.0 Flash',
    provider: 'Google',
    icon: '✨',
    badge: 'Fast',
    availability: 'available',
    costTier: 'free_trial',
  },
  {
    id: 'llama-3.3-70b',
    label: 'Llama 3.3 70B',
    provider: 'Groq',
    icon: '🦙',
    badge: 'Free',
    availability: 'available',
    costTier: 'free_trial',
  },
  {
    id: 'gpt-4o',
    label: 'GPT-4o',
    provider: 'OpenAI',
    icon: '🧠',
    availability: 'coming_soon',
    costTier: 'pro',
  },
  {
    id: 'claude-opus-4-6',
    label: 'Claude Opus 4.6',
    provider: 'AWS Bedrock',
    bedrockModelId: 'us.anthropic.claude-opus-4-20250514-v1:0',
    icon: '🏆',
    badge: 'Max',
    availability: 'available',
    costTier: 'pro',
  },
];

@Injectable()
export class OpenClawConnectionService implements OnModuleInit {
  private readonly logger = new Logger(OpenClawConnectionService.name);

  private resolvePlatformHostedDefaultModel(providerId?: string): string {
    switch (String(providerId || '').toLowerCase()) {
      case 'deepseek':
        return 'deepseek-v3';
      case 'google':
      case 'gemini':
        return 'gemini-2.0-flash';
      case 'groq':
      case 'meta':
      case 'llama':
        return 'llama-3.3-70b';
      case 'openai':
        return 'gpt-4o';
      case 'bedrock':
      default:
        return 'claude-haiku-4-5';
    }
  }

  constructor(
    @InjectRepository(OpenClawInstance)
    private instanceRepo: Repository<OpenClawInstance>,
    @InjectRepository(AgentAccount)
    private agentAccountRepo: Repository<AgentAccount>,
    @InjectRepository(UserAgent)
    private userAgentRepo: Repository<UserAgent>,
  ) {}

  /** On startup: auto-fix any ERROR cloud instances left from failed Docker provisioning. */
  async onModuleInit() {
    // Fix any stuck ERROR/PROVISIONING cloud instances from old Docker-based provisioning
    try {
      const broken = await this.instanceRepo.find({
        where: [
          { instanceType: OpenClawInstanceType.CLOUD, status: OpenClawInstanceStatus.ERROR },
          { instanceType: OpenClawInstanceType.CLOUD, status: OpenClawInstanceStatus.PROVISIONING },
        ],
      });
      for (const inst of broken) {
        const restoredProvider = (inst.capabilities as any)?.llmProvider || 'bedrock';
        this.logger.log(`Auto-fixing broken cloud instance ${inst.id} (was ${inst.status}) → platform-hosted`);
        await this.instanceRepo.update(inst.id, {
          status: OpenClawInstanceStatus.ACTIVE,
          instanceUrl: null as any,
          capabilities: {
            platformTools: getDefaultSkillHandlerNames(),
            provisionedAt: new Date().toISOString(),
            llmProvider: restoredProvider,
            platformHosted: true,
            activeModel: this.resolvePlatformHostedDefaultModel(restoredProvider),
          } as any,
        });
      }
      if (broken.length > 0) {
        this.logger.log(`Fixed ${broken.length} broken cloud instance(s)`);
      }
    } catch (e: any) {
      this.logger.warn(`Auto-fix cloud instances failed: ${e.message}`);
    }
  }

  async bindInstance(userId: string, dto: BindOpenClawDto): Promise<OpenClawInstance> {
    const isLocal = isPrivateOrLocalUrl(dto.instanceUrl);

    if (isLocal) {
      // LAN / desktop installer QR: the backend server cannot reach private IPs,
      // so skip the connectivity check and register as disconnected.
      // The mobile app will connect directly via LAN.
      this.logger.log(`Skipping connectivity check for local/LAN instance at ${dto.instanceUrl}`);
    } else {
      // Public URL — verify reachability before registering
      try {
        const resp = await fetch(`${dto.instanceUrl.replace(/\/$/, '')}/api/health`, {
          headers: { Authorization: `Bearer ${dto.instanceToken}` },
          signal: AbortSignal.timeout(6000),
        });
        if (!resp.ok) {
          throw new BadRequestException(`OpenClaw instance responded with ${resp.status}`);
        }
      } catch (err: any) {
        if (err instanceof BadRequestException) throw err;
        this.logger.warn(`Cannot reach instance at ${dto.instanceUrl}: ${err.message}`);
        throw new BadRequestException(
          `Cannot reach OpenClaw instance at ${dto.instanceUrl}. Check the URL and ensure the instance is running.`,
        );
      }
    }

    if (dto.isPrimary) {
      await this.instanceRepo.update({ userId }, { isPrimary: false });
    }

    const instance = this.instanceRepo.create({
      userId,
      name: dto.name,
      instanceType: isLocal ? OpenClawInstanceType.LOCAL : OpenClawInstanceType.SELF_HOSTED,
      status: isLocal ? OpenClawInstanceStatus.PROVISIONING : OpenClawInstanceStatus.ACTIVE,
      instanceUrl: dto.instanceUrl.replace(/\/$/, ''),
      instanceToken: dto.instanceToken,
      isPrimary: dto.isPrimary ?? false,
      capabilities: {
        platformTools: getDefaultSkillHandlerNames(),
        provisionedAt: new Date().toISOString(),
      },
    });

    return this.instanceRepo.save(instance);
  }

  async provisionCloudInstance(userId: string, dto: ProvisionCloudDto): Promise<OpenClawInstance> {
    // Idempotent — if already provisioning, return existing record
    const existing = await this.instanceRepo.findOne({
      where: { userId, instanceType: OpenClawInstanceType.CLOUD, status: OpenClawInstanceStatus.PROVISIONING },
    });
    if (existing) return existing;

    // ── Instance limit: 1 cloud instance per user (free tier) ──
    const maxCloud = parseInt(process.env.MAX_CLOUD_INSTANCES_PER_USER || '1', 10);
    const cloudCount = await this.instanceRepo.count({
      where: {
        userId,
        instanceType: OpenClawInstanceType.CLOUD,
        status: In([OpenClawInstanceStatus.ACTIVE, OpenClawInstanceStatus.PROVISIONING]),
      },
    });
    if (cloudCount >= maxCloud) {
      throw new BadRequestException(
        `Free tier allows ${maxCloud} cloud instance(s). Please remove an existing instance first.`,
      );
    }

    const cloudInstanceId = `cloud-${userId.slice(0, 8)}-${Date.now()}`;
    const instance = this.instanceRepo.create({
      userId,
      name: dto.name,
      personality: dto.personality,
      instanceType: OpenClawInstanceType.CLOUD,
      status: OpenClawInstanceStatus.PROVISIONING,
      cloudInstanceId,
      isPrimary: true,
    });

    const saved = await this.instanceRepo.save(instance);

    // Async provisioning — fire SSH Docker deployment with LLM config injected
    this.scheduleCloudProvisioning(saved.id, cloudInstanceId, dto.llmProvider).catch((e) =>
      this.logger.error(`Cloud provisioning failed: ${e.message}`),
    );

    return saved;
  }

  private async scheduleCloudProvisioning(
    instanceId: string,
    cloudInstanceId: string,
    llmProvider = 'deepseek',
  ) {
    try {
      this.logger.log(`Starting cloud provisioning for ${cloudInstanceId} (platform-hosted mode)...`);

      // ── Platform-hosted mode ──
      // Instead of spinning up a Docker container (which requires a pre-built image),
      // we provision the instance as "platform-hosted": chat is routed through the
      // Agentrix backend's own Claude/Bedrock integration with full tool support.
      // This gives every user a working agent with web search, marketplace tools, etc.

      const resolvedProvider = llmProvider === 'default'
        ? (process.env.PLATFORM_DEFAULT_LLM_PROVIDER || 'bedrock')
        : llmProvider;

      await this.instanceRepo.update(instanceId, {
        status: OpenClawInstanceStatus.ACTIVE,
        instanceUrl: null,  // No external URL — routed through platform
        capabilities: {
          platformTools: getDefaultSkillHandlerNames(),
          provisionedAt: new Date().toISOString(),
          llmProvider: resolvedProvider,
          platformHosted: true,
          activeModel: this.resolvePlatformHostedDefaultModel(resolvedProvider),
        } as any,
      });

      this.logger.log(`Cloud instance ${cloudInstanceId} provisioned in platform-hosted mode (LLM: ${resolvedProvider})`);
    } catch (error: any) {
      this.logger.error(`Failed to provision cloud instance: ${error.message}`);
      await this.instanceRepo.update(instanceId, {
        status: OpenClawInstanceStatus.ERROR,
      });
    }
  }

  async getInstancesByUser(userId: string): Promise<OpenClawInstance[]> {
    return this.instanceRepo.find({
      where: { userId },
      order: { isPrimary: 'DESC', updatedAt: 'DESC' },
    });
  }

  async getInstanceById(userId: string, instanceId: string): Promise<OpenClawInstance> {
    const instance = await this.instanceRepo.findOneBy({ id: instanceId });
    if (!instance) throw new NotFoundException('OpenClaw instance not found');
    if (instance.userId !== userId) throw new ForbiddenException();
    return instance;
  }

  async bindAgentAccount(userId: string, instanceId: string, agentAccountId: string | null): Promise<OpenClawInstance> {
    const instance = await this.getInstanceById(userId, instanceId);

    let resolvedAccountId = agentAccountId;
    if (agentAccountId) {
      let agentAccount = await this.agentAccountRepo.findOne({ where: { id: agentAccountId, ownerId: userId } });
      if (!agentAccount) {
        // Fallback: caller may have passed a UserAgent (agent-presence) ID.
        // Auto-provision an AgentAccount so the model preference propagates to chat.
        const userAgent = await this.userAgentRepo.findOne({ where: { id: agentAccountId, userId } });
        if (!userAgent) {
          throw new NotFoundException('Agent account not found for this user');
        }
        agentAccount = await this.autoProvisionAgentAccount(userId, userAgent);
        resolvedAccountId = agentAccount.id;
        this.logger.log(`Auto-provisioned AgentAccount ${agentAccount.id} from UserAgent ${userAgent.id} (model=${userAgent.defaultModel})`);
      } else {
        // Sync latest model/provider from the paired UserAgent if one exists
        const userAgent = await this.userAgentRepo.findOne({ where: { userId, name: agentAccount.name } });
        if (userAgent?.defaultModel && userAgent.defaultModel !== agentAccount.preferredModel) {
          agentAccount.preferredModel = userAgent.defaultModel;
          agentAccount.preferredProvider = userAgent.settings?.preferredProvider || agentAccount.preferredProvider;
          agentAccount.permissions = userAgent.metadata?.permissions || agentAccount.permissions;
          await this.agentAccountRepo.save(agentAccount);
        }
      }
    }

    const nextMetadata = { ...(instance.metadata || {}) };
    if (resolvedAccountId) {
      nextMetadata.agentAccountId = resolvedAccountId;
    } else {
      delete nextMetadata.agentAccountId;
    }

    instance.metadata = Object.keys(nextMetadata).length > 0 ? nextMetadata : null as any;
    return this.instanceRepo.save(instance);
  }

  /** Create an AgentAccount from a UserAgent so model/permission prefs propagate to the chat flow. */
  private async autoProvisionAgentAccount(userId: string, userAgent: UserAgent): Promise<AgentAccount> {
    // Check if an AgentAccount already exists for this user with same name
    const existing = await this.agentAccountRepo.findOne({ where: { ownerId: userId, name: userAgent.name } });
    if (existing) {
      // Update preferences from UserAgent
      existing.preferredModel = userAgent.defaultModel || existing.preferredModel;
      existing.preferredProvider = userAgent.settings?.preferredProvider || existing.preferredProvider;
      existing.permissions = userAgent.metadata?.permissions || existing.permissions;
      existing.status = AgentAccountStatus.ACTIVE;
      return this.agentAccountRepo.save(existing);
    }

    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    const account = this.agentAccountRepo.create({
      agentUniqueId: `AGT-${timestamp}-${random}`,
      name: userAgent.name,
      description: userAgent.description,
      ownerId: userId,
      agentType: AgentType.PERSONAL,
      status: AgentAccountStatus.ACTIVE,
      preferredModel: userAgent.defaultModel || undefined,
      preferredProvider: userAgent.settings?.preferredProvider || undefined,
      permissions: userAgent.metadata?.permissions || {},
      spendingLimits: userAgent.metadata?.accountCompatibility?.spendingLimits || {
        singleTxLimit: 100,
        dailyLimit: 500,
        monthlyLimit: 2000,
        currency: 'USD',
      },
      metadata: { sourceUserAgentId: userAgent.id },
    });
    return this.agentAccountRepo.save(account);
  }

  async setPrimaryInstance(userId: string, instanceId: string): Promise<void> {
    await this.getInstanceById(userId, instanceId);
    await this.instanceRepo.update({ userId }, { isPrimary: false });
    await this.instanceRepo.update({ id: instanceId, userId }, { isPrimary: true });
  }

  async unbindInstance(userId: string, instanceId: string): Promise<void> {
    const instance = await this.getInstanceById(userId, instanceId);
    await this.instanceRepo.update(instance.id, { status: OpenClawInstanceStatus.UNLINKED });
    await this.instanceRepo.delete(instance.id);
  }

  async batchCleanupByStatus(userId: string, status: string): Promise<{ deleted: number }> {
    const validStatuses = Object.values(OpenClawInstanceStatus);
    if (!validStatuses.includes(status as OpenClawInstanceStatus)) {
      return { deleted: 0 };
    }
    const result = await this.instanceRepo.delete({
      userId,
      status: status as OpenClawInstanceStatus,
    });
    this.logger.log(`Batch cleanup: deleted ${result.affected ?? 0} ${status} instances for user ${userId}`);
    return { deleted: result.affected ?? 0 };
  }

  async updateInstanceStatus(instanceId: string, status: OpenClawInstanceStatus): Promise<void> {
    await this.instanceRepo.update(instanceId, { status });
  }

  /** Create a short-lived QR-bind session (stored in metadata for polling) */
  async createBindSession(userId: string): Promise<{ sessionId: string; expiresAt: number }> {
    const sessionId = `bind-${userId.slice(0, 8)}-${Date.now()}`;
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 min
    // Store session in a temporary place — here we use a simple in-memory map
    // In production, use Redis.
    OpenClawConnectionService.bindSessions.set(sessionId, { userId, expiresAt, resolved: false });
    return { sessionId, expiresAt };
  }

  /** Poll—returns bound instance id once QR bind is resolved */
  async pollBindSession(sessionId: string): Promise<{ resolved: boolean; instanceId?: string }> {
    const session = OpenClawConnectionService.bindSessions.get(sessionId);
    if (!session || Date.now() > session.expiresAt) {
      return { resolved: false };
    }
    if (session.resolved && session.instanceId) {
      OpenClawConnectionService.bindSessions.delete(sessionId);
      return { resolved: true, instanceId: session.instanceId };
    }
    return { resolved: false };
  }

  private static bindSessions = new Map<
    string,
    { userId: string; expiresAt: number; resolved: boolean; instanceId?: string }
  >();

  // ── Social relay ────────────────────────────────────────────────────────────

  /** Generate (or reuse) a relay token + Telegram deep-link for an instance */
  async generateSocialBindQr(
    userId: string,
    instanceId: string,
    platform: 'telegram',
  ): Promise<{ deepLink: string; relayToken: string; platform: string }> {
    const instance = await this.getInstanceById(userId, instanceId);

    // Reuse existing relay token or generate a new one
    let token = instance.relayToken;
    if (!token) {
      token = randomBytes(24).toString('hex');
      await this.instanceRepo.update(instance.id, { relayToken: token });
    }

    const botName = process.env.TELEGRAM_BOT_NAME || 'ClawLinkBot';
    const deepLink = `https://t.me/${botName}?start=${token}`;

    return { deepLink, relayToken: token, platform };
  }

  async unlinkSocial(userId: string, instanceId: string, platform: 'telegram'): Promise<void> {
    await this.getInstanceById(userId, instanceId);
    if (platform === 'telegram') {
      await this.instanceRepo.update({ id: instanceId, userId }, { telegramChatId: undefined });
    }
  }

  // ── Local instance provisioning ─────────────────────────────────────────────

  async provisionLocalInstance(userId: string, dto: ProvisionCloudDto): Promise<{
    instanceId: string;
    relayToken: string;
    wsRelayUrl: string;
    downloadUrls: { win: string; mac: string };
  }> {
    // ── Instance limit: 1 local instance per user (free tier) ──
    const maxLocal = parseInt(process.env.MAX_LOCAL_INSTANCES_PER_USER || '1', 10);
    const localCount = await this.instanceRepo.count({
      where: {
        userId,
        instanceType: OpenClawInstanceType.LOCAL,
        status: In([OpenClawInstanceStatus.ACTIVE, OpenClawInstanceStatus.PROVISIONING]),
      },
    });
    if (localCount >= maxLocal) {
      throw new BadRequestException(
        `Free tier allows ${maxLocal} local instance(s). Please remove an existing instance first.`,
      );
    }

    const relayToken = randomBytes(24).toString('hex');
    const instance = this.instanceRepo.create({
      userId,
      name: dto.name || 'My Local Agent',
      personality: dto.personality,
      instanceType: OpenClawInstanceType.LOCAL,
      status: OpenClawInstanceStatus.PROVISIONING,
      relayToken,
      isPrimary: true,
      capabilities: {
        platformTools: getDefaultSkillHandlerNames(),
        provisionedAt: new Date().toISOString(),
      },
    });
    const saved = await this.instanceRepo.save(instance);

    const appDomain = process.env.APP_DOMAIN ?? 'api.agentrix.top';
    return {
      instanceId: saved.id,
      relayToken,
      wsRelayUrl: `wss://${appDomain}/relay`,
      downloadUrls: {
        win: `https://${appDomain}/downloads/Agentrix-Claw-Setup.exe`,
        mac: `https://${appDomain}/downloads/agentrix-claw-mac`,
      },
    };
  }

  async registerLocalRelayInstance(userId: string, dto: RegisterLocalRelayDto): Promise<OpenClawInstance> {
    const relayToken = dto.relayToken?.trim();
    if (!relayToken) {
      throw new BadRequestException('relayToken is required');
    }

    const existing = await this.instanceRepo.findOne({ where: { relayToken } });
    if (existing) {
      if (existing.userId !== userId) {
        throw new ForbiddenException('This desktop agent is already linked to another account.');
      }
      return existing;
    }

    const maxLocal = parseInt(process.env.MAX_LOCAL_INSTANCES_PER_USER || '1', 10);
    const localCount = await this.instanceRepo.count({
      where: {
        userId,
        instanceType: OpenClawInstanceType.LOCAL,
        status: In([OpenClawInstanceStatus.ACTIVE, OpenClawInstanceStatus.PROVISIONING]),
      },
    });
    if (localCount >= maxLocal) {
      throw new BadRequestException(
        `Free tier allows ${maxLocal} local instance(s). Please remove an existing instance first.`,
      );
    }

    const instance = this.instanceRepo.create({
      userId,
      name: dto.name?.trim() || 'My PC Agent',
      instanceType: OpenClawInstanceType.LOCAL,
      status: OpenClawInstanceStatus.PROVISIONING,
      relayToken,
      isPrimary: true,
      capabilities: {
        platformTools: getDefaultSkillHandlerNames(),
        provisionedAt: new Date().toISOString(),
        provisionSource: 'desktop-installer',
        wsRelayUrl: dto.wsRelayUrl,
      },
    });

    return this.instanceRepo.save(instance);
  }

  async getRelayStatus(userId: string, instanceId: string): Promise<{ connected: boolean; instanceId: string }> {
    const instance = await this.getInstanceById(userId, instanceId);
    return { connected: instance.relayConnected ?? false, instanceId };
  }

  // ── Model switching ────────────────────────────────────────────────────────

  /**
   * Get available models for the user (respects plan type).
   */
  getAvailableModels(): AvailableModel[] {
    return PLATFORM_MODELS;
  }

  /**
   * Get the active model for an instance.
   */
  async getInstanceModel(userId: string, instanceId: string): Promise<{ modelId: string; model: AvailableModel | null }> {
    const instance = await this.getInstanceById(userId, instanceId);
    const modelId = (instance.capabilities as any)?.activeModel
      || (instance.capabilities as any)?.llmProvider
      || process.env.DEFAULT_MODEL
      || 'claude-haiku-4-5';
    const model = PLATFORM_MODELS.find(m => m.id === modelId) || null;
    return { modelId, model };
  }

  /**
   * Switch the model used by an instance.
   * Updates the instance metadata and attempts to push the config to the running container.
   */
  async switchInstanceModel(userId: string, instanceId: string, modelId: string): Promise<{
    success: boolean;
    modelId: string;
    model: AvailableModel;
    pushed: boolean;
    message: string;
  }> {
    // Accept both platform short IDs and user-configured provider model IDs (e.g. full Bedrock ARNs)
    let model = PLATFORM_MODELS.find(m => m.id === modelId);
    if (!model) {
      // Build a synthetic AvailableModel for user-configured provider models
      model = {
        id: modelId,
        label: modelId.replace(/^us\.anthropic\.|^anthropic\.|:0$/g, '').replace(/-/g, ' '),
        provider: 'User Provider',
        icon: '💎',
        availability: 'available',
        costTier: 'pro',
      };
    }
    if (model.availability === 'coming_soon') {
      throw new BadRequestException(`Model "${model.label}" is coming soon and not yet available.`);
    }

    const instance = await this.getInstanceById(userId, instanceId);

    // Update capabilities with the active model
    const caps = { ...(instance.capabilities || {}), activeModel: modelId };
    await this.instanceRepo.update(instance.id, { capabilities: caps as any });

    // Try pushing the model change to the running OpenClaw instance
    let pushed = false;
    if (instance.instanceUrl && instance.status === OpenClawInstanceStatus.ACTIVE) {
      try {
        const resp = await fetch(`${instance.instanceUrl}/api/config/model`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(instance.instanceToken ? { Authorization: `Bearer ${instance.instanceToken}` } : {}),
          },
          body: JSON.stringify({
            modelId,
            bedrockModelId: (model as any).bedrockModelId,
            provider: model.provider,
          }),
          signal: AbortSignal.timeout(8_000),
        });
        pushed = resp.ok;
      } catch (err: any) {
        this.logger.warn(`Could not push model switch to instance ${instanceId}: ${err.message}`);
      }
    }

    this.logger.log(`Model switched for instance ${instanceId}: ${modelId} (pushed=${pushed})`);

    return {
      success: true,
      modelId,
      model,
      pushed,
      message: pushed
        ? `Switched to ${model.label}. Active immediately.`
        : `Switched to ${model.label}. Will take effect on next chat (instance config saved).`,
    };
  }
}
