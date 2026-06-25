import {
  normalizeToolName,
  capabilityMatches,
  isToolDeclared,
  evaluateToolCall,
  WILDCARD_ALL,
} from './capability-gate';

/**
 * 能力门控(G 组)单测 —— 单一权威来源匹配逻辑。
 *
 * 覆盖:
 *  - 需求 7.22「声明即门控」:未声明工具被拒(deny-by-default)。
 *  - 精确 / 前缀通配 / 全通配 匹配语义;大小写与空白归一化。
 */
describe('capability-gate (G 组 — 单一权威来源)', () => {
  describe('normalizeToolName', () => {
    it('去空白并转小写', () => {
      expect(normalizeToolName('  Skill_Search ')).toBe('skill_search');
    });
    it('null/undefined → 空串', () => {
      expect(normalizeToolName(null)).toBe('');
      expect(normalizeToolName(undefined)).toBe('');
    });
  });

  describe('capabilityMatches', () => {
    it('精确匹配(归一化后相等)', () => {
      expect(capabilityMatches('skill_search', 'SKILL_SEARCH')).toBe(true);
      expect(capabilityMatches('skill_search', 'skill_install')).toBe(false);
    });
    it('前缀通配 mcp_* 匹配以 mcp_ 开头的工具', () => {
      expect(capabilityMatches('mcp_*', 'mcp_github_create_issue')).toBe(true);
      expect(capabilityMatches('mcp_*', 'skill_search')).toBe(false);
    });
    it('全通配 * 匹配任意工具', () => {
      expect(capabilityMatches(WILDCARD_ALL, 'anything')).toBe(true);
    });
    it('空 token / 空工具名 → 不匹配', () => {
      expect(capabilityMatches('', 'skill_search')).toBe(false);
      expect(capabilityMatches('skill_search', '')).toBe(false);
    });
  });

  describe('isToolDeclared (deny-by-default)', () => {
    it('已声明工具 → 允许', () => {
      expect(isToolDeclared(['skill_search', 'get_balance'], 'skill_search')).toBe(true);
    });
    it('未声明工具 → 拒绝(7.22 声明即门控)', () => {
      expect(isToolDeclared(['skill_search'], 'quickpay_execute')).toBe(false);
    });
    it('capabilities 为空 / 未配置 → 一律拒绝(deny-by-default)', () => {
      expect(isToolDeclared([], 'skill_search')).toBe(false);
      expect(isToolDeclared(undefined, 'skill_search')).toBe(false);
      expect(isToolDeclared(null, 'skill_search')).toBe(false);
    });
    it('通配声明覆盖子集', () => {
      expect(isToolDeclared(['mcp_*'], 'mcp_slack_post')).toBe(true);
      expect(isToolDeclared([WILDCARD_ALL], 'whatever_tool')).toBe(true);
    });
  });

  describe('evaluateToolCall', () => {
    it('未声明工具返回结构化拒绝原因', () => {
      const r = evaluateToolCall(['skill_search'], 'x402_pay');
      expect(r.allowed).toBe(false);
      expect(r.denial?.code).toBe('CAPABILITY_NOT_DECLARED');
      expect(r.denial?.tool).toBe('x402_pay');
      expect(r.denial?.message).toContain('声明即门控');
    });
    it('已声明工具 → allowed', () => {
      expect(evaluateToolCall(['x402_pay'], 'x402_pay')).toEqual({ allowed: true });
    });
  });
});
