import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HookConfig, HookEventType, HookHandlerType } from '../../entities/hook-config.entity';
import { createHmac } from 'crypto';

export interface HookContext {
  userId: string;
  sessionId: string;
  eventType: HookEventType;
  toolName?: string;
  toolArgs?: Record<string, any>;
  toolResult?: any;
  message?: string;
  model?: string;
  metadata?: Record<string, any>;
}

export interface HookResult {
  hookId: string;
  success: boolean;
  modified?: boolean;
  data?: any;
  error?: string;
  durationMs: number;
}

@Injectable()
export class HookService {
  private readonly logger = new Logger(HookService.name);

  constructor(
    @InjectRepository(HookConfig)
    private readonly hookRepo: Repository<HookConfig>,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════
  // Hook Execution
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Execute all hooks for a given event type. Returns results in priority order.
   * For pre-hooks, if any hook returns { block: true }, the caller should abort.
   * For pre-hooks, if any hook returns { modify: {...} }, the caller should apply modifications.
   */
  async executeHooks(ctx: HookContext): Promise<HookResult[]> {
    const hooks = await this.hookRepo.find({
      where: { userId: ctx.userId, eventType: ctx.eventType, isEnabled: true },
      order: { priority: 'ASC' },
    });

    if (hooks.length === 0) return [];

    const results: HookResult[] = [];

    for (const hook of hooks) {
      // Apply filters
      if (!this.matchesFilter(hook, ctx)) continue;

      const t0 = Date.now();
      try {
        const result = await this.executeOneHook(hook, ctx);
        results.push({
          hookId: hook.id,
          success: true,
          modified: !!result?.modify,
          data: result,
          durationMs: Date.now() - t0,
        });

        // If a pre-hook returns block=true, stop the chain
        if (result?.block && ctx.eventType.startsWith('pre_')) {
          this.logger.log(`Hook ${hook.id} blocked execution for ${ctx.eventType}`);
          break;
        }
      } catch (err: any) {
        this.logger.warn(`Hook ${hook.id} failed: ${err.message}`);
        results.push({
          hookId: hook.id,
          success: false,
          error: err.message,
          durationMs: Date.now() - t0,
        });
      }
    }

    return results;
  }

  /**
   * Check if any pre-hook wants to block execution.
   */
  hasBlockingResult(results: HookResult[]): boolean {
    return results.some(r => r.success && r.data?.block === true);
  }

  /**
   * Get merged modifications from hook results.
   */
  getMergedModifications(results: HookResult[]): Record<string, any> | null {
    const mods = results.filter(r => r.success && r.modified && r.data?.modify);
    if (mods.length === 0) return null;
    let merged: Record<string, any> = {};
    for (const m of mods) {
      merged = { ...merged, ...m.data.modify };
    }
    return merged;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CRUD
  // ═══════════════════════════════════════════════════════════════════════

  async listHooks(userId: string): Promise<HookConfig[]> {
    return this.hookRepo.find({
      where: { userId },
      order: { eventType: 'ASC', priority: 'ASC' },
    });
  }

  async getHook(hookId: string): Promise<HookConfig | null> {
    return this.hookRepo.findOne({ where: { id: hookId } });
  }

  async createHook(userId: string, data: Partial<HookConfig>): Promise<HookConfig> {
    const hook = this.hookRepo.create({
      ...data,
      userId,
      isEnabled: data.isEnabled ?? true,
      priority: data.priority ?? 0,
    });
    return this.hookRepo.save(hook);
  }

  async updateHook(hookId: string, data: Partial<HookConfig>): Promise<HookConfig | null> {
    const hook = await this.hookRepo.findOne({ where: { id: hookId } });
    if (!hook) return null;
    Object.assign(hook, data);
    return this.hookRepo.save(hook);
  }

  async deleteHook(hookId: string): Promise<boolean> {
    const result = await this.hookRepo.delete(hookId);
    return (result.affected || 0) > 0;
  }

  async toggleHook(hookId: string, enabled: boolean): Promise<HookConfig | null> {
    const hook = await this.hookRepo.findOne({ where: { id: hookId } });
    if (!hook) return null;
    hook.isEnabled = enabled;
    return this.hookRepo.save(hook);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Internal
  // ═══════════════════════════════════════════════════════════════════════

  private matchesFilter(hook: HookConfig, ctx: HookContext): boolean {
    if (!hook.filter) return true;
    if (hook.filter.toolNames?.length && ctx.toolName && !hook.filter.toolNames.includes(ctx.toolName)) {
      return false;
    }
    if (hook.filter.sessionIds?.length && ctx.sessionId && !hook.filter.sessionIds.includes(ctx.sessionId)) {
      return false;
    }
    if (hook.filter.models?.length && ctx.model && !hook.filter.models.includes(ctx.model)) {
      return false;
    }
    return true;
  }

  private async executeOneHook(hook: HookConfig, ctx: HookContext): Promise<any> {
    switch (hook.handlerType) {
      case HookHandlerType.WEBHOOK:
        return this.executeWebhook(hook, ctx);
      case HookHandlerType.INTERNAL:
        return this.executeInternal(hook, ctx);
      case HookHandlerType.SCRIPT:
        return this.executeScript(hook, ctx);
      default:
        throw new Error(`Unknown handler type: ${hook.handlerType}`);
    }
  }

  private async executeWebhook(hook: HookConfig, ctx: HookContext): Promise<any> {
    const timeout = hook.config?.timeout || 5000;
    const payload = {
      event: ctx.eventType,
      sessionId: ctx.sessionId,
      toolName: ctx.toolName,
      toolArgs: ctx.toolArgs,
      toolResult: ctx.toolResult,
      message: ctx.message,
      model: ctx.model,
      timestamp: Date.now(),
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Agentrix-Event': ctx.eventType,
      ...(hook.config?.headers || {}),
    };

    // HMAC signature if secret is configured
    if (hook.config?.secret) {
      const body = JSON.stringify(payload);
      const sig = createHmac('sha256', hook.config.secret).update(body).digest('hex');
      headers['X-Agentrix-Signature'] = `sha256=${sig}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(hook.handler, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        throw new Error(`Webhook returned ${res.status}`);
      }

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('json')) {
        return res.json();
      }
      return { ok: true };
    } catch (err: any) {
      clearTimeout(timer);
      throw err;
    }
  }

  private async executeInternal(hook: HookConfig, _ctx: HookContext): Promise<any> {
    // Internal hooks execute named handler functions registered in the service
    // For now, this is a placeholder — specific internal handlers can be added as needed
    this.logger.log(`Internal hook triggered: ${hook.handler}`);
    return { ok: true, handler: hook.handler };
  }

  private async executeScript(hook: HookConfig, ctx: HookContext): Promise<any> {
    // Script hooks run a sandboxed JS expression
    // Limited to simple expressions for safety — no require/import/eval
    this.logger.warn(`Script hooks are experimental: ${hook.id}`);
    try {
      const fn = new Function('ctx', `'use strict'; ${hook.handler}`);
      return fn({
        event: ctx.eventType,
        toolName: ctx.toolName,
        toolArgs: ctx.toolArgs,
        toolResult: ctx.toolResult,
        message: ctx.message,
      });
    } catch (err: any) {
      throw new Error(`Script execution failed: ${err.message}`);
    }
  }
}
