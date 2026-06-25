import type { PlanTier } from '../pet-gen-quota/user-plan-resolver.service';

export const DEFAULT_SOUL_TEMPLATE_ID = 'claw';

const PLAN_SOUL_UNLOCK_LIMIT: Record<PlanTier, number> = {
  free: 1,
  pro: 3,
  pro_plus: Number.MAX_SAFE_INTEGER,
  enterprise: Number.MAX_SAFE_INTEGER,
};

export function getSoulRequiredPlan(templateId: string): PlanTier {
  return templateId === DEFAULT_SOUL_TEMPLATE_ID ? 'free' : 'pro';
}

export function getSoulUnlockLimit(plan: PlanTier): number {
  return PLAN_SOUL_UNLOCK_LIMIT[plan] ?? PLAN_SOUL_UNLOCK_LIMIT.free;
}

export function isSoulAllowedByPlan(templateId: string, plan: PlanTier): boolean {
  return plan !== 'free' || templateId === DEFAULT_SOUL_TEMPLATE_ID;
}

export function normalizeUnlockedSoulIds(
  unlockedSoulTemplateIds?: string[] | null,
  currentSoulTemplateId?: string | null,
): string[] {
  const unique = new Set<string>();
  unique.add(DEFAULT_SOUL_TEMPLATE_ID);
  if (Array.isArray(unlockedSoulTemplateIds)) {
    for (const id of unlockedSoulTemplateIds) {
      if (typeof id === 'string' && id.trim().length > 0) {
        unique.add(id.trim());
      }
    }
  }
  if (currentSoulTemplateId && currentSoulTemplateId.trim().length > 0) {
    unique.add(currentSoulTemplateId.trim());
  }
  return Array.from(unique);
}

export function getSoulUpgradeMessage(plan: PlanTier, templateId: string): string {
  if (plan === 'free' && templateId !== DEFAULT_SOUL_TEMPLATE_ID) {
    return '免费套餐只能切换到 Claw（爪爪），升级到 Pro 可解锁更多灵魂';
  }
  if (plan === 'pro') {
    return 'Pro 套餐最多解锁 3 只灵魂，请升级到 Pro+ 继续解锁';
  }
  return '当前套餐无法切换到该灵魂';
}