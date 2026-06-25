/**
 * L0_Render — Tier_A 声明式渲染映射 (design §5.1 L0, R6.1).
 *
 * L0 是 Capability_Sandbox 最强的隔离级：**无代码执行，结构上即安全**
 * (safe by construction)。Tier_A 体验只含声明式场景图，本模块把规范的
 * {@link EcsWorld} 纯映射为一份**声明式渲染描述** ({@link RenderDescription})，
 * 供前端 React Three Fiber (R3F) 直接消费 —— host 与 guest 之间没有任何脚本桥，
 * 因此不存在 L1/L2 那样的 postMessage 能力分派。
 *
 * 关键不变量：
 *   - **纯函数**：{@link mapEcsWorldToRenderDescription} 无 I/O、不修改入参，
 *     同输入恒产生同输出，便于单元测试。
 *   - **只读声明式数据**：映射只读取 `entities` 的声明式组件 (transform / mesh /
 *     light / collider / affordance / ui)，**完全忽略** `rules` 与 `logicModules`
 *     —— L0 不执行任何逻辑 (R6.1)。
 *   - **可视化即数据**：碰撞体、可行走语义、affordance 标签作为只读元数据透出，
 *     供 R3F 决定是否渲染调试体或交互高亮，但不绑定任何行为回调。
 *
 * 本模块不校验 Tier (见 ecs/tier-validator.ts) —— 它假设传入的是已通过 Tier_A
 * 校验的世界，并对任何残留的 rules/logicModules 采取"忽略"而非"执行"的安全姿态。
 *
 * @see .kiro/specs/ai-world-creation-platform/design.md — §5.1 三级隔离 (L0)
 */

import type {
  EcsWorld,
  EcsEntity,
  SubstrateTier,
  Vec3,
} from '../../../../shared/types/world-creation';

// ============================================================
// §1 Render description shapes (R3F-consumable, declarative)
// ============================================================

/** Default transform values applied when a component omits a field. */
const DEFAULT_POS: Vec3 = [0, 0, 0];
const DEFAULT_ROT: Vec3 = [0, 0, 0];
const DEFAULT_SCALE: Vec3 = [1, 1, 1];

/** A fully-resolved transform (defaults filled in) for a render node. */
export interface RenderTransform {
  /** World-space position [x, y, z]. */
  pos: Vec3;
  /** Euler rotation [x, y, z] in degrees. */
  rot: Vec3;
  /** Scale [x, y, z]. */
  scale: Vec3;
}

/** Declarative mesh descriptor (preset or asset reference). */
export interface RenderMesh {
  /** Built-in preset mesh identifier, when present. */
  preset?: string;
  /** World_Asset / glb reference, when present. */
  assetRef?: string;
}

/** Declarative light descriptor. */
export interface RenderLight {
  /** Light type. */
  type: string;
  /** Hex color string, when present. */
  color?: string;
  /** Intensity (>= 0), when present. */
  intensity?: number;
}

/** Read-only collider metadata (for debug viz / navmesh hints, not behavior). */
export interface RenderCollider {
  /** Collision shape. */
  shape: string;
  /** Whether the surface is walkable. */
  walkable: boolean;
}

/** Declarative UI control descriptor. */
export interface RenderUi {
  /** Panel identifier, when present. */
  panel?: string;
  /** Static text, when present. */
  text?: string;
  /** Button label, when present. */
  button?: string;
  /** state.kv key this control reads (display-only at L0). */
  kvKey?: string;
}

/**
 * One R3F-consumable render node mapped from an ECS entity. Purely declarative:
 * carries geometry/lighting/material data plus read-only interaction metadata,
 * but no behavior — L0 attaches no callbacks (R6.1).
 */
export interface RenderNode {
  /** Source entity id. */
  id: string;
  /** Resolved transform (defaults filled). */
  transform: RenderTransform;
  /** Mesh descriptor, when the entity has a `mesh` component. */
  mesh?: RenderMesh;
  /** Light descriptor, when the entity has a `light` component. */
  light?: RenderLight;
  /** Collider metadata, when present (read-only viz/nav hint). */
  collider?: RenderCollider;
  /** Affordance tags (read-only semantic hints, e.g., pickable/container). */
  affordanceTags?: string[];
  /** Display-only price hint (NON-authoritative — see design §6). */
  priceHint?: { axp?: number; usd?: number };
}

/**
 * A complete, declarative render description for a Tier_A Plot, consumable by
 * React Three Fiber on the client. Contains scene nodes plus the UI control
 * declarations hoisted out for convenient HUD rendering.
 */
export interface RenderDescription {
  /** ECS schema version copied from the source world. */
  ecsVersion: string;
  /** Owning Plot id. */
  plotId: string;
  /** Declared substrate tier (expected 'A' at L0). */
  substrateTier: SubstrateTier;
  /** Isolation level — always 'L0' for a declarative render description. */
  isolationLevel: 'L0';
  /** The scene nodes to render. */
  nodes: RenderNode[];
  /** UI controls hoisted from entities carrying a `ui` component. */
  ui: Array<RenderUi & { entityId: string }>;
}

// ============================================================
// §2 Per-entity mapping (pure)
// ============================================================

/** Copy a Vec3 (defensive) or fall back to a default. */
function resolveVec3(value: Vec3 | undefined, fallback: Vec3): Vec3 {
  if (!value) {
    return [...fallback] as Vec3;
  }
  return [value[0], value[1], value[2]];
}

/** Map a single ECS entity to a declarative {@link RenderNode}. */
function mapEntity(entity: EcsEntity): RenderNode {
  const components = entity.components ?? {};
  const node: RenderNode = {
    id: entity.id,
    transform: {
      pos: resolveVec3(components.transform?.pos, DEFAULT_POS),
      rot: resolveVec3(components.transform?.rot, DEFAULT_ROT),
      scale: resolveVec3(components.transform?.scale, DEFAULT_SCALE),
    },
  };

  if (components.mesh) {
    node.mesh = {
      preset: components.mesh.preset,
      assetRef: components.mesh.assetRef,
    };
  }

  if (components.light) {
    node.light = {
      type: components.light.type,
      color: components.light.color,
      intensity: components.light.intensity,
    };
  }

  if (components.collider) {
    node.collider = {
      shape: components.collider.shape,
      walkable: components.collider.walkable ?? false,
    };
  }

  if (components.affordance?.tags?.length) {
    node.affordanceTags = [...components.affordance.tags];
  }

  if (components.price && (components.price.axp != null || components.price.usd != null)) {
    node.priceHint = {
      axp: components.price.axp,
      usd: components.price.usd,
    };
  }

  return node;
}

// ============================================================
// §3 World mapping (pure entry point)
// ============================================================

/**
 * Map an ECS_World to a declarative {@link RenderDescription} for R3F (L0).
 *
 * Pure function: no I/O, does not mutate `world`. Reads only the declarative
 * scene-graph (`entities` components) and intentionally **ignores** `rules`
 * and `logicModules` — L0 executes no logic (R6.1). The result is safe by
 * construction: it carries data, never behavior.
 *
 * @param world the ECS_World to render (expected Tier_A; declarative parts only)
 * @returns a declarative render description the client can consume directly
 */
export function mapEcsWorldToRenderDescription(world: EcsWorld): RenderDescription {
  const entities = world.entities ?? [];
  const nodes = entities.map(mapEntity);

  const ui: Array<RenderUi & { entityId: string }> = [];
  for (const entity of entities) {
    const uiComponent = entity.components?.ui;
    if (uiComponent) {
      ui.push({
        entityId: entity.id,
        panel: uiComponent.panel,
        text: uiComponent.text,
        button: uiComponent.button,
        kvKey: uiComponent.kvKey,
      });
    }
  }

  return {
    ecsVersion: world.ecsVersion,
    plotId: world.plotId,
    substrateTier: world.substrateTier,
    isolationLevel: 'L0',
    nodes,
    ui,
  };
}
