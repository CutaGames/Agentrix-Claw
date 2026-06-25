/**
 * Tier_Validator — 分层基底 A/B/C 的 Substrate_Tier schema 约束校验 (design §3.1, R4.2/4.3/4.4/4.7).
 *
 * 一个 Plot 的 ECS_World 的创作天花板由其声明的 Substrate_Tier 决定。本模块实现
 * "能力天花板由基底决定" 这一核心原则的结构性约束 (safe by construction):
 *
 *   - Tier_A — 仅声明式场景图。含 `rules` / `logicModules` (或 logicModuleRef 组件) 即拒。
 *   - Tier_B — 允许 `rules` (Substrate_DSL) 但禁 `logicModules`；且每个 rule 的每个
 *               action 必须映射到 World_API 白名单能力 (deny-by-default)。
 *   - Tier_C — 允许 `logicModules` (沙箱内 JS/WASM 逻辑模块)。
 *
 * 校验失败返回结构化错误 `{ error: "TIER_VIOLATION", detail }`，并在 detail 中
 * 指明具体违规项 (实体 id / rule id / 越界能力)，便于创作器向用户呈现 (R4.7)。
 *
 * 本模块仅做 Tier 约束校验：不做完整 ECS-JSON schema 校验 (task 2.1) 或 diff/revert
 * (task 2.5)。导出的 {@link validateTier} 为纯函数，设计为可被 Tier 约束属性测试
 * (Property 7, task 2.4) 直接驱动。
 *
 * @see .kiro/specs/ai-world-creation-platform/design.md — §3 分层基底 A/B/C
 */

import {
  EcsWorld,
  EcsEntity,
  SubstrateRule,
  WorldApiCapability,
  WorldCreationError,
} from '../../../../shared/types/world-creation';

/**
 * The set of whitelisted World_API capability string values (deny-by-default).
 * Derived from the {@link WorldApiCapability} enum so it stays in sync with the
 * single source of truth in shared types.
 */
const WHITELISTED_CAPABILITIES: ReadonlySet<string> = new Set<string>(
  Object.values(WorldApiCapability),
);

/** Build a structured TIER_VIOLATION error pointing at the violating item. */
function tierViolation(detail: string): WorldCreationError {
  return { error: 'TIER_VIOLATION', detail };
}

/** Whether an entity carries a Tier_C `logicModuleRef` component. */
function hasLogicModuleRef(entity: EcsEntity): boolean {
  return entity.components?.logicModuleRef != null;
}

/** Find the first entity (if any) that references a Tier_C logic module. */
function firstEntityWithLogicModuleRef(entities: EcsEntity[]): EcsEntity | undefined {
  return entities.find(hasLogicModuleRef);
}

/**
 * Validate a Tier_B rule set: every action's `cap` must resolve to a
 * whitelisted World_API capability. Returns the first violation, or null.
 */
function validateRuleCapabilities(
  plotId: string,
  rules: SubstrateRule[],
): WorldCreationError | null {
  for (const rule of rules) {
    const actions = rule.do ?? [];
    for (let i = 0; i < actions.length; i++) {
      const cap = actions[i]?.cap as unknown as string;
      if (!WHITELISTED_CAPABILITIES.has(cap)) {
        return tierViolation(
          `Tier_B plot "${plotId}" rule "${rule.id}" action[${i}] maps to capability ` +
            `"${cap}" which is not in the World_API whitelist`,
        );
      }
    }
  }
  return null;
}

/**
 * Validate an ECS_World against the schema constraints of its declared
 * Substrate_Tier (design §3.1).
 *
 * Pure function — no I/O, no mutation of the input. Returns a structured
 * {@link WorldCreationError} describing the first violation found, or `null`
 * when the world satisfies its tier's constraints.
 *
 * @param world the ECS_World to validate (its `substrateTier` declares the tier)
 * @returns a `TIER_VIOLATION` error indicating the violating item, or `null` if valid
 */
export function validateTier(world: EcsWorld): WorldCreationError | null {
  const plotId = world.plotId;
  const entities = world.entities ?? [];
  const rules = world.rules ?? [];
  const logicModules = world.logicModules ?? [];

  switch (world.substrateTier) {
    case 'A': {
      // Tier_A: declarative scene-graph only — no rules, no logic modules (R4.2).
      if (rules.length > 0) {
        return tierViolation(
          `Tier_A plot "${plotId}" contains rules[0] ("${rules[0].id}"); ` +
            `Tier_A allows only declarative scene-graph data with no executable logic`,
        );
      }
      if (logicModules.length > 0) {
        return tierViolation(
          `Tier_A plot "${plotId}" contains logicModules[0] ("${logicModules[0].moduleId}"); ` +
            `Tier_A allows only declarative scene-graph data with no executable logic`,
        );
      }
      const offending = firstEntityWithLogicModuleRef(entities);
      if (offending) {
        return tierViolation(
          `Tier_A plot "${plotId}" entity "${offending.id}" has a logicModuleRef component; ` +
            `Tier_A allows only declarative components`,
        );
      }
      return null;
    }

    case 'B': {
      // Tier_B: declarative + Substrate_DSL rules, but no logic modules (R4.3).
      if (logicModules.length > 0) {
        return tierViolation(
          `Tier_B plot "${plotId}" contains logicModules[0] ("${logicModules[0].moduleId}"); ` +
            `Tier_B allows declarative data plus Substrate_DSL rules but no logic modules`,
        );
      }
      const offending = firstEntityWithLogicModuleRef(entities);
      if (offending) {
        return tierViolation(
          `Tier_B plot "${plotId}" entity "${offending.id}" has a logicModuleRef component; ` +
            `Tier_B may not reference Tier_C logic modules`,
        );
      }
      // Every rule action must map to a whitelisted World_API capability (R4.3).
      return validateRuleCapabilities(plotId, rules);
    }

    case 'C': {
      // Tier_C: declarative + DSL + sandboxed logic modules are all permitted (R4.4).
      // Rule actions still must map to whitelisted World_API capabilities.
      return validateRuleCapabilities(plotId, rules);
    }

    default: {
      return tierViolation(
        `plot "${plotId}" declares unknown Substrate_Tier "${String(world.substrateTier)}"`,
      );
    }
  }
}
