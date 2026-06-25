import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CreationRepository } from '../creation.repository';
import { CreationStateMachine } from '../creation-state-machine';
import { CreationEntity } from '../entities/creation.entity';
import { CreationCapabilityManifestEntity } from '../entities/creation-capability-manifest.entity';
import { AgentInvocationEntity } from '../entities/agent-invocation.entity';
import { AgentBudgetService } from './agent-budget.service';
import { platformCutOf } from '../economy/creation-revenue-share';

import type {
  CapabilityManifest,
  CreationVerb,
  McpToolDescriptor,
  Offering,
} from '../../../../shared/types/creation';
import type {
  InvokeCreationRequest,
  InvokeCreationResponse,
  GetCreationManifestResponse,
} from '../../../../shared/types/creation-api';
import type { WorldCreationError } from '../../../../shared/types/world-creation';

/** 消费类动词:触发预设额度核销与权威结算(需求 13.4)。 */
const CONSUMING_VERBS: ReadonlySet<CreationVerb> = new Set<CreationVerb>([
  'order',
  'book',
  'subscribe',
  'donate',
]);

/**
 * AgentGatewayService — Agent 调用网关(world-creation-feed task 9.1 / 9.2 / 9.3)。
 *
 * spec: .kiro/specs/world-creation-feed/{requirements,design}.md(§Agent Invocation)
 *   - 需求 13.1/13.2:暴露能力清单(MCP 工具)+ 标准动词调用入口。
 *   - 需求 13.3:经平台中介鉴权/额度/审计;价格服务端权威(Property 3)。
 *   - 需求 13.4:消费类动词走预设额度核销;超额/越权拒绝。
 *   - 需求 13.5:每次调用鉴权/审计(谁/代谁/创作/动词/金额/结果)。
 *   - 需求 13.6:Tier_C customTools opt-in(经审核);非默认路径。
 *   - 需求 13.7:与人端同一份 offerings/权威逻辑,不开机器旁路(Property 1)。
 *
 * 调用链(design §Agent Invocation):
 *   鉴权(代谁 + 工具在清单内)→ 额度核销(消费类)→ 权威金额(服务端从持久化 offering 计算,
 *   忽略客户端 args 中的展示价)→ 审计写 agent_invocations → 回流 metrics.sales。
 *   结算失败 → 退回额度,保证余额不变(Property 2)。
 */
@Injectable()
export class AgentGatewayService {
  private readonly logger = new Logger(AgentGatewayService.name);

  constructor(
    private readonly repo: CreationRepository,
    private readonly stateMachine: CreationStateMachine,
    private readonly budget: AgentBudgetService,
    @InjectRepository(CreationCapabilityManifestEntity)
    private readonly manifestRepo: Repository<CreationCapabilityManifestEntity>,
    @InjectRepository(AgentInvocationEntity)
    private readonly invocationRepo: Repository<AgentInvocationEntity>,
  ) {}

  // ============================================================
  // GET 能力清单(需求 1.11 / 13.3)
  // ============================================================

  /** 读取某 Creation 当前生效的能力清单(MCP 工具集合)。 */
  async getManifest(creationId: string): Promise<GetCreationManifestResponse> {
    const creation = await this.getOrThrow(creationId);
    const manifest = await this.loadActiveManifest(creation);
    return { manifest };
  }

  // ============================================================
  // POST 调用(需求 13.2–13.7)
  // ============================================================

  /**
   * Agent 标准动词调用。`agentId` 为认证解析出的发起 Agent;`req.onBehalfOfAccountId`
   * 为被代表用户(额度/审计主体)。
   */
  async invoke(
    agentId: string,
    creationId: string,
    req: InvokeCreationRequest,
  ): Promise<InvokeCreationResponse> {
    const creation = await this.getOrThrow(creationId);

    // 1. 鉴权(可发现 + 工具在清单内)。非可发现创作不可被调用(Property 4 同源)。
    if (!this.stateMachine.isDiscoverable(creation.status)) {
      return this.reject(agentId, creationId, req, 'CAP_DENIED', `creation not invokable (status=${creation.status})`);
    }
    const manifest = await this.loadActiveManifest(creation);
    const tool = this.findTool(manifest, req.toolName, req.verb);
    if (!tool) {
      return this.reject(agentId, creationId, req, 'CAP_DENIED', `tool not in manifest: ${req.toolName}/${req.verb}`);
    }

    const consuming = CONSUMING_VERBS.has(req.verb);

    // 2. 非消费类(query/message):无副作用,直接放行 + 审计。
    if (!consuming) {
      const result = this.runNonConsuming(creation, req);
      return this.ok(agentId, creationId, req, { result });
    }

    // 3. 消费类:服务端权威金额(从持久化 offering 计算,忽略客户端展示价,Property 3)。
    const offering = this.resolveOffering(creation, req.offeringId);
    if (!offering) {
      return this.reject(agentId, creationId, req, 'ECONOMY_REJECTED', `offering not found: ${req.offeringId}`);
    }
    const amount = this.authoritativeAmount(offering, req.args);
    const currency = offering.price?.usd != null ? 'USD' : 'AXP';

    // 4. 预设额度核销(需求 13.4)。超额 → 拒绝,用量不变(Property 2)。
    const charged = await this.budget.charge(req.onBehalfOfAccountId, amount);
    if (!charged.ok) {
      return this.reject(
        agentId,
        creationId,
        req,
        'QUOTA_EXCEEDED',
        `preset budget exceeded (remaining=${charged.remaining}, preset=${charged.preset})`,
      );
    }

    // 5. 结算 + 回流 metrics.sales。结算失败 → 退回额度(余额不变)。
    try {
      const platformCut = this.platformCut(creation, amount);
      await this.reflowSale(creation);
      return this.ok(agentId, creationId, req, {
        authoritativeAmount: amount,
        platformCut,
        currency,
        result: { offeringId: offering.id, settled: true },
      });
    } catch (e: any) {
      await this.budget.refund(req.onBehalfOfAccountId, amount);
      return this.reject(agentId, creationId, req, 'ECONOMY_REJECTED', e?.message ?? 'settlement failed');
    }
  }

  // ============================================================
  // Internal
  // ============================================================

  private async getOrThrow(creationId: string): Promise<CreationEntity> {
    const c = await this.repo.findById(creationId);
    if (!c) throw new NotFoundException(`Creation not found: ${creationId}`);
    return c;
  }

  /** 读取生效清单;无则按当前 manifestVersion 返回空清单(兜底)。 */
  private async loadActiveManifest(creation: CreationEntity): Promise<CapabilityManifest> {
    const row = await this.manifestRepo.findOne({
      where: { creationId: creation.id, isActive: true },
    });
    if (!row) {
      return { creationId: creation.id, version: creation.manifestVersion ?? 0, tools: [] };
    }
    return {
      creationId: row.creationId,
      version: row.version,
      tools: row.tools ?? [],
      customTools: row.customTools ?? undefined,
    };
  }

  /** 在清单(含 Tier_C customTools)中按 name+verb 匹配工具。 */
  private findTool(
    manifest: CapabilityManifest,
    toolName: string,
    verb: CreationVerb,
  ): McpToolDescriptor | null {
    const all = [...(manifest.tools ?? []), ...(manifest.customTools ?? [])];
    return all.find((tl) => tl.name === toolName && tl.verb === verb) ?? null;
  }

  private resolveOffering(creation: CreationEntity, offeringId?: string): Offering | null {
    const offerings = creation.offerings ?? [];
    if (offeringId) return offerings.find((o) => o.id === offeringId) ?? null;
    return offerings[0] ?? null;
  }

  /**
   * 服务端权威金额:从持久化 offering 的价格计算(优先 AXP,否则 USD),按 args.qty
   * 受库存夹取放大。**忽略客户端传入的任何价格**(Property 3)。
   */
  private authoritativeAmount(offering: Offering, args: Record<string, unknown>): number {
    const unit = offering.price?.axp ?? offering.price?.usd ?? 0;
    const reqQty = Number((args as any)?.qty ?? 1);
    let qty = Number.isFinite(reqQty) && reqQty > 0 ? Math.floor(reqQty) : 1;
    const stock = offering.availability?.stock;
    if (typeof stock === 'number' && stock >= 0) qty = Math.min(qty, stock);
    return Math.max(0, unit * qty);
  }

  /** 平台抽成:一级(首创自售 5%)/ 二级(转手 30%),统一抽成模型(task 12.3/10.1)。 */
  private platformCut(creation: CreationEntity, amount: number): number {
    return platformCutOf(amount, creation.ownerAccountId, creation.originalCreatorAccountId);
  }

  /** 非消费类动词的只读返回(query 信息 / message 受理)。 */
  private runNonConsuming(
    creation: CreationEntity,
    req: InvokeCreationRequest,
  ): Record<string, unknown> {
    if (req.verb === 'query') {
      return {
        title: creation.title,
        type: creation.type,
        offerings: (creation.offerings ?? []).map((o) => ({
          id: o.id,
          name: o.name,
          price: o.price,
          verbs: o.verbs,
          stock: o.availability?.stock,
        })),
      };
    }
    // message:受理留言/请求(转交创作或其 Agent;真正投递在 social 阶段对接)。
    return { received: true };
  }

  /** 成交回流:metrics.sales += 1(需求 13.8 回流世界信号)。 */
  private async reflowSale(creation: CreationEntity): Promise<void> {
    creation.metrics = {
      ...creation.metrics,
      sales: (creation.metrics?.sales ?? 0) + 1,
    };
    await this.repo.save(creation);
  }

  // ── 审计写入 + 响应构造 ──

  private async ok(
    agentId: string,
    creationId: string,
    req: InvokeCreationRequest,
    extra: {
      authoritativeAmount?: number;
      platformCut?: number;
      currency?: string;
      result?: Record<string, unknown>;
    },
  ): Promise<InvokeCreationResponse> {
    const saved = await this.audit(agentId, creationId, req, 'ok', {
      authoritativeAmount: extra.authoritativeAmount,
      platformCut: extra.platformCut,
      currency: extra.currency,
      result: extra.result,
    });
    return {
      outcome: 'ok',
      verb: req.verb,
      invocationId: saved.id,
      authoritativeAmount: extra.authoritativeAmount,
      platformCut: extra.platformCut,
      result: extra.result,
    };
  }

  private async reject(
    agentId: string,
    creationId: string,
    req: InvokeCreationRequest,
    code: WorldCreationError['error'],
    detail: string,
  ): Promise<InvokeCreationResponse> {
    const saved = await this.audit(agentId, creationId, req, 'rejected', {
      errorCode: code,
      errorDetail: detail,
    });
    this.logger.warn(`Invoke rejected: creation=${creationId} verb=${req.verb} ${code} "${detail}"`);
    return {
      outcome: 'rejected',
      verb: req.verb,
      invocationId: saved.id,
      error: { error: code, detail },
    };
  }

  /** 写一条 agent_invocations 审计(谁/代谁/创作/动词/金额/结果,需求 13.5)。 */
  private async audit(
    agentId: string,
    creationId: string,
    req: InvokeCreationRequest,
    outcome: 'ok' | 'rejected',
    extra: {
      authoritativeAmount?: number;
      platformCut?: number;
      currency?: string;
      result?: Record<string, unknown>;
      errorCode?: WorldCreationError['error'];
      errorDetail?: string;
    },
  ): Promise<AgentInvocationEntity> {
    const row = this.invocationRepo.create({
      agentId,
      onBehalfOfAccountId: req.onBehalfOfAccountId,
      creationId,
      verb: req.verb,
      toolName: req.toolName,
      offeringId: req.offeringId ?? null,
      args: req.args ?? null,
      outcome,
      authoritativeAmount:
        extra.authoritativeAmount != null ? String(extra.authoritativeAmount) : null,
      platformCut: extra.platformCut != null ? String(extra.platformCut) : null,
      currency: extra.currency ?? null,
      result: extra.result ?? null,
      errorCode: extra.errorCode ?? null,
      errorDetail: extra.errorDetail ?? null,
    });
    return this.invocationRepo.save(row);
  }
}
