import { Injectable, Logger } from '@nestjs/common';

/**
 * AsyncInboxService — 异步收件箱(Task 2.3 起用最小版,Phase 4 扩展为完整 digest)。
 *
 * design "实时 vs 异步双轨":针对离线用户的事件(agent 不可用通知、任务接受、
 * 雇佣 offer、工资、世界事件)入队,用户回来时汇总呈现。Phase 2 先提供入队 +
 * 读取最小能力,供 AgentDriverService(R2.8)与后续招聘/任务模块复用。
 *
 * Phase 2 用内存队列(进程内),Phase 4 落库 `aeon_inbox_items` + 跨实例。
 */
export type AeonInboxKind =
  | 'agent_unavailable'
  | 'task_accepted'
  | 'hire_offer'
  | 'wage_paid'
  | 'world_event'
  | 'payroll_halted'
  | 'agent_withdrawn';

export interface AeonInboxItem {
  id: string;
  userId: string;
  kind: AeonInboxKind;
  title: string;
  body: string;
  refId?: string;
  createdAt: number;
  read: boolean;
}

@Injectable()
export class AsyncInboxService {
  private readonly logger = new Logger(AsyncInboxService.name);
  /** userId -> items(最新在前)。Phase 4 改为持久化。 */
  private readonly inbox = new Map<string, AeonInboxItem[]>();
  private seq = 0;

  /** 入队一条收件箱事件(针对离线/异步处理)。 */
  push(userId: string, kind: AeonInboxKind, title: string, body: string, refId?: string): AeonInboxItem {
    const item: AeonInboxItem = {
      id: `inbox-${Date.now()}-${this.seq++}`,
      userId,
      kind,
      title,
      body,
      refId,
      createdAt: Date.now(),
      read: false,
    };
    const list = this.inbox.get(userId) ?? [];
    list.unshift(item);
    // 防爆:每人最多保留 200 条(Phase 4 落库后改为分页)。
    if (list.length > 200) list.length = 200;
    this.inbox.set(userId, list);
    return item;
  }

  /** 取某用户的收件箱(digest)。 */
  list(userId: string, unreadOnly = false): AeonInboxItem[] {
    const list = this.inbox.get(userId) ?? [];
    return unreadOnly ? list.filter((i) => !i.read) : list;
  }

  /** 标记已读。 */
  markRead(userId: string, ids?: string[]): void {
    const list = this.inbox.get(userId);
    if (!list) return;
    for (const i of list) {
      if (!ids || ids.includes(i.id)) i.read = true;
    }
  }

  /** 未读数。 */
  unreadCount(userId: string): number {
    return this.list(userId, true).length;
  }
}
