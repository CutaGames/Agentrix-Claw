import { Injectable, Logger, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OpenClawInstance } from '../../entities/openclaw-instance.entity';
import { OpenClawSkillHubService } from './openclaw-skill-hub.service';
import { SkillService } from '../skill/skill.service';
import axios, { AxiosInstance } from 'axios';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ProbeResult {
  reachable: boolean;
  instanceName?: string;
  version?: string;
  skillCount?: number;
  memoryEntries?: number;
  sessionCount?: number;
  model?: string;
  latencyMs?: number;
  error?: string;
}

export interface MigrationCategory {
  category: 'config' | 'skills' | 'memory' | 'sessions';
  status: 'ok' | 'skipped' | 'error';
  count?: number;
  detail?: string;
}

export interface MigrationResult {
  instanceId: string;
  startedAt: string;
  finishedAt: string;
  categories: MigrationCategory[];
  config?: Record<string, unknown>;
  skills: SkillSnapshot[];
  memoryEntries: MemoryEntry[];
  sessionSummaries: SessionSummary[];
  totalMigrated: number;
}

export interface SkillSnapshot {
  skillKey: string;
  name: string;
  enabled: boolean;
  version?: string;
}

export interface MemoryEntry {
  id?: string;
  type: string;
  content: string;
  createdAt?: string;
  tags?: string[];
}

export interface SessionSummary {
  sessionId: string;
  title?: string;
  messageCount: number;
  createdAt?: string;
  updatedAt?: string;
}

// ── Known OpenClaw endpoint paths to try ─────────────────────────────────────

const PROBE_PATHS = ['/api/health', '/health', '/', '/api/status'];
const CONFIG_PATHS = ['/api/agent/config', '/api/config', '/api/settings/agent'];
const SKILLS_PATHS = ['/api/skills', '/api/agent/skills'];
const MEMORY_PATHS = ['/api/memory', '/api/memory/export', '/api/context/memories'];
const SESSIONS_PATHS = ['/api/sessions', '/api/chat/sessions', '/api/history/sessions'];

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class OpenClawBridgeService {
  private readonly logger = new Logger(OpenClawBridgeService.name);

  constructor(
    @InjectRepository(OpenClawInstance)
    private readonly instanceRepo: Repository<OpenClawInstance>,
    private readonly skillHub: OpenClawSkillHubService,
    @Inject(forwardRef(() => SkillService))
    private readonly skillService: SkillService,
  ) {}

  private isPlatformHosted(instance: OpenClawInstance): boolean {
    return !instance.instanceUrl || !!(instance.capabilities as any)?.platformHosted;
  }

  // ── Probe (quick check, unbound URL) ────────────────────────────────────────

  async probeUrl(url: string, token?: string): Promise<ProbeResult> {
    const base = url.replace(/\/$/, '');
    const client = this.makeClient(base, token);

    const start = Date.now();

    for (const path of PROBE_PATHS) {
      try {
        const res = await client.get(path, { timeout: 4000 });
        const latencyMs = Date.now() - start;
        const data = res.data ?? {};

        // Try to enrich probe with skill/memory counts
        let skillCount: number | undefined;
        let memoryEntries: number | undefined;

        try {
          const skillsRes = await client.get(
            await this.firstExistingPath(client, SKILLS_PATHS),
            { timeout: 3000 },
          );
          const raw = skillsRes.data;
          skillCount = Array.isArray(raw) ? raw.length : (raw?.skills?.length ?? undefined);
        } catch (_) { /* skip */ }

        try {
          const memRes = await client.get(
            await this.firstExistingPath(client, MEMORY_PATHS),
            { timeout: 3000 },
          );
          const raw = memRes.data;
          memoryEntries = Array.isArray(raw) ? raw.length : (raw?.entries?.length ?? undefined);
        } catch (_) { /* skip */ }

        return {
          reachable: true,
          instanceName: data.name ?? data.agentName ?? data.instanceName ?? undefined,
          version: data.version ?? undefined,
          model: data.model ?? data.currentModel ?? undefined,
          skillCount,
          memoryEntries,
          latencyMs,
        };
      } catch (_) {
        continue;
      }
    }

    return { reachable: false, error: 'Instance unreachable — check URL and ensure OpenClaw is running' };
  }

  // ── Full Migration (already-bound instance in DB) ────────────────────────────

  async migrateInstance(userId: string, instanceId: string): Promise<MigrationResult> {
    const instance = await this.instanceRepo.findOne({ where: { id: instanceId, userId } });
    if (!instance) throw new NotFoundException('Instance not found');
    if (!instance.instanceUrl) throw new BadRequestException('Instance has no URL configured');

    const base = instance.instanceUrl.replace(/\/$/, '');
    const client = this.makeClient(base, instance.instanceToken ?? undefined);
    const startedAt = new Date().toISOString();
    const categories: MigrationCategory[] = [];
    let config: Record<string, unknown> | undefined;
    const skills: SkillSnapshot[] = [];
    const memoryEntries: MemoryEntry[] = [];
    const sessionSummaries: SessionSummary[] = [];

    // 1. Agent config
    try {
      const path = await this.firstExistingPath(client, CONFIG_PATHS);
      const res = await client.get(path, { timeout: 5000 });
      config = res.data ?? {};
      // Patch instance name if blank
      if (!instance.name || instance.name === 'My Agent') {
        const agentName = (config as any)?.name ?? (config as any)?.agentName;
        if (agentName) {
          instance.name = String(agentName).slice(0, 150);
        }
      }
      categories.push({ category: 'config', status: 'ok', count: 1 });
    } catch (err) {
      categories.push({ category: 'config', status: 'skipped', detail: 'Endpoint not available' });
    }

    // 2. Skills
    try {
      const path = await this.firstExistingPath(client, SKILLS_PATHS);
      const res = await client.get(path, { timeout: 5000 });
      const raw: any[] = Array.isArray(res.data) ? res.data : (res.data?.skills ?? []);
      for (const s of raw) {
        skills.push({
          skillKey: s.key ?? s.skillKey ?? s.id ?? String(Math.random()),
          name: s.name ?? s.title ?? s.key ?? 'Unknown',
          enabled: s.enabled ?? s.active ?? true,
          version: s.version ?? undefined,
        });
      }
      categories.push({ category: 'skills', status: 'ok', count: skills.length });
    } catch (_) {
      categories.push({ category: 'skills', status: 'skipped', detail: 'Endpoint not available' });
    }

    // 3. Memory / context
    try {
      const path = await this.firstExistingPath(client, MEMORY_PATHS);
      const res = await client.get(path, { timeout: 8000 });
      const raw: any[] = Array.isArray(res.data) ? res.data : (res.data?.entries ?? res.data?.memories ?? []);
      for (const m of raw.slice(0, 500)) {  // cap at 500 entries
        memoryEntries.push({
          id: m.id ?? undefined,
          type: m.type ?? 'fact',
          content: m.content ?? m.text ?? m.value ?? JSON.stringify(m),
          createdAt: m.createdAt ?? m.created_at ?? undefined,
          tags: Array.isArray(m.tags) ? m.tags : undefined,
        });
      }
      categories.push({ category: 'memory', status: 'ok', count: memoryEntries.length });
    } catch (_) {
      categories.push({ category: 'memory', status: 'skipped', detail: 'Endpoint not available' });
    }

    // 4. Chat sessions (summaries only — not full content)
    try {
      const path = await this.firstExistingPath(client, SESSIONS_PATHS);
      const res = await client.get(path, { timeout: 8000 });
      const raw: any[] = Array.isArray(res.data) ? res.data : (res.data?.sessions ?? []);
      for (const s of raw.slice(0, 200)) {  // cap at 200 sessions
        sessionSummaries.push({
          sessionId: s.id ?? s.sessionId ?? String(Math.random()),
          title: s.title ?? s.name ?? undefined,
          messageCount: s.messageCount ?? s.messages?.length ?? 0,
          createdAt: s.createdAt ?? s.created_at ?? undefined,
          updatedAt: s.updatedAt ?? s.updated_at ?? undefined,
        });
      }
      categories.push({ category: 'sessions', status: 'ok', count: sessionSummaries.length });
    } catch (_) {
      categories.push({ category: 'sessions', status: 'skipped', detail: 'Endpoint not available' });
    }

    // Persist migrated metadata back to instance row
    instance.personality = instance.personality ?? (config as any)?.personality ?? undefined;
    await this.instanceRepo.save(instance);

    const finishedAt = new Date().toISOString();
    const totalMigrated = skills.length + memoryEntries.length + sessionSummaries.length + (config ? 1 : 0);

    this.logger.log(
      `Migration complete for instance ${instanceId}: ${totalMigrated} items (${skills.length} skills, ${memoryEntries.length} memories, ${sessionSummaries.length} sessions)`,
    );

    return {
      instanceId,
      startedAt,
      finishedAt,
      categories,
      config,
      skills,
      memoryEntries,
      sessionSummaries,
      totalMigrated,
    };
  }

  // ── Install hub skill into a bound OpenClaw instance ─────────────────────────

  async installHubSkillToInstance(
    userId: string,
    instanceId: string,
    skillId: string,
  ): Promise<{ success: boolean; message: string; skillKey?: string }> {
    const instance = await this.instanceRepo.findOne({ where: { id: instanceId, userId } });
    if (!instance) throw new NotFoundException('Instance not found');

    // Resolve skill from hub catalog by exact id/key/slug before falling back to fuzzy search.
    const skill =
      await this.skillHub.getSkillById(skillId) ??
      await this.skillHub.getSkillBySlug(skillId) ??
      (await this.skillHub.getSkills({ query: skillId, limit: 10 })).items.find(
        (s) => s.id === skillId || s.key === skillId || s.hubSlug === skillId,
      ) ??
      null;

    if (!skill) throw new NotFoundException(`Hub skill '${skillId}' not found`);

    // ALWAYS persist an Agentrix-side install row keyed to the user, regardless
    // of hosting type, so the skill shows up in "我的技能" (Bug fix 2026-06-01:
    // self-hosted installs previously wrote nothing to the Agentrix DB).
    try {
      await this.skillService.recordUserHubInstall({
        hub: {
          id: skill.id,
          key: skill.key,
          name: skill.name,
          displayName: skill.displayName,
          description: skill.description,
          category: skill.category,
          version: skill.version,
          tags: skill.tags,
        },
        instanceId,
        userId,
      });
    } catch (err: any) {
      this.logger.warn(`recordUserHubInstall failed for ${skill.key}: ${err?.message}`);
    }

    if (this.isPlatformHosted(instance)) {
      try {
        await this.skillService.installSkillForInstance(instanceId, skill.id, userId);
      } catch (err: any) {
        if (!String(err?.message || '').includes('already installed')) {
          throw err;
        }
      }

      return {
        success: true,
        message: `Skill '${skill.displayName ?? skill.name}' is now active on '${instance.name}'`,
        skillKey: skill.key,
      };
    }

    if (!instance.instanceUrl) throw new BadRequestException('Instance has no URL configured');

    const base = instance.instanceUrl.replace(/\/$/, '');
    const client = this.makeClient(base, instance.instanceToken ?? undefined);

    // Try common install paths that OpenClaw instances may expose
    const installPaths = ['/api/skills/install', '/api/skills', '/api/agent/skills/install', '/api/agent/skills'];
    const payload = {
      skillKey: skill.key,
      name: skill.displayName ?? skill.name,
      description: skill.description,
      category: skill.category,
      version: skill.version ?? '1.0.0',
      enabled: true,
      source: 'hub',
      hubSkillId: skill.id,
      tags: skill.tags ?? [],
    };

    let lastError: string = '';
    for (const path of installPaths) {
      try {
        await client.post(path, payload, { timeout: 8000 });
        this.logger.log(`Installed skill '${skill.key}' to instance ${instanceId} via ${path}`);
        return { success: true, message: `Skill '${skill.name}' installed successfully`, skillKey: skill.key };
      } catch (err: any) {
        const status = err?.response?.status;
        // 404 = path doesn't exist, try next; other errors = real failure
        if (status !== 404 && status !== 405) {
          lastError = err?.response?.data?.message ?? err?.message ?? 'Install failed';
          break;
        }
        lastError = `${path} returned ${status}`;
      }
    }

    throw new BadRequestException(
      `Could not install skill on instance '${instance.name}': ${lastError}. Ensure your OpenClaw instance supports skill installation via its API.`,
    );
  }

  // ── LAN Candidate Generation ─────────────────────────────────────────────────
  // The actual probing happens on the mobile side (same LAN).
  // This endpoint provides the smart candidate list + well-known ports to try.

  getDiscoveryCandidates(): { ports: number[]; paths: string[]; timeoutMs: number } {
    return {
      ports: [3001, 8080, 11434, 5000, 4000, 7860, 3000],
      paths: PROBE_PATHS,
      timeoutMs: 2000,
    };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private makeClient(baseURL: string, token?: string): AxiosInstance {
    return axios.create({
      baseURL,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      timeout: 6000,
    });
  }

  private async firstExistingPath(client: AxiosInstance, paths: string[]): Promise<string> {
    for (const p of paths) {
      try {
        await client.head(p, { timeout: 2000 });
        return p;
      } catch (_) { /* try next */ }
    }
    // Return first path as fallback — let caller handle 404
    return paths[0];
  }
}
