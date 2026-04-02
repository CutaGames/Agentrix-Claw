import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentMemory, MemoryScope, MemoryType } from '../../entities/agent-memory.entity';

// ── Context Layer Types ──────────────────────────────────────────────────────

export interface ContextLayer {
  source: 'system' | 'agent_profile' | 'user_memory' | 'skill_prompts' | 'plan_mode';
  content: string;
  cacheable: boolean;
  priority: number;
}

export interface BuiltContext {
  systemPrompt: string;
  /** Indexes where cache_control breakpoints should be inserted (for Anthropic prompt caching) */
  cacheBreakpoints: number[];
  memoryTokenEstimate: number;
  layerSummary: Array<{ source: string; chars: number; cacheable: boolean }>;
}

export interface ContextBuildOptions {
  userId: string;
  agentId?: string;
  sessionId?: string;
  instanceName?: string;
  modelLabel?: string;
  needsTools?: boolean;
  permissionProfile?: {
    agentAccountId?: string;
    agentAccountName?: string;
    agentAccountStatus?: string;
    deniedToolNames: string[];
  };
  planModeAddition?: string;
  maxMemoryChars?: number;
}

// ── Memory Budget Constants ──────────────────────────────────────────────────
const MAX_MEMORY_CHARS = 12000;  // ~3000 tokens
const MAX_MEMORIES_TOTAL = 20;
const FRESHNESS_WARN_DAYS = 7;

@Injectable()
export class AgentContextService {
  private readonly logger = new Logger(AgentContextService.name);

  constructor(
    @InjectRepository(AgentMemory)
    private readonly memoryRepo: Repository<AgentMemory>,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // Layered Context Builder
  // ═══════════════════════════════════════════════════════════════════════════

  async buildContext(options: ContextBuildOptions): Promise<BuiltContext> {
    const layers: ContextLayer[] = [];
    const maxMemChars = options.maxMemoryChars || MAX_MEMORY_CHARS;

    // Layer 1: Base system prompt (high-cache, rarely changes)
    layers.push({
      source: 'system',
      content: this.buildBaseSystemPrompt(options),
      cacheable: true,
      priority: 100,
    });

    // Layer 2: Agent profile (cacheable per agent)
    if (options.permissionProfile) {
      layers.push({
        source: 'agent_profile',
        content: this.buildAgentProfileBlock(options),
        cacheable: true,
        priority: 90,
      });
    }

    // Layer 3: User & agent memory (dynamic, not cacheable)
    const memories = await this.getLayeredMemories(
      options.userId,
      options.agentId,
      options.sessionId,
    );

    if (memories.length > 0) {
      const memoryBlock = this.formatMemoriesWithBudget(memories, maxMemChars);
      layers.push({
        source: 'user_memory',
        content: memoryBlock,
        cacheable: false,
        priority: 70,
      });
    }

    // Layer 4: Plan mode (dynamic)
    if (options.planModeAddition) {
      layers.push({
        source: 'plan_mode',
        content: options.planModeAddition,
        cacheable: false,
        priority: 60,
      });
    }

    return this.composeLayers(layers);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Layered Memory Retrieval (session → agent → user → shared)
  // ═══════════════════════════════════════════════════════════════════════════

  async getLayeredMemories(
    userId: string,
    agentId?: string,
    sessionId?: string,
  ): Promise<AgentMemory[]> {
    const memories: AgentMemory[] = [];

    // 1. Session-scoped (most recent, highest relevance)
    if (sessionId) {
      const sessionMems = await this.memoryRepo.find({
        where: { sessionId, scope: MemoryScope.SESSION },
        order: { updatedAt: 'DESC' },
        take: 10,
      });
      memories.push(...sessionMems);
    }

    // 2. Agent-scoped (long-term per-agent)
    if (agentId) {
      const agentMems = await this.memoryRepo.find({
        where: { agentId, scope: MemoryScope.AGENT },
        order: { updatedAt: 'DESC' },
        take: 5,
      });
      memories.push(...agentMems);
    }

    // 3. User-scoped (cross-agent shared, indexed by userId now)
    if (userId) {
      const userMems = await this.memoryRepo.find({
        where: { userId, scope: MemoryScope.USER },
        order: { updatedAt: 'DESC' },
        take: 5,
      });
      memories.push(...userMems);
    }

    // Deduplicate by key (prefer session > agent > user)
    const seen = new Set<string>();
    return memories.filter(m => {
      if (seen.has(m.key)) return false;
      seen.add(m.key);
      return true;
    }).slice(0, MAX_MEMORIES_TOTAL);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Memory Formatting with Budget & Freshness
  // ═══════════════════════════════════════════════════════════════════════════

  private formatMemoriesWithBudget(memories: AgentMemory[], maxChars: number): string {
    const sorted = memories
      .sort((a, b) => (b.metadata?.importance || 0) - (a.metadata?.importance || 0));

    const lines: string[] = [];
    let totalChars = 0;

    for (const m of sorted) {
      const valueStr = JSON.stringify(m.value).substring(0, 300);
      const ageDays = (Date.now() - new Date(m.updatedAt).getTime()) / 86400_000;
      const staleMarker = ageDays >= FRESHNESS_WARN_DAYS ? ` ⚠️${Math.floor(ageDays)}d old` : '';
      const line = `- [${m.scope}/${m.type}] ${m.key}: ${valueStr}${staleMarker}`;

      if (totalChars + line.length > maxChars) break;
      lines.push(line);
      totalChars += line.length;
    }

    return `\n## Agent Memory (auto-recalled context — ${lines.length}/${memories.length} entries, budget ${Math.round(totalChars / 4)} tokens)\n${lines.join('\n')}\n`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // System Prompt Blocks
  // ═══════════════════════════════════════════════════════════════════════════

  private buildBaseSystemPrompt(options: ContextBuildOptions): string {
    const agentName = options.instanceName || 'Agent';
    const modelLabel = options.modelLabel || 'AI';

    if (!options.needsTools) {
      return `You are "${agentName}", the user's personal AI agent. Reply concisely in the user's language. Model: ${modelLabel}.`;
    }

    return `You are "${agentName}", the user's personal AI agent with marketplace abilities.

## Available Tools
- skill_search/skill_install/skill_execute/skill_recommend/skill_publish: Marketplace skill lifecycle
- resource_publish: Publish APIs/datasets/workflows
- search_products/resource_search/create_order: Commerce
- get_balance/asset_overview/x402_pay/quickpay_execute: Payments
- task_search/task_post/task_accept/task_submit: Task marketplace
- agent_discover/agent_invoke: Agent-to-Agent delegation

## Rules
1. ALWAYS use tools when asked to search/install/execute/buy/publish skills. Never claim lack of marketplace access.
2. The client renders images (![alt](url)), audio (TTS button), files, and attachments. Never say "text-only" or "unsupported".
3. For image generation: skill_search → skill_install → skill_execute → include URL in reply.
4. Include media URLs in replies for rich rendering. Summarize tool results clearly.
5. Reply in the user's language, stay concise.
6. For balance/funds queries: call get_balance or asset_overview. Never guess.
7. Model: ${modelLabel}. Identify truthfully when asked.
8. Use prior conversation context when relevant.`;
  }

  private buildAgentProfileBlock(options: ContextBuildOptions): string {
    const pp = options.permissionProfile;
    if (!pp) return '';

    const denied = pp.deniedToolNames.length > 0
      ? pp.deniedToolNames.join(', ')
      : 'none';

    return `\n## Agent Account Profile
Bound to Agent Account "${pp.agentAccountName}" (${pp.agentAccountStatus}). Disabled tools: ${denied}.`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Layer Composer with Cache Breakpoints
  // ═══════════════════════════════════════════════════════════════════════════

  private composeLayers(layers: ContextLayer[]): BuiltContext {
    const sorted = layers.sort((a, b) => b.priority - a.priority);
    const parts: string[] = [];
    const breakpoints: number[] = [];
    let offset = 0;
    const summary: Array<{ source: string; chars: number; cacheable: boolean }> = [];

    for (const layer of sorted) {
      parts.push(layer.content);
      const newOffset = offset + layer.content.length;

      if (layer.cacheable) {
        breakpoints.push(newOffset);
      }

      summary.push({
        source: layer.source,
        chars: layer.content.length,
        cacheable: layer.cacheable,
      });

      offset = newOffset;
    }

    const systemPrompt = parts.join('');
    const memoryLayer = summary.find(s => s.source === 'user_memory');

    return {
      systemPrompt,
      cacheBreakpoints: breakpoints,
      memoryTokenEstimate: memoryLayer ? Math.ceil(memoryLayer.chars / 4) : 0,
      layerSummary: summary,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Prompt Cache Helpers (for Anthropic cache_control)
  // ═══════════════════════════════════════════════════════════════════════════

  buildCacheableSystemBlocks(built: BuiltContext): Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> {
    if (built.cacheBreakpoints.length === 0) {
      return [{ type: 'text', text: built.systemPrompt }];
    }

    const blocks: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> = [];
    let start = 0;

    for (const bp of built.cacheBreakpoints) {
      const text = built.systemPrompt.slice(start, bp);
      if (text.length > 0) {
        blocks.push({
          type: 'text',
          text,
          cache_control: { type: 'ephemeral' },
        });
      }
      start = bp;
    }

    // Remaining dynamic content (no cache)
    const remaining = built.systemPrompt.slice(start);
    if (remaining.length > 0) {
      blocks.push({ type: 'text', text: remaining });
    }

    return blocks;
  }
}
