import { Injectable } from '@nestjs/common';
import type {
  EcsEntity,
  EcsWorld,
  PriceComponent,
} from '../../../shared/types/world-creation';
import type {
  CreationVerb,
  Offering,
  OfferingKind,
} from '../../../shared/types/creation';

/**
 * OfferingDeriverService — 从 ECS_World 自动派生 `Offering[]`(world-creation-feed task 2.1)。
 *
 * spec: .kiro/specs/world-creation-feed/{requirements,design}.md
 *   - 需求 1.10:Creation 含 0..N 个 Offering(名称/类型/价格/标准动词/可用性);
 *   - 需求 2.10:创作者只「标价/标明提供什么」,系统据此同时供人端展示与机器端 offering
 *     清单(一次标注,两端复用)——创作者不手写接口。
 *
 * 设计依据(design §Data Models / §Creation Authoring 「派生规则」):
 *   > 发布时,系统遍历 ECS_World 中带 `price`/`ui`/`affordance` 的实体与显式 offerings,
 *   > 生成 offerings;再把 `(offering, verb)` 组合投影为标准化 MCP 工具。
 *
 * 本服务只负责 ECS_World(+ 显式标注)→ `Offering[]` 这一步;`(offering, verb)` →
 * MCP 工具的投影由 task 2.2 的能力清单派生器承接。
 *
 * 纯逻辑、无持久化依赖(@Injectable 仅为可注入到 CreationModule)。
 */
@Injectable()
export class OfferingDeriverService {
  /**
   * 从一个 ECS_World 与创作者的显式 offering 标注派生统一的 `Offering[]`。
   *
   * 规则:
   *  1. 遍历 world.entities,对**与供给相关**的实体派生一个 offering
   *     (见 {@link isOfferingRelevant}):带 `price` 组件,或带商业语义的 `affordance` 标签。
   *  2. 纯展示/交互实体(仅 `ui` 面板、或仅非商业 `affordance` 如 walkable/pickable,
   *     且无 `price`)不产生 offering(需求 1.10:0..N)。
   *  3. 显式标注被尊重(需求 2.10):与派生项 id 相同的显式 offering 覆盖派生结果;
   *     其余显式 offering 追加到末尾。
   *
   * @param world 当前 ECS_World;纯地理创作可为 null/undefined → 仅返回显式标注。
   * @param explicitOfferings 创作者显式声明的 offering(可空)。
   */
  derive(
    world: EcsWorld | null | undefined,
    explicitOfferings: Offering[] = [],
  ): Offering[] {
    const byId = new Map<string, Offering>();

    // 1) 从 ECS 实体派生(保持实体顺序)。
    if (world?.entities?.length) {
      for (const entity of world.entities) {
        const offering = this.deriveFromEntity(entity);
        if (offering) {
          byId.set(offering.id, offering);
        }
      }
    }

    // 2) 显式标注:同 id 覆盖派生项(浅合并,显式字段优先),其余追加(需求 2.10)。
    for (const explicit of explicitOfferings) {
      const existing = byId.get(explicit.id);
      byId.set(explicit.id, existing ? this.mergeExplicit(existing, explicit) : { ...explicit });
    }

    return [...byId.values()];
  }

  // ============================================================
  // Internal — 单实体派生
  // ============================================================

  /**
   * 把单个 ECS 实体派生为 offering;与供给无关则返回 null。
   * offering.id 取实体 id(在 world 内唯一,满足「在 Creation 内唯一」语义),
   * 并设 `derivedFromEntityId` 溯源(design §Data Models)。
   */
  private deriveFromEntity(entity: EcsEntity): Offering | null {
    if (!this.isOfferingRelevant(entity)) {
      return null;
    }

    const kind = this.deriveKind(entity);
    const offering: Offering = {
      id: entity.id,
      kind,
      name: this.deriveName(entity),
      verbs: this.deriveVerbs(kind),
      derivedFromEntityId: entity.id,
    };

    const price = this.derivePrice(entity.components.price);
    if (price) {
      offering.price = price;
    }

    const description = entity.components.ui?.text;
    if (description && description !== offering.name) {
      offering.description = description;
    }

    return offering;
  }

  /**
   * 判定实体是否与供给相关:
   *  - 带 `price` 组件 → 相关(默认 product);或
   *  - 带商业语义的 `affordance` 标签(purchasable/bookable/ticket/subscription/donatable 等)。
   * 仅 `ui` 或仅非商业 `affordance`(walkable/sittable/pickable…)且无 `price` → 不相关。
   */
  private isOfferingRelevant(entity: EcsEntity): boolean {
    if (entity.components.price) {
      return true;
    }
    return this.commerceTag(entity) !== null;
  }

  /** 取实体上第一个命中的商业 affordance 标签(无则 null)。 */
  private commerceTag(entity: EcsEntity): string | null {
    const tags = entity.components.affordance?.tags;
    if (!tags?.length) {
      return null;
    }
    for (const tag of tags) {
      if (COMMERCE_AFFORDANCE_KIND[tag.toLowerCase()]) {
        return tag.toLowerCase();
      }
    }
    return null;
  }

  /** 派生 offering 类型:优先商业 affordance 标签,否则带价实体默认 product。 */
  private deriveKind(entity: EcsEntity): OfferingKind {
    const tag = this.commerceTag(entity);
    if (tag) {
      return COMMERCE_AFFORDANCE_KIND[tag];
    }
    return 'product';
  }

  /** 派生标准动词:始终含只读 `query`,再加该类型的主消费动词。 */
  private deriveVerbs(kind: OfferingKind): CreationVerb[] {
    const verbs: CreationVerb[] = ['query'];
    const primary = PRIMARY_VERB_BY_KIND[kind];
    if (primary && !verbs.includes(primary)) {
      verbs.push(primary);
    }
    return verbs;
  }

  /** 派生名称:优先 ui.button → ui.text → 人性化的实体 id。 */
  private deriveName(entity: EcsEntity): string {
    const ui = entity.components.ui;
    const label = ui?.button ?? ui?.text;
    if (label && label.trim()) {
      return label.trim();
    }
    return humanizeEntityId(entity.id);
  }

  /** 从 price 组件派生展示价;仅纳入已定义字段;无有效值返回 null。 */
  private derivePrice(price: PriceComponent | undefined): { axp?: number; usd?: number } | null {
    if (!price) {
      return null;
    }
    const result: { axp?: number; usd?: number } = {};
    if (typeof price.axp === 'number') {
      result.axp = price.axp;
    }
    if (typeof price.usd === 'number') {
      result.usd = price.usd;
    }
    return Object.keys(result).length > 0 ? result : null;
  }

  /**
   * 把显式标注合并到派生项之上:显式字段优先(浅合并),
   * 但保留派生项的 `derivedFromEntityId` 溯源(显式未指定时)。
   */
  private mergeExplicit(derived: Offering, explicit: Offering): Offering {
    return {
      ...derived,
      ...explicit,
      derivedFromEntityId: explicit.derivedFromEntityId ?? derived.derivedFromEntityId,
    };
  }
}

// ============================================================
// 派生映射常量
// ============================================================

/**
 * 商业语义的 `affordance` 标签 → offering 类型(小写匹配)。
 * 不在此表中的标签(walkable/sittable/pickable/hazard…)不触发 offering 派生。
 */
const COMMERCE_AFFORDANCE_KIND: Record<string, OfferingKind> = {
  // product
  purchasable: 'product',
  sellable: 'product',
  orderable: 'product',
  product: 'product',
  // service
  bookable: 'service',
  reservable: 'service',
  service: 'service',
  // ticket
  ticket: 'ticket',
  seat: 'ticket',
  admission: 'ticket',
  // subscription
  subscribable: 'subscription',
  subscription: 'subscription',
  membership: 'subscription',
  // tip
  donatable: 'tip',
  donation: 'tip',
  tip: 'tip',
};

/** offering 类型 → 主消费动词(query 始终附加)。 */
const PRIMARY_VERB_BY_KIND: Record<OfferingKind, CreationVerb> = {
  product: 'order',
  service: 'book',
  ticket: 'book',
  subscription: 'subscribe',
  tip: 'donate',
};

/** 把实体 id(如 "shelf_wood_1")转为可读名称("Shelf Wood 1")作为兜底名称。 */
function humanizeEntityId(id: string): string {
  return id
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
