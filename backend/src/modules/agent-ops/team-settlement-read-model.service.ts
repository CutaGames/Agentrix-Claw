import { Injectable } from '@nestjs/common';

import type {
  SettlementRecord,
  TeamBillingMode,
} from './team-productization.types';

/** 结算记录读模型查询过滤(看板 / 列表用)。 */
export interface SettlementRecordFilter {
  /** 仅返回涉及该 agent(执行方或分佣方)的记录。 */
  agentId?: string;
  /** 仅返回该计费模式的记录。 */
  mode?: TeamBillingMode;
  /** 返回条数上限(默认全部)。 */
  limit?: number;
}

/**
 * TeamSettlementReadModel — 团队结算 / 多跳分佣记录的轻量读模型(crypto-native-agent-ops)。
 *
 * 背景:{@link HireSettlementOrchestrator}/{@link TeamProductizationService} 只产出结算结果
 * 并驱动 `recordSpending` 入账,**不持久化可查询的结算记录**。移动/桌面 UI 需要展示
 * 「结算 / 分佣」记录,故在不改动既有 service 逻辑的前提下,补一层薄读模型:
 *   - 控制器在 `settleTeamResult` 成功后,把 `toSettlementRecord(result)` 写入本读模型(按 owner 维度)。
 *   - 列表端点据 owner(+ 可选 agentId / mode 过滤)读取。
 *
 * **持久化边界(显式):** 本读模型为进程内内存存储(非跨实例 / 重启不保留),
 * 满足 UI 即时展示的最小读取面;若需跨实例 / 持久化审计,后续可替换为 `agent_ops_*` 表
 * 落库实现(接口保持不变)。
 */
@Injectable()
export class TeamSettlementReadModel {
  /** ownerId → 结算记录(最新在前)。 */
  private readonly store = new Map<string, SettlementRecord[]>();

  /** 记录一笔结算(控制器在结算成功后调用)。 */
  record(ownerId: string, record: SettlementRecord): void {
    const list = this.store.get(ownerId) ?? [];
    list.unshift(record);
    this.store.set(ownerId, list);
  }

  /** 列出某 owner 的结算记录(可按 agentId / mode 过滤)。 */
  list(ownerId: string, filter: SettlementRecordFilter = {}): SettlementRecord[] {
    let records = this.store.get(ownerId) ?? [];
    if (filter.mode) {
      records = records.filter((r) => r.mode === filter.mode);
    }
    if (filter.agentId) {
      const agentId = filter.agentId;
      records = records.filter((r) =>
        r.parties.some((p) => p.agentId === agentId),
      );
    }
    if (typeof filter.limit === 'number' && filter.limit >= 0) {
      records = records.slice(0, filter.limit);
    }
    return records;
  }
}
