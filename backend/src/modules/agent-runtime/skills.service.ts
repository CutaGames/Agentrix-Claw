import { Injectable, Logger } from '@nestjs/common';

export interface Skill {
  id: string;
  name: string;
  description: string;
  version: string;
  enabled: boolean;
  handler: (params: any) => Promise<any>;
}

export type AgentSkillSourceKind = 'workspace' | 'project-agent' | 'personal-agent' | 'managed' | 'bundled' | 'extra';

export interface AgentSkillDefinition {
  name: string;
  description: string;
  version?: string;
  path?: string;
  sourceKind: AgentSkillSourceKind;
  body: string;
  metadata?: {
    gating?: {
      allowlist?: string[];
      agents?: string[];
    };
    tokenEstimate?: number;
    [key: string]: any;
  };
  requires?: {
    bins?: string[];
    env?: string[];
    config?: string[];
  };
}

export interface AgentSkillSource {
  kind: AgentSkillSourceKind;
  path?: string;
  markdown: string;
}

export interface SkillDangerFinding {
  severity: 'low' | 'medium' | 'high';
  rule: string;
  message: string;
  match: string;
}

export interface SkillRoutingEval {
  intent: string;
  expectedSkill: string;
}

@Injectable()
export class SkillsService {
  private readonly logger = new Logger(SkillsService.name);
  private skills: Map<string, Skill> = new Map();

  constructor() {
    this.registerDefaultSkills();
  }

  /**
   * 注册技能
   */
  registerSkill(skill: Skill): void {
    this.skills.set(skill.id, skill);
    this.logger.log(`注册技能: ${skill.id} (${skill.name})`);
  }

  /**
   * 获取所有技能
   */
  getAllSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  /**
   * 获取启用的技能
   */
  getEnabledSkills(): Skill[] {
    return Array.from(this.skills.values()).filter(s => s.enabled);
  }

  parseAgentSkillMarkdown(markdown: string, sourceKind: AgentSkillSourceKind = 'workspace', filePath?: string): AgentSkillDefinition {
    const { frontmatter, body } = this.extractFrontmatter(markdown || '');
    const parsed = this.parseSimpleYaml(frontmatter);
    const name = String(parsed.name || '').trim();
    const description = String(parsed.description || '').trim();
    if (!name || !description) {
      throw new Error('SKILL.md frontmatter must include name and description');
    }

    return {
      name,
      description,
      version: parsed.version ? String(parsed.version) : undefined,
      path: filePath,
      sourceKind,
      body,
      metadata: parsed.metadata || {},
      requires: parsed.requires || {},
    };
  }

  resolveAgentSkills(
    sources: AgentSkillSource[],
    options: { agentId?: string; allowlist?: string[] } = {},
  ): AgentSkillDefinition[] {
    const priority: Record<AgentSkillSourceKind, number> = {
      workspace: 0,
      'project-agent': 1,
      'personal-agent': 2,
      managed: 3,
      bundled: 4,
      extra: 5,
    };
    const allowlist = new Set((options.allowlist || []).map(item => item.toLowerCase()));
    const byName = new Map<string, AgentSkillDefinition>();

    for (const source of sources) {
      const definition = this.parseAgentSkillMarkdown(source.markdown, source.kind, source.path);
      const findings = this.scanSkillMarkdownForDangerousCode(source.markdown);
      if (findings.some(finding => finding.severity === 'high')) {
        definition.metadata = {
          ...definition.metadata,
          quarantine: true,
          dangerousFindings: findings,
        };
      }
      if (!this.skillVisibleToAgent(definition, options.agentId)) continue;
      if (allowlist.size > 0 && !allowlist.has(definition.name.toLowerCase())) continue;

      const key = definition.name.toLowerCase();
      const existing = byName.get(key);
      if (!existing || priority[definition.sourceKind] < priority[existing.sourceKind]) {
        byName.set(key, definition);
      }
    }

    return [...byName.values()].sort((a, b) => priority[a.sourceKind] - priority[b.sourceKind] || a.name.localeCompare(b.name));
  }

  scanSkillMarkdownForDangerousCode(markdown: string): SkillDangerFinding[] {
    const rules: Array<{ severity: SkillDangerFinding['severity']; rule: string; pattern: RegExp; message: string }> = [
      { severity: 'high', rule: 'destructive-root-delete', pattern: /rm\s+-rf\s+\/(?:\s|$)/i, message: 'Destructive root filesystem deletion is not allowed.' },
      { severity: 'high', rule: 'curl-pipe-shell', pattern: /(curl|wget)\b[^\n|]*\|\s*(sh|bash|zsh|powershell|pwsh)\b/i, message: 'Piping remote content directly into a shell is unsafe.' },
      { severity: 'high', rule: 'powershell-encoded-command', pattern: /powershell(?:\.exe)?\s+.*-encodedcommand\b/i, message: 'Encoded PowerShell commands are blocked until manually reviewed.' },
      { severity: 'medium', rule: 'dynamic-eval', pattern: /\b(eval|new Function)\s*\(/i, message: 'Dynamic code evaluation requires review.' },
      { severity: 'medium', rule: 'node-child-process', pattern: /\bchild_process\b|\bexecSync\s*\(/i, message: 'Process spawning in skills requires a tool policy.' },
      { severity: 'low', rule: 'secret-env-read', pattern: /process\.env\.[A-Z0-9_]+/g, message: 'Environment variable access should be declared under requires.env.' },
    ];

    const findings: SkillDangerFinding[] = [];
    for (const rule of rules) {
      const match = markdown.match(rule.pattern);
      if (match?.[0]) {
        findings.push({
          severity: rule.severity,
          rule: rule.rule,
          message: rule.message,
          match: match[0].slice(0, 160),
        });
      }
    }
    return findings;
  }

  evaluateSkillRouting(
    evals: SkillRoutingEval[],
    skills: AgentSkillDefinition[],
  ): { total: number; correct: number; accuracy: number; failures: Array<SkillRoutingEval & { predictedSkill?: string }> } {
    const failures: Array<SkillRoutingEval & { predictedSkill?: string }> = [];
    let correct = 0;
    for (const item of evals) {
      const predicted = this.routeIntentToSkill(item.intent, skills);
      if (predicted?.name.toLowerCase() === item.expectedSkill.toLowerCase()) {
        correct += 1;
      } else {
        failures.push({ ...item, predictedSkill: predicted?.name });
      }
    }
    return {
      total: evals.length,
      correct,
      accuracy: evals.length ? Number((correct / evals.length).toFixed(4)) : 0,
      failures,
    };
  }

  /**
   * 执行技能
   */
  async executeSkill(skillId: string, params: any): Promise<any> {
    const skill = this.skills.get(skillId);
    if (!skill) {
      throw new Error(`技能不存在: ${skillId}`);
    }

    if (!skill.enabled) {
      throw new Error(`技能已禁用: ${skillId}`);
    }

    try {
      return await skill.handler(params);
    } catch (error: any) {
      this.logger.error(`执行技能失败: ${skillId}, 错误: ${error.message}`);
      throw error;
    }
  }

  /**
   * 注册默认技能
   */
  private registerDefaultSkills(): void {
    // 支付技能
    this.registerSkill({
      id: 'payment',
      name: '支付',
      description: '处理支付请求',
      version: '1.0.0',
      enabled: true,
      handler: async (params: any) => {
        return { success: true, message: '支付处理中' };
      },
    });

    // 查询余额技能
    this.registerSkill({
      id: 'balance',
      name: '查询余额',
      description: '查询账户余额',
      version: '1.0.0',
      enabled: true,
      handler: async (params: any) => {
        return { balance: 0, currency: 'USDC' };
      },
    });

    // 交易历史技能
    this.registerSkill({
      id: 'transaction_history',
      name: '交易历史',
      description: '查询交易历史',
      version: '1.0.0',
      enabled: true,
      handler: async (params: any) => {
        return { transactions: [] };
      },
    });
  }

  private routeIntentToSkill(intent: string, skills: AgentSkillDefinition[]): AgentSkillDefinition | undefined {
    const tokens = this.tokenize(intent);
    return skills
      .map(skill => ({ skill, score: this.skillRouteScore(skill, tokens) }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name))
      .map(item => item.skill)[0];
  }

  private skillRouteScore(skill: AgentSkillDefinition, tokens: string[]): number {
    const haystack = `${skill.name} ${skill.description} ${skill.body.slice(0, 1000)}`.toLowerCase();
    return tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0);
  }

  private skillVisibleToAgent(skill: AgentSkillDefinition, agentId?: string): boolean {
    const gating = skill.metadata?.gating || {};
    const allowed = gating.agents || gating.allowlist || [];
    if (!allowed.length || !agentId) return true;
    return allowed.includes(agentId) || allowed.includes('*');
  }

  private extractFrontmatter(markdown: string): { frontmatter: string; body: string } {
    const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!match) return { frontmatter: '', body: markdown };
    return { frontmatter: match[1], body: match[2] || '' };
  }

  private parseSimpleYaml(yaml: string): Record<string, any> {
    const root: Record<string, any> = {};
    const stack: Array<{ indent: number; target: Record<string, any> }> = [{ indent: -1, target: root }];
    for (const rawLine of yaml.split(/\r?\n/)) {
      if (!rawLine.trim() || rawLine.trim().startsWith('#')) continue;
      const match = rawLine.match(/^(\s*)([A-Za-z0-9_.-]+):\s*(.*)$/);
      if (!match) continue;
      const indent = match[1].length;
      const key = match[2];
      const rawValue = match[3];
      while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
      const parent = stack[stack.length - 1].target;
      if (!rawValue) {
        parent[key] = {};
        stack.push({ indent, target: parent[key] });
      } else {
        parent[key] = this.parseYamlScalar(rawValue);
      }
    }
    return root;
  }

  private parseYamlScalar(value: string): any {
    const trimmed = value.trim().replace(/^['"]|['"]$/g, '');
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      return trimmed.slice(1, -1).split(',').map(item => item.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
    }
    return trimmed;
  }

  private tokenize(text: string): string[] {
    return (text || '').toLowerCase().match(/[a-z0-9_.$/-]+|[\u4e00-\u9fa5]+/g) || [];
  }
}

