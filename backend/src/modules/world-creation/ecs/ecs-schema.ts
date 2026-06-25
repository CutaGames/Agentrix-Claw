/**
 * ECS_Schema — ECS-JSON 规范表示的 schema 校验与序列化 (design §2, R4.1/4.6/4.7).
 *
 * 一个 Plot 的世界 = 一份 ECS-JSON。人与 AI 写入同一结构，因此这份结构必须是
 * **可校验、可序列化、可 diff、可组合** 的。本模块负责:
 *
 *   1. {@link serialize} / {@link deserialize} — 规范化（canonical）序列化往返，
 *      保证 `deserialize(serialize(W)) ≡ W` (Property 1, R4.6)。序列化采用稳定键序
 *      （递归排序对象键、丢弃 undefined），使产物可被 diff 模型 (task 2.5) 稳定比对，
 *      且为纯函数，可被往返属性测试 (task 2.2) 直接驱动。
 *   2. {@link validateEcsWorld} — ECS-JSON 顶层结构与组件目录 (Component Catalog,
 *      design §2.2) 的结构性 schema 校验。校验失败返回结构化 `SCHEMA_INVALID` 错误
 *      并指明具体违规项 (R4.7)。
 *   3. 声明 Substrate_Tier 不匹配的内容 → 经 {@link validateEcsWorld} 的 `checkTier`
 *      选项委派给 Tier_Validator (task 2.3) 返回 `TIER_VIOLATION` 结构化错误。
 *      本模块不重复实现 A/B/C tier 约束逻辑（其单一事实来源为 `tier-validator.ts`），
 *      也不实现 diff/version/revert（task 2.5）。
 *
 * 所有导出均为纯函数（无 I/O、不修改入参），属性名使用 camelCase。
 *
 * @see .kiro/specs/ai-world-creation-platform/design.md — §2 ECS_World 规范表示
 */

import {
  EcsWorld,
  EcsEntity,
  EcsComponent,
  SubstrateTier,
  WorldCreationError,
} from '../../../../shared/types/world-creation';
import { validateTier } from './tier-validator';

// ============================================================
// §1 Error type
// ============================================================

/**
 * Error thrown by {@link deserialize} when the input is not a well-formed
 * ECS_World. Carries the structured {@link WorldCreationError} so callers can
 * surface the machine-readable code + detail to the creation surface.
 */
export class EcsSchemaError extends Error {
  /** The structured platform error (code + human-readable detail). */
  readonly worldError: WorldCreationError;

  constructor(worldError: WorldCreationError) {
    super(`${worldError.error}: ${worldError.detail}`);
    this.name = 'EcsSchemaError';
    this.worldError = worldError;
  }
}

/** Result of {@link validateEcsWorld}: valid flag + all violations found. */
export interface EcsValidationResult {
  /** True iff no violations were found. */
  valid: boolean;
  /** Structured errors describing each violation (empty when valid). */
  errors: WorldCreationError[];
}

// ============================================================
// §2 Schema catalog constants
// ============================================================

/** The closed set of known component keys (design §2.2 Component Catalog). */
const KNOWN_COMPONENT_KEYS: ReadonlySet<string> = new Set<string>([
  'transform',
  'mesh',
  'light',
  'collider',
  'affordance',
  'ui',
  'price',
  'npc',
  'logicModuleRef',
]);

/** Allowed declared substrate tiers. */
const VALID_TIERS: ReadonlySet<string> = new Set<string>(['A', 'B', 'C']);

/** Allowed `light.type` values. */
const VALID_LIGHT_TYPES: ReadonlySet<string> = new Set<string>([
  'point',
  'directional',
  'spot',
  'ambient',
  'dramatic',
]);

/** Allowed `collider.shape` values. */
const VALID_COLLIDER_SHAPES: ReadonlySet<string> = new Set<string>([
  'box',
  'sphere',
  'capsule',
  'mesh',
]);

// ============================================================
// §3 Low-level type predicates
// ============================================================

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** A Vec3 is a tuple of exactly three finite numbers. */
function isVec3(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((n) => isFiniteNumber(n))
  );
}

function schemaInvalid(detail: string): WorldCreationError {
  return { error: 'SCHEMA_INVALID', detail };
}

// ============================================================
// §4 Component-catalog validation
// ============================================================

/**
 * Validate a single entity's component bag against the component catalog.
 * Pushes a `SCHEMA_INVALID` error for each violation into `errors`.
 */
function validateComponents(
  entityId: string,
  components: EcsComponent,
  errors: WorldCreationError[],
): void {
  const where = `entity "${entityId}"`;

  // Reject unknown component keys to keep the catalog closed (design §2.2).
  for (const key of Object.keys(components)) {
    if (!KNOWN_COMPONENT_KEYS.has(key)) {
      errors.push(
        schemaInvalid(`${where} has unknown component "${key}" not in the component catalog`),
      );
    }
  }

  const c = components as Record<string, unknown>;

  if (c.transform !== undefined) {
    const t = c.transform;
    if (!isPlainObject(t)) {
      errors.push(schemaInvalid(`${where} component "transform" must be an object`));
    } else {
      if (!isVec3(t.pos)) {
        errors.push(schemaInvalid(`${where} transform.pos must be a [x,y,z] tuple of finite numbers`));
      }
      if (t.rot !== undefined && !isVec3(t.rot)) {
        errors.push(schemaInvalid(`${where} transform.rot must be a [x,y,z] tuple of finite numbers`));
      }
      if (t.scale !== undefined && !isVec3(t.scale)) {
        errors.push(schemaInvalid(`${where} transform.scale must be a [x,y,z] tuple of finite numbers`));
      }
    }
  }

  if (c.mesh !== undefined) {
    const m = c.mesh;
    if (!isPlainObject(m)) {
      errors.push(schemaInvalid(`${where} component "mesh" must be an object`));
    } else {
      if (m.preset !== undefined && typeof m.preset !== 'string') {
        errors.push(schemaInvalid(`${where} mesh.preset must be a string`));
      }
      if (m.assetRef !== undefined && typeof m.assetRef !== 'string') {
        errors.push(schemaInvalid(`${where} mesh.assetRef must be a string`));
      }
    }
  }

  if (c.light !== undefined) {
    const l = c.light;
    if (!isPlainObject(l)) {
      errors.push(schemaInvalid(`${where} component "light" must be an object`));
    } else {
      if (!VALID_LIGHT_TYPES.has(l.type as string)) {
        errors.push(schemaInvalid(`${where} light.type "${String(l.type)}" is not a valid light type`));
      }
      if (l.color !== undefined && typeof l.color !== 'string') {
        errors.push(schemaInvalid(`${where} light.color must be a string`));
      }
      if (l.intensity !== undefined && !(isFiniteNumber(l.intensity) && l.intensity >= 0)) {
        errors.push(schemaInvalid(`${where} light.intensity must be a finite number >= 0`));
      }
    }
  }

  if (c.collider !== undefined) {
    const col = c.collider;
    if (!isPlainObject(col)) {
      errors.push(schemaInvalid(`${where} component "collider" must be an object`));
    } else {
      if (!VALID_COLLIDER_SHAPES.has(col.shape as string)) {
        errors.push(schemaInvalid(`${where} collider.shape "${String(col.shape)}" is not a valid collider shape`));
      }
      if (col.walkable !== undefined && typeof col.walkable !== 'boolean') {
        errors.push(schemaInvalid(`${where} collider.walkable must be a boolean`));
      }
    }
  }

  if (c.affordance !== undefined) {
    const a = c.affordance;
    if (!isPlainObject(a)) {
      errors.push(schemaInvalid(`${where} component "affordance" must be an object`));
    } else if (!Array.isArray(a.tags) || !a.tags.every((t) => typeof t === 'string')) {
      errors.push(schemaInvalid(`${where} affordance.tags must be an array of strings`));
    }
  }

  if (c.ui !== undefined) {
    const u = c.ui;
    if (!isPlainObject(u)) {
      errors.push(schemaInvalid(`${where} component "ui" must be an object`));
    } else {
      for (const k of ['panel', 'text', 'button', 'kvKey'] as const) {
        if (u[k] !== undefined && typeof u[k] !== 'string') {
          errors.push(schemaInvalid(`${where} ui.${k} must be a string`));
        }
      }
    }
  }

  if (c.price !== undefined) {
    const p = c.price;
    if (!isPlainObject(p)) {
      errors.push(schemaInvalid(`${where} component "price" must be an object`));
    } else {
      if (p.axp !== undefined && !isFiniteNumber(p.axp)) {
        errors.push(schemaInvalid(`${where} price.axp must be a finite number`));
      }
      if (p.usd !== undefined && !isFiniteNumber(p.usd)) {
        errors.push(schemaInvalid(`${where} price.usd must be a finite number`));
      }
    }
  }

  if (c.npc !== undefined) {
    const n = c.npc;
    if (!isPlainObject(n)) {
      errors.push(schemaInvalid(`${where} component "npc" must be an object`));
    } else {
      if (n.dialogue !== undefined && (!Array.isArray(n.dialogue) || !n.dialogue.every((d) => typeof d === 'string'))) {
        errors.push(schemaInvalid(`${where} npc.dialogue must be an array of strings`));
      }
      if (n.behaviorTreeRef !== undefined && typeof n.behaviorTreeRef !== 'string') {
        errors.push(schemaInvalid(`${where} npc.behaviorTreeRef must be a string`));
      }
    }
  }

  if (c.logicModuleRef !== undefined) {
    const r = c.logicModuleRef;
    if (!isPlainObject(r)) {
      errors.push(schemaInvalid(`${where} component "logicModuleRef" must be an object`));
    } else {
      if (!isNonEmptyString(r.moduleId)) {
        errors.push(schemaInvalid(`${where} logicModuleRef.moduleId must be a non-empty string`));
      }
      if (!isNonEmptyString(r.entry)) {
        errors.push(schemaInvalid(`${where} logicModuleRef.entry must be a non-empty string`));
      }
    }
  }
}

/** Validate a single entity (id + components). */
function validateEntity(
  entity: unknown,
  index: number,
  seenIds: Set<string>,
  errors: WorldCreationError[],
): void {
  if (!isPlainObject(entity)) {
    errors.push(schemaInvalid(`entities[${index}] must be an object`));
    return;
  }
  if (!isNonEmptyString(entity.id)) {
    errors.push(schemaInvalid(`entities[${index}].id must be a non-empty string`));
  } else {
    if (seenIds.has(entity.id)) {
      errors.push(schemaInvalid(`duplicate entity id "${entity.id}"; entity ids must be unique`));
    }
    seenIds.add(entity.id);
  }

  if (!isPlainObject(entity.components)) {
    errors.push(schemaInvalid(`entities[${index}] ("${String(entity.id)}").components must be an object`));
    return;
  }
  validateComponents(
    isNonEmptyString(entity.id) ? entity.id : `#${index}`,
    entity.components as EcsComponent,
    errors,
  );
}

// ============================================================
// §5 Substrate_DSL rule + logic-module structural validation
// ============================================================

/**
 * Light structural validation of Tier_B `rules` (presence/shape only). The
 * semantic check that each action maps to a whitelisted World_API capability,
 * and the A/B/C tier envelope, are owned by `tier-validator.ts` (task 2.3).
 */
function validateRulesStructure(rules: unknown, errors: WorldCreationError[]): void {
  if (!Array.isArray(rules)) {
    errors.push(schemaInvalid(`"rules" must be an array when present`));
    return;
  }
  rules.forEach((rule, i) => {
    if (!isPlainObject(rule)) {
      errors.push(schemaInvalid(`rules[${i}] must be an object`));
      return;
    }
    if (!isNonEmptyString(rule.id)) {
      errors.push(schemaInvalid(`rules[${i}].id must be a non-empty string`));
    }
    if (!isPlainObject(rule.on) || !isNonEmptyString((rule.on as Record<string, unknown>).event)) {
      errors.push(schemaInvalid(`rules[${i}].on must be an object with a non-empty "event"`));
    }
    if (!Array.isArray(rule.do)) {
      errors.push(schemaInvalid(`rules[${i}].do must be an array of actions`));
    } else {
      rule.do.forEach((action, j) => {
        if (!isPlainObject(action) || !isNonEmptyString(action.cap)) {
          errors.push(schemaInvalid(`rules[${i}].do[${j}] must be an action with a non-empty "cap"`));
        }
      });
    }
  });
}

/** Light structural validation of Tier_C `logicModules` (presence/shape only). */
function validateLogicModulesStructure(modules: unknown, errors: WorldCreationError[]): void {
  if (!Array.isArray(modules)) {
    errors.push(schemaInvalid(`"logicModules" must be an array when present`));
    return;
  }
  modules.forEach((mod, i) => {
    if (!isPlainObject(mod)) {
      errors.push(schemaInvalid(`logicModules[${i}] must be an object`));
      return;
    }
    if (!isNonEmptyString(mod.moduleId)) {
      errors.push(schemaInvalid(`logicModules[${i}].moduleId must be a non-empty string`));
    }
    if (mod.runtime !== 'wasm' && mod.runtime !== 'js') {
      errors.push(schemaInvalid(`logicModules[${i}].runtime must be "wasm" or "js"`));
    }
    if (!isNonEmptyString(mod.entry)) {
      errors.push(schemaInvalid(`logicModules[${i}].entry must be a non-empty string`));
    }
    if (!Array.isArray(mod.capabilities) || !mod.capabilities.every((cap) => typeof cap === 'string')) {
      errors.push(schemaInvalid(`logicModules[${i}].capabilities must be an array of capability strings`));
    }
    if (!isNonEmptyString(mod.hash)) {
      errors.push(schemaInvalid(`logicModules[${i}].hash must be a non-empty string`));
    }
  });
}

// ============================================================
// §6 Top-level ECS_World validation
// ============================================================

/**
 * Validate the top-level structure and component catalog of an ECS_World
 * (R4.1/4.7). Pure function — returns all violations found rather than throwing.
 *
 * By default this performs **structural** schema validation only and produces
 * `SCHEMA_INVALID` errors. Pass `{ checkTier: true }` to additionally enforce
 * the declared Substrate_Tier's content constraints (A/B/C) via the
 * Tier_Validator, which contributes `TIER_VIOLATION` errors for content that
 * does not match the declared tier (task 2.3 owns that logic).
 *
 * @param value the candidate value to validate (typically a parsed JSON object)
 * @param opts  `checkTier` — also run Substrate_Tier constraint validation
 * @returns an {@link EcsValidationResult} listing every violation found
 */
export function validateEcsWorld(
  value: unknown,
  opts: { checkTier?: boolean } = {},
): EcsValidationResult {
  const errors: WorldCreationError[] = [];

  if (!isPlainObject(value)) {
    return { valid: false, errors: [schemaInvalid('ECS_World must be a JSON object')] };
  }

  if (!isNonEmptyString(value.ecsVersion)) {
    errors.push(schemaInvalid('ecsVersion must be a non-empty string'));
  }
  if (!isNonEmptyString(value.plotId)) {
    errors.push(schemaInvalid('plotId must be a non-empty string'));
  }
  if (!VALID_TIERS.has(value.substrateTier as string)) {
    errors.push(
      schemaInvalid(`substrateTier "${String(value.substrateTier)}" must be one of "A", "B", "C"`),
    );
  }

  if (!Array.isArray(value.entities)) {
    errors.push(schemaInvalid('entities must be an array'));
  } else {
    const seenIds = new Set<string>();
    value.entities.forEach((entity, i) => validateEntity(entity, i, seenIds, errors));
  }

  if (value.rules !== undefined) {
    validateRulesStructure(value.rules, errors);
  }
  if (value.logicModules !== undefined) {
    validateLogicModulesStructure(value.logicModules, errors);
  }
  if (value.defs !== undefined && !isPlainObject(value.defs)) {
    errors.push(schemaInvalid('defs must be an object when present'));
  }
  if (value.meta !== undefined && !isPlainObject(value.meta)) {
    errors.push(schemaInvalid('meta must be an object when present'));
  }

  // Only run tier-constraint validation once the structure is well-formed,
  // so the Tier_Validator can safely assume a valid shape.
  if (opts.checkTier && errors.length === 0) {
    const tierError = validateTier(value as unknown as EcsWorld);
    if (tierError) {
      errors.push(tierError);
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Type guard: true iff `value` is a structurally valid ECS_World. */
export function isEcsWorld(value: unknown): value is EcsWorld {
  return validateEcsWorld(value).valid;
}

// ============================================================
// §7 Canonical serialization (stable key order, round-trip safe)
// ============================================================

/**
 * Recursively produce a canonical form of `value`: object keys sorted
 * lexicographically and `undefined`-valued keys dropped; arrays keep their
 * order (entity/rule order is significant). Throws on non-finite numbers,
 * which JSON cannot represent without silently corrupting the round-trip.
 */
function canonicalize(value: unknown, path: string): unknown {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new EcsSchemaError(
      schemaInvalid(`non-finite number at "${path}" cannot be serialized to ECS-JSON`),
    );
  }
  if (Array.isArray(value)) {
    return value.map((v, i) => canonicalize(v, `${path}[${i}]`));
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const v = value[key];
      if (v === undefined) continue;
      out[key] = canonicalize(v, `${path}/${key}`);
    }
    return out;
  }
  return value;
}

/**
 * Serialize an ECS_World to a canonical JSON string with a stable key order.
 *
 * Determinism + stable ordering make serialized worlds reliably diffable
 * (task 2.5) and make the round-trip property `deserialize(serialize(W)) ≡ W`
 * (Property 1, R4.6) hold for any well-formed world. Pure function.
 *
 * @param world the ECS_World to serialize
 * @returns canonical JSON string
 * @throws {EcsSchemaError} if the world contains a non-finite number
 */
export function serialize(world: EcsWorld): string {
  return JSON.stringify(canonicalize(world, ''));
}

/**
 * Deserialize a canonical ECS-JSON string back into an ECS_World, validating
 * its structure. The inverse of {@link serialize}: for any well-formed world,
 * `deserialize(serialize(W))` reproduces an equivalent ECS_World (R4.6).
 *
 * @param json the ECS-JSON string to parse
 * @returns the parsed, structurally validated ECS_World
 * @throws {EcsSchemaError} if the JSON is unparseable or fails schema validation
 */
export function deserialize(json: string): EcsWorld {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new EcsSchemaError(
      schemaInvalid(`ECS_World JSON is not parseable: ${(e as Error).message}`),
    );
  }

  const result = validateEcsWorld(parsed);
  if (!result.valid) {
    // Surface the first violation; full list is available via validateEcsWorld.
    throw new EcsSchemaError(result.errors[0]);
  }
  return parsed as EcsWorld;
}

/** Re-export the canonical Substrate_Tier type for ecs-schema consumers. */
export type { SubstrateTier, EcsWorld, EcsEntity };
