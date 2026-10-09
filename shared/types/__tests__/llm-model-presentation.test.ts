import type { ModelSelection } from '../llm-model-selection';
import {
  billingLabelOf,
  groupSelectionsByModel,
  isPoolSelection,
  isSelectableSelection,
  sourceBadgeOf,
  spendsPlatformBudget,
  unavailableHintOf,
} from '../llm-model-presentation';

const MODEL = 'gpt-5.6-sol';

function selection(overrides: Partial<ModelSelection> = {}): ModelSelection {
  const providerId = overrides.providerId ?? 'openai';
  const modelId = overrides.modelId ?? MODEL;
  return {
    selectionId: `${providerId}:${modelId}`,
    providerId,
    modelId,
    upstreamModelId: modelId,
    label: modelId,
    billingType: 'api-key',
    credentialSource: 'byo',
    availability: 'available',
    capabilities: ['chat'],
    requiresAuth: true,
    catalogVersion: 'provider-catalog:v1',
    ...overrides,
  };
}

describe('shared model presentation', () => {
  it('labels who pays for each source', () => {
    const byo = sourceBadgeOf(selection());
    const pool = sourceBadgeOf(selection({ providerId: 'agentrix-pool', credentialSource: 'pool' }));

    expect(byo.labelZh).toBe('自带 Key');
    expect(byo.billingZh).toContain('厂商账单');
    expect(pool.labelZh).toBe('Agentrix 平台额度');
    expect(pool.billingZh).toContain('订阅预算');
  });

  it('separates billing-domain semantics from billing type wording', () => {
    expect(billingLabelOf('api-key', 'zh')).toBe('按 Key 计费');
    expect(billingLabelOf('subscription', 'zh')).toBe('订阅额度');
    expect(billingLabelOf('platform', 'zh')).toBe('平台额度');
    expect(spendsPlatformBudget(selection())).toBe(false);
    expect(spendsPlatformBudget(selection({ credentialSource: 'pool' }))).toBe(true);
    expect(spendsPlatformBudget(selection({ credentialSource: 'platform-claude' }))).toBe(true);
  });

  it('groups by model while keeping every source option', () => {
    const groups = groupSelectionsByModel([
      selection(),
      selection({ providerId: 'agentrix-pool', credentialSource: 'pool', billingType: 'platform' }),
      selection({ modelId: 'claude-opus-4-7', providerId: 'platform', credentialSource: 'platform-env', billingType: 'platform' }),
    ]);

    expect(groups).toHaveLength(2);
    const grouped = groups.find((group) => group.modelId === MODEL)!;
    expect(grouped.options).toHaveLength(2);
    expect(grouped.hasMultipleBillingDomains).toBe(true);
    expect(grouped.options.map((option) => option.selectionId).sort()).toEqual([
      `agentrix-pool:${MODEL}`,
      `openai:${MODEL}`,
    ]);

    const single = groups.find((group) => group.modelId === 'claude-opus-4-7')!;
    expect(single.hasMultipleBillingDomains).toBe(false);
  });

  it('preserves server ordering of groups', () => {
    const groups = groupSelectionsByModel([
      selection({ modelId: 'zeta' }),
      selection({ modelId: 'alpha' }),
    ]);

    expect(groups.map((group) => group.modelId)).toEqual(['zeta', 'alpha']);
  });

  it('marks only available and degraded entries as selectable', () => {
    expect(isSelectableSelection(selection({ availability: 'available' }))).toBe(true);
    expect(isSelectableSelection(selection({ availability: 'degraded' }))).toBe(true);
    expect(isSelectableSelection(selection({ availability: 'unavailable' }))).toBe(false);
    expect(isSelectableSelection(selection({ availability: 'disabled' }))).toBe(false);
  });

  it('explains why an entry is not selectable without leaking internals', () => {
    expect(unavailableHintOf(selection({ availability: 'available' }))).toBeUndefined();
    expect(unavailableHintOf(
      selection({ availability: 'disabled', requiresAuth: true }),
      'zh',
    )).toBe('登录后可用');
    expect(unavailableHintOf(
      selection({ availability: 'unavailable', requiresAuth: false, availabilityReason: 'POOL_NO_DISPATCHABLE_ACCOUNT' }),
      'zh',
    )).toBe('平台容量暂时不可用');
    expect(unavailableHintOf(
      selection({ availability: 'unavailable', requiresAuth: false, availabilityReason: 'POOL_RATE_LIMITED' }),
    )).toBe('Rate limited, retry shortly');
  });

  it('identifies pool selections by provider namespace', () => {
    expect(isPoolSelection(selection({ providerId: 'agentrix-pool' }))).toBe(true);
    expect(isPoolSelection(selection())).toBe(false);
  });
});
