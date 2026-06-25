import { Injectable, BadRequestException } from '@nestjs/common';
import type { CreationStatus } from '../../../shared/types/creation';

/**
 * Creation 生命周期状态机(world-creation-feed task 1.2)。
 *
 * spec: .kiro/specs/world-creation-feed/{requirements,design}.md
 *   - 需求 1.4:Creation 具备 draft / under_review / published / listed /
 *               unpublished / suspended 六态生命周期。
 *   - 需求 3.1(审核前置):仅审核通过后 Creation 方可出现在发现面 —— 进入
 *               published/listed 必须先经 under_review。
 *   - 需求 3.4(违规即移出):任意状态可被 moderation 置为 suspended,且 suspended
 *               立即移出发现面;suspended 为终态(terminal-ish,不再对外转移)。
 *   - design §Correctness Properties — Property 4(审核前置):状态非
 *               published/listed 的 Creation 不出现在任何发现面。
 *
 * 设计为**纯逻辑模块 + 薄注入服务**,不依赖仓储/DB,便于单元测试。状态流转的
 * 持久化编排(读实体 → 校验 → 写回)在 task 1.5 的 CRUD 服务中复用本守卫。
 *
 * 合法转移表(design §Components):
 *
 *   draft        → under_review | suspended
 *   under_review → published | listed | draft | suspended
 *   published    → listed | unpublished | suspended
 *   listed       → published | unpublished | suspended
 *   unpublished  → under_review | published | listed | suspended
 *   suspended    → ∅  (终态)
 *
 * 关键不变量:
 *  1. 进入 published/listed 的唯一前驱(除彼此互转与下架重发)必经 under_review,
 *     落实"审核前置"(需求 3.1)。
 *  2. suspended 可从任意非终态进入(违规即封,需求 3.4),且不可再转出。
 *  3. 审核未过(under_review → draft)保留内容、回到可编辑草稿(需求 3.3)。
 */
export const CREATION_STATE_TRANSITIONS: Readonly<
  Record<CreationStatus, readonly CreationStatus[]>
> = {
  draft: ['under_review', 'suspended'],
  under_review: ['published', 'listed', 'draft', 'suspended'],
  published: ['listed', 'unpublished', 'suspended'],
  listed: ['published', 'unpublished', 'suspended'],
  unpublished: ['under_review', 'published', 'listed', 'suspended'],
  suspended: [],
};

/**
 * 发现面可见状态集合(Property 4)。只有 published / listed 的 Creation 可出现在
 * 地图 / 创作流 / Agent 检索;其余(含 suspended)一律不可见。
 */
export const DISCOVERABLE_STATUSES: ReadonlySet<CreationStatus> = new Set<CreationStatus>([
  'published',
  'listed',
]);

/** 非法状态转移错误码(结构化错误,供前后端一致处理)。 */
export const INVALID_CREATION_TRANSITION = 'INVALID_CREATION_TRANSITION';

/** 非法状态转移错误体(随 BadRequestException 抛出)。 */
export interface CreationTransitionErrorBody {
  code: typeof INVALID_CREATION_TRANSITION;
  message: string;
  from: CreationStatus;
  to: CreationStatus;
  /** 当前状态允许的合法后继,便于调用方纠偏。 */
  allowed: readonly CreationStatus[];
}

/**
 * 非法 Creation 状态转移异常 —— 携带结构化错误体(from/to/allowed),
 * 继承 NestJS BadRequestException(HTTP 400)。
 */
export class InvalidCreationTransitionError extends BadRequestException {
  constructor(from: CreationStatus, to: CreationStatus) {
    const allowed = CREATION_STATE_TRANSITIONS[from] ?? [];
    const body: CreationTransitionErrorBody = {
      code: INVALID_CREATION_TRANSITION,
      message: `Illegal Creation status transition: ${from} → ${to}`,
      from,
      to,
      allowed,
    };
    super(body);
  }
}

/**
 * 纯函数:判断从 `from` 转移到 `to` 是否合法。
 * 同态转移(from === to)视为非法(无副作用的状态机不应自环)。
 */
export function isValidCreationTransition(
  from: CreationStatus,
  to: CreationStatus,
): boolean {
  return (CREATION_STATE_TRANSITIONS[from] ?? []).includes(to);
}

/** 纯函数:返回 `from` 状态允许的全部合法后继(只读副本)。 */
export function getAllowedCreationTransitions(
  from: CreationStatus,
): readonly CreationStatus[] {
  return CREATION_STATE_TRANSITIONS[from] ?? [];
}

/** 纯函数:判断某状态是否对发现面可见(Property 4)。 */
export function isDiscoverableStatus(status: CreationStatus): boolean {
  return DISCOVERABLE_STATUSES.has(status);
}

/**
 * 纯函数:校验转移合法性,非法则抛 {@link InvalidCreationTransitionError}。
 * 这是状态流转的唯一守卫入口,供服务层在写回前调用。
 */
export function assertCreationTransition(
  from: CreationStatus,
  to: CreationStatus,
): void {
  if (!isValidCreationTransition(from, to)) {
    throw new InvalidCreationTransitionError(from, to);
  }
}

/**
 * CreationStateMachine — Creation 生命周期状态机服务(注入式薄封装)。
 *
 * 把上述纯函数暴露为可注入的 provider,供 task 1.5 的 CRUD/流转服务与
 * task 2.x 的审核/发布编排复用同一套转换守卫,保证"审核前置 / 违规即移出"
 * 等不变量在唯一位置实现。
 */
@Injectable()
export class CreationStateMachine {
  /** 当前状态允许的合法后继。 */
  allowedTransitions(from: CreationStatus): readonly CreationStatus[] {
    return getAllowedCreationTransitions(from);
  }

  /** 转移是否合法。 */
  canTransition(from: CreationStatus, to: CreationStatus): boolean {
    return isValidCreationTransition(from, to);
  }

  /** 校验转移,非法抛 {@link InvalidCreationTransitionError}。 */
  assertTransition(from: CreationStatus, to: CreationStatus): void {
    assertCreationTransition(from, to);
  }

  /** 状态是否对发现面可见(published/listed)。 */
  isDiscoverable(status: CreationStatus): boolean {
    return isDiscoverableStatus(status);
  }
}
