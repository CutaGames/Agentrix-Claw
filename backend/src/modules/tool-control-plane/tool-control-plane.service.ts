import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ToolRegistryService } from '../tool-registry/tool-registry.service';
import { AgentrixTool, ToolContext, ToolResult } from '../tool-registry/interfaces';

export type ToolRiskBand = 'L0' | 'L1' | 'L2' | 'L3';
export type ToolPolicyDecision = 'allow' | 'ask' | 'deny';

export interface ToolSchemaLike {
  name?: string;
  description?: string;
  input_schema?: Record<string, any>;
  function?: {
    name?: string;
    description?: string;
    parameters?: Record<string, any>;
  };
  riskLevel?: number | ToolRiskBand;
  isReadOnly?: boolean;
  isConcurrencySafe?: boolean;
  requiresPayment?: boolean;
}

export interface ToolsetSnapshot {
  id: string;
  source: 'registry' | 'runtime' | 'mcp' | 'plugin' | 'desktop' | 'external';
  tools: ToolSchemaLike[];
}

export interface ToolPolicyReport {
  generatedAt: string;
  status: 'pass' | 'warn' | 'fail';
  summary: {
    totalTools: number;
    toolsetCount: number;
    duplicateNameCount: number;
    invalidNameCount: number;
    highRiskToolCount: number;
    paymentToolCount: number;
  };
  riskBands: Record<ToolRiskBand, number>;
  duplicateNames: Array<{ name: string; toolsets: string[] }>;
  invalidNames: Array<{ name: string; toolsetId: string; reason: string }>;
  safeBinPolicy: {
    maxProgrammaticCalls: number;
    maxProgrammaticRisk: ToolRiskBand;
    highRiskRequiresApproval: boolean;
    browserPrivateNetworkBlocked: boolean;
    allowPrivateBrowserTargets: boolean;
    allowedBrowserHosts: string[];
  };
  recommendations: string[];
}

export interface BrowserPolicyCheck {
  url: string;
  allowed: boolean;
  reason?: string;
  normalizedHost?: string;
}

export interface ProgrammaticToolCall {
  id?: string;
  name: string;
  input?: Record<string, any>;
}

export interface ProgrammaticToolPlanRequest {
  toolCalls: ProgrammaticToolCall[];
  dryRun?: boolean;
  maxRisk?: ToolRiskBand;
  sessionId?: string;
  agentId?: string;
  instanceId?: string;
  metadata?: Record<string, any>;
}

export interface ProgrammaticToolPlanResult {
  accepted: boolean;
  dryRun: boolean;
  results: Array<{
    id: string;
    name: string;
    decision: ToolPolicyDecision;
    riskLevel: ToolRiskBand;
    reason?: string;
    result?: ToolResult;
  }>;
  rejectedReason?: string;
}

const TOOL_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]{1,63}$/;
const DEFAULT_MAX_PROGRAMMATIC_CALLS = 8;
const DEFAULT_MAX_PROGRAMMATIC_RISK: ToolRiskBand = 'L1';

@Injectable()
export class ToolControlPlaneService {
  private readonly logger = new Logger(ToolControlPlaneService.name);

  constructor(
    private readonly toolRegistryService: ToolRegistryService,
    private readonly configService: ConfigService,
  ) {}

  buildPolicyReport(extraToolsets: ToolsetSnapshot[] = []): ToolPolicyReport {
    const registryTools = this.toolRegistryService.getAll().map((tool) => this.toSchemaLike(tool));
    const toolsets: ToolsetSnapshot[] = [
      { id: 'agentrix-tool-registry', source: 'registry', tools: registryTools },
      ...extraToolsets,
    ];

    const names = new Map<string, Set<string>>();
    const invalidNames: ToolPolicyReport['invalidNames'] = [];
    const riskBands: Record<ToolRiskBand, number> = { L0: 0, L1: 0, L2: 0, L3: 0 };
    let totalTools = 0;
    let paymentToolCount = 0;

    for (const toolset of toolsets) {
      for (const tool of toolset.tools || []) {
        totalTools += 1;
        const name = this.extractToolName(tool);
        if (!name) {
          invalidNames.push({ name: '', toolsetId: toolset.id, reason: 'missing tool name' });
          continue;
        }
        if (!TOOL_NAME_PATTERN.test(name)) {
          invalidNames.push({ name, toolsetId: toolset.id, reason: 'tool names must be stable provider-safe identifiers' });
        }
        if (!names.has(name)) {
          names.set(name, new Set<string>());
        }
        names.get(name)!.add(toolset.id);

        const risk = this.inferRiskBand(tool);
        riskBands[risk] += 1;
        if (tool.requiresPayment || /pay|payment|purchase|order|bet|trade|wallet|transfer/i.test(`${name} ${this.extractToolDescription(tool)}`)) {
          paymentToolCount += 1;
        }
      }
    }

    const duplicateNames = Array.from(names.entries())
      .filter(([, toolsetIds]) => toolsetIds.size > 1)
      .map(([name, toolsetIds]) => ({ name, toolsets: [...toolsetIds].sort() }))
      .sort((left, right) => left.name.localeCompare(right.name));

    const highRiskToolCount = riskBands.L2 + riskBands.L3;
    const recommendations: string[] = [];
    if (duplicateNames.length > 0) {
      recommendations.push('Namespace or rename duplicate MCP/plugin/runtime tools before exposing them to chat models.');
    }
    if (invalidNames.length > 0) {
      recommendations.push('Normalize tool names to provider-safe identifiers before schema injection.');
    }
    if (highRiskToolCount > 0) {
      recommendations.push('Keep L2/L3 tools behind explicit user approval and session-scoped audit events.');
    }

    const status: ToolPolicyReport['status'] = duplicateNames.length > 0 || invalidNames.length > 0
      ? 'fail'
      : highRiskToolCount > 0
        ? 'warn'
        : 'pass';

    return {
      generatedAt: new Date().toISOString(),
      status,
      summary: {
        totalTools,
        toolsetCount: toolsets.length,
        duplicateNameCount: duplicateNames.length,
        invalidNameCount: invalidNames.length,
        highRiskToolCount,
        paymentToolCount,
      },
      riskBands,
      duplicateNames,
      invalidNames,
      safeBinPolicy: {
        maxProgrammaticCalls: this.maxProgrammaticCalls(),
        maxProgrammaticRisk: this.maxProgrammaticRisk(),
        highRiskRequiresApproval: true,
        browserPrivateNetworkBlocked: !this.allowPrivateBrowserTargets(),
        allowPrivateBrowserTargets: this.allowPrivateBrowserTargets(),
        allowedBrowserHosts: this.allowedBrowserHosts(),
      },
      recommendations,
    };
  }

  checkBrowserTarget(url: string): BrowserPolicyCheck {
    const raw = String(url || '').trim();
    if (!raw) {
      return { url: raw, allowed: false, reason: 'empty URL' };
    }

    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      return { url: raw, allowed: false, reason: 'invalid URL' };
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { url: raw, allowed: false, reason: 'only http/https browser targets are allowed' };
    }

    const host = parsed.hostname.toLowerCase();
    const allowedHosts = this.allowedBrowserHosts();
    if (allowedHosts.length > 0 && !allowedHosts.includes(host)) {
      return { url: raw, allowed: false, normalizedHost: host, reason: 'host is not in AGENT_TOOL_BROWSER_ALLOW_HOSTS' };
    }

    if (!this.allowPrivateBrowserTargets() && this.isPrivateOrLocalHost(host)) {
      return { url: raw, allowed: false, normalizedHost: host, reason: 'private network and localhost browser targets are blocked by default' };
    }

    return { url: raw, allowed: true, normalizedHost: host };
  }

  async executeProgrammaticToolPlan(
    userId: string,
    request: ProgrammaticToolPlanRequest,
  ): Promise<ProgrammaticToolPlanResult> {
    const calls = Array.isArray(request?.toolCalls) ? request.toolCalls : [];
    const maxCalls = this.maxProgrammaticCalls();
    if (calls.length === 0) {
      return { accepted: false, dryRun: !!request?.dryRun, results: [], rejectedReason: 'toolCalls is required' };
    }
    if (calls.length > maxCalls) {
      return { accepted: false, dryRun: !!request?.dryRun, results: [], rejectedReason: `too many tool calls; max ${maxCalls}` };
    }

    const maxRisk = request.maxRisk || this.maxProgrammaticRisk();
    const ctx: ToolContext = {
      userId,
      sessionId: request.sessionId || `ptc-${Date.now()}`,
      agentId: request.agentId,
      instanceId: request.instanceId,
      metadata: {
        ...(request.metadata || {}),
        source: 'programmatic-tool-calling',
      },
    };

    const results: ProgrammaticToolPlanResult['results'] = [];
    for (let index = 0; index < calls.length; index += 1) {
      const call = calls[index];
      const name = String(call?.name || '').trim();
      const id = call.id || `${index + 1}`;
      const tool = name ? this.toolRegistryService.get(name) : undefined;
      const decision = this.evaluateToolCall(name, tool, maxRisk);

      if (decision.decision !== 'allow' || request.dryRun) {
        results.push({ id, name, ...decision });
        continue;
      }

      const result = await this.toolRegistryService.execute(name, call.input || {}, ctx);
      results.push({ id, name, ...decision, result });
    }

    return {
      accepted: results.every((result) => result.decision === 'allow'),
      dryRun: !!request.dryRun,
      results,
    };
  }

  getReadinessChecks() {
    const report = this.buildPolicyReport();
    const browserBlocked = !this.checkBrowserTarget('http://127.0.0.1:8080/metadata').allowed;
    const browserPublicAllowed = this.checkBrowserTarget('https://agentrix.top/').allowed;
    return [
      {
        id: 'tool-control-plane-policy',
        title: 'Tool control plane policy',
        status: report.status,
        message: report.status === 'pass'
          ? 'Tool registry names and risk policy are structurally valid.'
          : 'Tool registry has policy warnings or blocking naming collisions.',
        details: report.summary,
        remediation: report.status === 'pass' ? undefined : report.recommendations.join(' '),
      },
      {
        id: 'browser-ssrf-policy',
        title: 'Browser SSRF policy',
        status: browserBlocked && browserPublicAllowed ? 'pass' : 'fail',
        message: browserBlocked && browserPublicAllowed
          ? 'Browser targets fail closed for private/local addresses while allowing public HTTPS targets.'
          : 'Browser target policy is not fail-closed for private network URLs or blocks normal public HTTPS targets.',
        details: {
          privateBlocked: browserBlocked,
          publicAllowed: browserPublicAllowed,
          allowPrivateBrowserTargets: this.allowPrivateBrowserTargets(),
        },
        remediation: browserBlocked && browserPublicAllowed
          ? undefined
          : 'Unset AGENT_TOOL_BROWSER_ALLOW_PRIVATE for release builds and configure AGENT_TOOL_BROWSER_ALLOW_HOSTS only when a narrow allowlist is required.',
      },
    ];
  }

  private evaluateToolCall(name: string, tool: AgentrixTool | undefined, maxRisk: ToolRiskBand): {
    decision: ToolPolicyDecision;
    riskLevel: ToolRiskBand;
    reason?: string;
  } {
    if (!name || !TOOL_NAME_PATTERN.test(name)) {
      return { decision: 'deny', riskLevel: 'L3', reason: 'invalid tool name' };
    }
    if (!tool) {
      return { decision: 'deny', riskLevel: 'L3', reason: 'tool is not registered for PTC execution' };
    }

    const riskLevel = this.inferRiskBand(this.toSchemaLike(tool));
    if (this.riskRank(riskLevel) > this.riskRank(maxRisk)) {
      return { decision: 'ask', riskLevel, reason: `risk ${riskLevel} exceeds max ${maxRisk}` };
    }
    if (tool.requiresPayment) {
      return { decision: 'ask', riskLevel, reason: 'payment tools require explicit approval' };
    }
    return { decision: 'allow', riskLevel };
  }

  private toSchemaLike(tool: AgentrixTool): ToolSchemaLike {
    return {
      name: tool.name,
      description: tool.description,
      riskLevel: tool.riskLevel,
      isReadOnly: tool.isReadOnly,
      isConcurrencySafe: tool.isConcurrencySafe,
      requiresPayment: tool.requiresPayment,
    };
  }

  private extractToolName(tool: ToolSchemaLike): string {
    return String(tool?.name || tool?.function?.name || '').trim();
  }

  private extractToolDescription(tool: ToolSchemaLike): string {
    return String(tool?.description || tool?.function?.description || '').trim();
  }

  private inferRiskBand(tool: ToolSchemaLike): ToolRiskBand {
    const explicit = tool.riskLevel;
    if (explicit === 'L0' || explicit === 'L1' || explicit === 'L2' || explicit === 'L3') {
      return explicit;
    }
    if (typeof explicit === 'number') {
      return explicit <= 0 ? 'L0' : explicit === 1 ? 'L1' : explicit === 2 ? 'L2' : 'L3';
    }

    const haystack = `${this.extractToolName(tool)} ${this.extractToolDescription(tool)}`.toLowerCase();
    if (/delete|write|patch|apply|commit|deploy|transfer|withdraw|trade|bet|purchase|payment|shell|command|exec/.test(haystack)) {
      return /deploy|transfer|withdraw|trade|payment|shell|command|exec/.test(haystack) ? 'L2' : 'L1';
    }
    return tool.isReadOnly === false ? 'L1' : 'L0';
  }

  private maxProgrammaticCalls(): number {
    const raw = Number(this.configService.get<string>('AGENT_TOOL_PTC_MAX_CALLS') || DEFAULT_MAX_PROGRAMMATIC_CALLS);
    return Number.isFinite(raw) ? Math.max(1, Math.min(24, Math.floor(raw))) : DEFAULT_MAX_PROGRAMMATIC_CALLS;
  }

  private maxProgrammaticRisk(): ToolRiskBand {
    const raw = String(this.configService.get<string>('AGENT_TOOL_PTC_MAX_RISK') || DEFAULT_MAX_PROGRAMMATIC_RISK).toUpperCase();
    return raw === 'L0' || raw === 'L1' || raw === 'L2' || raw === 'L3' ? raw : DEFAULT_MAX_PROGRAMMATIC_RISK;
  }

  private riskRank(risk: ToolRiskBand): number {
    return { L0: 0, L1: 1, L2: 2, L3: 3 }[risk];
  }

  private allowPrivateBrowserTargets(): boolean {
    return this.configService.get<string>('AGENT_TOOL_BROWSER_ALLOW_PRIVATE') === 'true';
  }

  private allowedBrowserHosts(): string[] {
    return String(this.configService.get<string>('AGENT_TOOL_BROWSER_ALLOW_HOSTS') || '')
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean);
  }

  private isPrivateOrLocalHost(host: string): boolean {
    if (!host) return true;
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
    if (/^127\./.test(host) || host === '0.0.0.0' || host === '::1' || host === '[::1]') return true;
    if (/^10\./.test(host) || /^192\.168\./.test(host)) return true;
    const match = host.match(/^172\.(\d+)\./);
    if (match) {
      const octet = Number(match[1]);
      if (octet >= 16 && octet <= 31) return true;
    }
    if (/^169\.254\./.test(host)) return true;
    return false;
  }
}