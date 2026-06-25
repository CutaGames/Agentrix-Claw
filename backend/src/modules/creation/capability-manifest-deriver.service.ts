import { Injectable } from '@nestjs/common';
import type { SubstrateTier } from '../../../shared/types/world-creation';
import type { CreationVerb, Offering } from '../../../shared/types/creation';
import type {
  CreationCapabilityManifestDto,
  CreationMcpToolDescriptor,
} from '../../../shared/types/creation-api';
import type { MarketplaceCurrency } from '../../../shared/types/world-engine-api';
import type { TrustLevel } from '../../../shared/types/agentrix-presence';

/**
 * Tier_C opt-in 自定义工具声明(需求 13.6)。
 *
 * 仅当 Creation 的 `substrateTier === 'C'` 时才被纳入能力清单的 `customTools`;
 * 任何其他层级声明的 customTools 一律忽略(deny-by-default,非默认/必需路径)。
 * 工具语义/沙箱由审核与网关保障,本派生器只负责标准化为描述符。
 */
export interface CustomToolDeclaration {
  /** 工具名(在 Creation 内唯一)。 */
  name: string;
  /** 该自定义工具对应的标准动词(决定是否消费/额度门控)。 */
  verb: CreationVerb;
  /** 英文/通用描述。 */
  description?: string;
  /** 中文本地化描述。 */
  zhDescription?: string;
  /** 自定义参数 schema(JSON Schema 风格);缺省给出最小对象 schema。 */
  inputSchema?: Record<string, unknown>;
  /** 自定义输出 schema(可空)。 */
  outputSchema?: Record<string, unknown>;
  /** 关联 offering id(可空)。 */
  offeringId?: string;
}

/**
 * 能力清单派生入参 —— 仅取派生所需的 Creation 最小字段。
 *
 * 不直接依赖 Creation 实体,便于纯逻辑单测与跨调用点复用(发布/重派生)。
 */
export interface CapabilityManifestDerivationInput {
  /** 所属 Creation id。 */
  creationId: string;
  /** 当前 ECS 版本引用(用于一致性溯源,Property 5);纯地理创作可为 null。 */
  ecsVersionId: string | null;
  /** 声明的基底层级(决定是否纳入 customTools)。 */
  substrateTier: SubstrateTier;
  /** 已派生的供给项(来自 OfferingDeriverService,task 2.1)。 */
  offerings: Offering[];
  /**
   * 上一次清单版本;重派生时单调递增(Property 5,需求 1.5/1.11)。
   * 缺省视为 0 → 首次派生得到版本 1。
   */
  previousManifestVersion?: number;
  /** Tier_C opt-in 自定义工具声明(仅 tier C 生效,需求 13.6)。 */
  customTools?: CustomToolDeclaration[];
}

/**
 * CapabilityManifestDeriverService — `(offering, verb)` → 标准化 MCP 工具描述符
 * 的能力清单派生器(world-creation-feed task 2.2)。
 *
 * spec: .kiro/specs/world-creation-feed/{requirements,design}.md
 *   - 需求 1.11:发布时从 ECS_World + offerings **自动派生**机器可读能力清单(MCP 风格工具),
 *     SHALL NOT 要求创作者手写任何接口/API。
 *   - 需求 13.2:标准化动词 `query/order/book/message/subscribe/donate` 为 V1 统一调用面。
 *   - 需求 13.3:能力清单以 MCP 风格工具暴露(每个 Creation 自动生成一组工具 schema)。
 *   - 需求 13.6:Tier_C 高级应用可 opt-in 声明额外 customTools(经审核 + 沙箱),非默认路径。
 *
 * 设计依据(design §Agent Invocation 「MCP 工具自动生成」):
 *   > 对每个 `(offering, verb)` 生成一个标准化 MCP 工具;工具参数 schema 从 offering
 *   > 字段派生;创作者从不手写。Tier_C 可 opt-in 追加 customTools。
 *
 * 本服务承接 task 2.1 的输出(`Offering[]`),只做 `(offering, verb)` → 工具描述符
 * 的投影;鉴权/额度核销/结算/审计由阶段 9 的 agent-gateway 承担。
 *
 * 纯逻辑、无持久化依赖(@Injectable 仅为可注入到 CreationModule)。
 */
@Injectable()
export class CapabilityManifestDeriverService {
  /**
   * 从 Creation 的最小字段派生对外能力清单(`CreationCapabilityManifestDto`)。
   *
   * 规则:
   *  1. 遍历每个 offering 的每个 verb,生成**一个**标准化工具描述符,工具名 `${verb}_${offeringId}`
   *     在 Creation 内唯一(同一 offering 不同动词、不同 offering 同一动词都不冲突)。
   *  2. inputSchema 从 offering 字段派生(qty 受库存约束、book slot 受时段约束等),创作者不手写。
   *  3. 消费类动词(order/book/subscribe/donate)标记 `consumes=true` 且 `budgetGated=true`
   *     —— 触发预设额度核销(需求 13.4)。
   *  4. 仅当 `substrateTier === 'C'` 时纳入 opt-in customTools;其他层级一律忽略(需求 13.6)。
   *  5. `version = (previousManifestVersion ?? 0) + 1`,保证重派生时单调递增(Property 5)。
   */
  derive(input: CapabilityManifestDerivationInput): CreationCapabilityManifestDto {
    const tools: CreationMcpToolDescriptor[] = [];

    for (const offering of input.offerings ?? []) {
      // 去重该 offering 内重复声明的动词,保持声明顺序。
      const seen = new Set<CreationVerb>();
      for (const verb of offering.verbs ?? []) {
        if (seen.has(verb)) {
          continue;
        }
        seen.add(verb);
        tools.push(this.deriveTool(offering, verb));
      }
    }

    const dto: CreationCapabilityManifestDto = {
      creationId: input.creationId,
      version: this.nextVersion(input.previousManifestVersion),
      tools,
      ecsVersionId: input.ecsVersionId,
    };

    // Tier_C opt-in customTools(需求 13.6):仅 tier C 纳入,否则忽略。
    const customTools = this.deriveCustomTools(input);
    if (customTools.length > 0) {
      dto.customTools = customTools;
    }

    return dto;
  }

  /**
   * 计算下一个清单版本(单调递增)。
   * 抽出为公开方法,便于发布/重派生调用点显式推进版本(Property 5)。
   */
  nextVersion(previousManifestVersion?: number): number {
    const prev =
      typeof previousManifestVersion === 'number' && previousManifestVersion >= 0
        ? previousManifestVersion
        : 0;
    return prev + 1;
  }

  // ============================================================
  // Internal — 单个 (offering, verb) → 工具描述符
  // ============================================================

  /** 把单个 `(offering, verb)` 投影为标准化 MCP 工具描述符。 */
  private deriveTool(offering: Offering, verb: CreationVerb): CreationMcpToolDescriptor {
    const consumes = CONSUMING_VERBS.has(verb);
    const tool: CreationMcpToolDescriptor = {
      name: `${verb}_${offering.id}`,
      verb,
      offeringId: offering.id,
      description: this.deriveDescription(offering, verb),
      zhDescription: this.deriveDescription(offering, verb),
      inputSchema: this.deriveInputSchema(offering, verb),
      consumes,
    };

    if (consumes) {
      // 消费类动词:走预设额度核销 + 标注币种/所需信任级(需求 13.4 / 7.3)。
      tool.budgetGated = true;
      const currency = this.deriveCurrency(offering);
      if (currency) {
        tool.currency = currency;
      }
      tool.requiredTrustLevel = this.deriveRequiredTrustLevel(offering, verb);
    } else {
      // 只读/留言动词:无副作用,无额度门控,最低信任级。
      tool.budgetGated = false;
      tool.requiredTrustLevel = 0;
    }

    return tool;
  }

  /**
   * 从 offering 字段派生工具参数 schema(JSON Schema 风格)。
   * 每个动词有固定的参数骨架;数值约束(qty 上限、slot 时段等)从 offering.availability 派生。
   */
  private deriveInputSchema(offering: Offering, verb: CreationVerb): Record<string, unknown> {
    const offeringIdProp = { type: 'string', const: offering.id, description: '目标 offering id' };

    switch (verb) {
      case 'query':
        // 无副作用:查询信息/库存/价格/可用时段。
        return {
          type: 'object',
          properties: { offeringId: offeringIdProp },
          required: ['offeringId'],
          additionalProperties: false,
        };

      case 'order': {
        const qty: Record<string, unknown> = {
          type: 'integer',
          minimum: 1,
          default: 1,
          description: '下单数量',
        };
        const stock = offering.availability?.stock;
        if (typeof stock === 'number' && stock > 0) {
          qty.maximum = stock;
        }
        return {
          type: 'object',
          properties: { offeringId: offeringIdProp, qty },
          required: ['offeringId', 'qty'],
          additionalProperties: false,
        };
      }

      case 'book': {
        const slot: Record<string, unknown> = {
          type: 'string',
          description: '预约时段/座位标识(unix ms 起始时间或座位号)',
        };
        const slots = this.scheduleEnum(offering);
        if (slots.length > 0) {
          slot.enum = slots;
        }
        const props: Record<string, unknown> = { offeringId: offeringIdProp, slot };
        const capacity = offering.availability?.capacity;
        if (typeof capacity === 'number' && capacity > 0) {
          props.seats = {
            type: 'integer',
            minimum: 1,
            maximum: capacity,
            default: 1,
            description: '预约席位数',
          };
        }
        return {
          type: 'object',
          properties: props,
          required: ['offeringId', 'slot'],
          additionalProperties: false,
        };
      }

      case 'subscribe':
        return {
          type: 'object',
          properties: {
            offeringId: offeringIdProp,
            period: {
              type: 'string',
              enum: ['monthly', 'quarterly', 'yearly'],
              default: 'monthly',
              description: '订阅周期',
            },
          },
          required: ['offeringId', 'period'],
          additionalProperties: false,
        };

      case 'donate': {
        const amount: Record<string, unknown> = {
          type: 'number',
          exclusiveMinimum: 0,
          description: '打赏金额(展示币种见 currency;权威金额由 Economy_Bridge 计算)',
        };
        return {
          type: 'object',
          properties: { offeringId: offeringIdProp, amount },
          required: ['offeringId', 'amount'],
          additionalProperties: false,
        };
      }

      case 'message':
        // 留言/请求创作或其 Agent 办事:offeringId 可空。
        return {
          type: 'object',
          properties: {
            offeringId: { type: 'string', const: offering.id, description: '可选关联 offering id' },
            text: { type: 'string', minLength: 1, description: '留言文本' },
          },
          required: ['text'],
          additionalProperties: false,
        };

      default:
        return {
          type: 'object',
          properties: { offeringId: offeringIdProp },
          required: ['offeringId'],
          additionalProperties: false,
        };
    }
  }

  /** 从 availability.schedule 派生可预约时段枚举(unix ms 起始时间字符串)。 */
  private scheduleEnum(offering: Offering): string[] {
    const schedule = offering.availability?.schedule;
    if (!schedule?.length) {
      return [];
    }
    return schedule.map((s) => String(s.startsAt));
  }

  /** 派生工具描述(中文)。 */
  private deriveDescription(offering: Offering, verb: CreationVerb): string {
    const label = offering.name?.trim() || offering.id;
    return `${VERB_ZH[verb]}:${label}`;
  }

  /**
   * 派生消费类动词的展示币种:优先 USD(真实货币),否则 AXP;无价(如打赏)返回 undefined。
   * 展示用 —— 权威金额始终由 Economy_Bridge 计算(需求 7.1)。
   */
  private deriveCurrency(offering: Offering): MarketplaceCurrency | undefined {
    if (typeof offering.price?.usd === 'number') {
      return 'USD';
    }
    if (typeof offering.price?.axp === 'number') {
      return 'AXP';
    }
    return undefined;
  }

  /**
   * 派生消费类动词所需的最低信任级(需求 7.3):
   *  - 涉及真实货币(USD)→ Trust Level 3(需签名确认);
   *  - 仅 AXP 或无价 → Trust Level 1。
   */
  private deriveRequiredTrustLevel(offering: Offering, _verb: CreationVerb): TrustLevel {
    return typeof offering.price?.usd === 'number' ? 3 : 1;
  }

  // ============================================================
  // Internal — Tier_C opt-in customTools(需求 13.6)
  // ============================================================

  /** 仅 substrateTier === 'C' 时纳入 opt-in customTools;其他层级一律忽略。 */
  private deriveCustomTools(input: CapabilityManifestDerivationInput): CreationMcpToolDescriptor[] {
    if (input.substrateTier !== 'C') {
      return [];
    }
    const declarations = input.customTools ?? [];
    return declarations.map((decl) => this.deriveCustomTool(decl));
  }

  /** 把 Tier_C 自定义工具声明标准化为工具描述符(标注 isCustomTool + 消费/额度门控)。 */
  private deriveCustomTool(decl: CustomToolDeclaration): CreationMcpToolDescriptor {
    const consumes = CONSUMING_VERBS.has(decl.verb);
    const tool: CreationMcpToolDescriptor = {
      name: decl.name,
      verb: decl.verb,
      description: decl.description,
      zhDescription: decl.zhDescription ?? decl.description,
      inputSchema: decl.inputSchema ?? {
        type: 'object',
        properties: {},
        additionalProperties: true,
      },
      consumes,
      budgetGated: consumes,
      isCustomTool: true,
    };
    if (decl.offeringId) {
      tool.offeringId = decl.offeringId;
    }
    if (decl.outputSchema) {
      tool.outputSchema = decl.outputSchema;
    }
    if (consumes) {
      tool.requiredTrustLevel = 1;
    } else {
      tool.requiredTrustLevel = 0;
    }
    return tool;
  }
}

// ============================================================
// 派生映射常量
// ============================================================

/** 消费类动词集合:触发预设额度核销(需求 13.4)。 */
const CONSUMING_VERBS: ReadonlySet<CreationVerb> = new Set<CreationVerb>([
  'order',
  'book',
  'subscribe',
  'donate',
]);

/** 标准动词 → 中文动作描述前缀。 */
const VERB_ZH: Record<CreationVerb, string> = {
  query: '查询',
  order: '下单购买',
  book: '预约',
  message: '留言',
  subscribe: '订阅',
  donate: '打赏',
};
