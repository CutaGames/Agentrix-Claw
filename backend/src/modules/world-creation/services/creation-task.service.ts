import {
  Injectable,
  Inject,
  Optional,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreationTask } from '../entities/creation-task.entity';
import {
  CREATION_TASK_DISPATCHER,
  type CreationTaskDispatcher,
  type CreationTaskDispatchContext,
} from './creation-task.dispatcher';
import { resolveCreationRouting } from './creation-routing';
import { NotificationService } from '../../notification/notification.service';
import { NotificationType } from '../../../entities/notification.entity';
import type {
  CreationTaskStatus,
  CreationTaskTarget,
  SubstrateTier,
} from '../../../../shared/types/world-creation';
import type {
  SubmitCreationTaskRequest,
  SubmitCreationTaskResponse,
  GetCreationTaskResponse,
  RetryCreationTaskResponse,
  CreationTaskDto,
  CreationSurface,
} from '../../../../shared/types/world-creation-api';

/**
 * Creation_Task 状态机合法转移表 (design §8)。
 *
 *   queued  → running | failed         (受理后执行；派发未受理则直接失败)
 *   running → completed | failed       (执行结束)
 *   failed  → queued                   (retry，保留输入)
 *
 * completed / queued (终态 completed / 重排队后) 不再向外转移。
 */
const LEGAL_TRANSITIONS: Readonly<Record<CreationTaskStatus, readonly CreationTaskStatus[]>> = {
  queued: ['running', 'failed'],
  running: ['completed', 'failed'],
  failed: ['queued'],
  completed: [],
};

/** transitionStatus 的可选元数据 (completed 需 resultRef，failed 需 failReason)。 */
export interface TransitionOptions {
  /** 完成时的 ECS_World 工件引用 (versionId / diffId)，completed 转移必填 (R8.5)。 */
  resultRef?: string;
  /** 失败原因，failed 转移必填 (R8.6)。 */
  failReason?: string;
}

/**
 * CreationTaskService — 跨端创作任务队列 (design §8, R8)。
 *
 * 入队任务并派发到 self / desktop / Agent_Builder，并暴露状态机
 * queued → running → completed | failed (design §8 stateDiagram)。
 *  - `desktop`：经用户绑定桌面端长连接（复用现有 Agent 任务通道）执行并跟踪状态 (R8.2)。
 *  - `agent`：允许 Agent_Builder 在用户离线时自治执行（复用 OpenClaw/`/claude/chat`
 *            工具调用，工具集换成 World_API 编辑能力）(R8.3)。
 *  - `self`：由发起端本地执行，入队后保持 queued，待发起端回报状态。
 *
 * 派发通道收敛在可注入的 {@link CreationTaskDispatcher} 后面（默认占位实现，便于状态机
 * 单测）。完成通知 / 重试 / Mobile Tier_C 强制路由属 task 20.2（此处 `retry` 仍为桩）。
 */
@Injectable()
export class CreationTaskService {
  private readonly logger = new Logger(CreationTaskService.name);

  constructor(
    @InjectRepository(CreationTask)
    private readonly taskRepo: Repository<CreationTask>,
    @Inject(CREATION_TASK_DISPATCHER)
    private readonly dispatcher: CreationTaskDispatcher,
    /**
     * 完成通知发起者 (R8.5)。以 @Optional 注入，缺失时 {@link notifyOnCompletion}
     * 退化为 no-op，保证状态机单测无需挂通知设施。
     */
    @Optional()
    private readonly notificationService?: NotificationService,
  ) {}

  /**
   * R8.1 入队并派发任务 (含 R8.7 Mobile Tier_C 强制路由)。
   *
   * 先按发起端 surface + substrateTier 解析有效派发目标
   * ({@link resolveEffectiveTarget})：Mobile 发起的 Tier_C 任务被强制路由到
   * desktop / agent，**绝不**在 Mobile (`self`) 执行 (复用 `resolveCreationRouting`)。
   * 随后入队写 `creation_tasks` (status=queued)，再按有效 target 派发：
   *  - `self` → 不经派发通道，保持 queued (发起端本地执行后回报状态)。
   *  - `desktop` / `agent` → 经 {@link CreationTaskDispatcher} 投递；受理则推进到
   *    running，未受理则进入 failed 并记录原因。
   *
   * 返回的 `effectiveTarget` 反映强制路由后的真实目标 (可能不同于请求的 target)。
   */
  async submit(
    userId: string,
    req: SubmitCreationTaskRequest,
  ): Promise<SubmitCreationTaskResponse> {
    if (!userId) {
      throw new BadRequestException('userId is required to submit a Creation_Task');
    }
    const requestedTarget = this.assertValidTarget(req?.target);
    // R8.7：Mobile Tier_C 强制路由到 desktop / agent (绝不 self)。
    const target = this.resolveEffectiveTarget(
      requestedTarget,
      req?.surface,
      req?.substrateTier ?? null,
    );

    const entity = this.taskRepo.create({
      userId,
      plotId: req.plotId ?? null,
      target,
      substrateTier: req.substrateTier ?? null,
      status: 'queued' as CreationTaskStatus,
      inputJson: req.input ?? {},
      resultRef: null,
      failReason: null,
    });
    let saved = await this.taskRepo.save(entity);
    this.logger.debug(
      `enqueued Creation_Task ${saved.id} (requested=${requestedTarget}, ` +
        `effective=${target}, surface=${req?.surface ?? 'n/a'}, status=queued)`,
    );

    // `self` 任务由发起端本地执行，入队后保持 queued (R8.1)。
    if (target !== 'self') {
      saved = await this.dispatch(saved, target);
    }

    return { task: this.toDto(saved), effectiveTarget: target };
  }

  /** R8.4 查询任务状态 (仅限发起者本人可见)。 */
  async get(userId: string, taskId: string): Promise<GetCreationTaskResponse> {
    const task = await this.loadOwned(userId, taskId);
    return { task: this.toDto(task) };
  }

  /**
   * Creation_Task 状态机转移 (design §8)。校验合法转移后落库：
   *  - `running`：从 queued 进入执行。
   *  - `completed`：从 running 结束，必带 ECS_World 工件引用 (resultRef, R8.5)。
   *  - `failed`：从 running 结束，必带失败原因 (failReason, R8.6)；保留 inputJson。
   *  - `queued`：failed → queued 重排队 (retry, task 20.2)，清空 failReason。
   *
   * 非法转移抛 {@link BadRequestException}。
   */
  async transitionStatus(
    taskId: string,
    next: CreationTaskStatus,
    opts: TransitionOptions = {},
  ): Promise<CreationTask> {
    const task = await this.taskRepo.findOne({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException(`Creation_Task ${taskId} not found`);
    }
    this.assertLegalTransition(task.status, next);

    if (next === 'completed') {
      const resultRef = opts.resultRef ?? task.resultRef;
      if (!resultRef) {
        throw new BadRequestException(
          'Transition to completed requires a resultRef (ECS_World artifact reference)',
        );
      }
      task.resultRef = resultRef;
      task.failReason = null;
    } else if (next === 'failed') {
      const failReason = opts.failReason ?? task.failReason;
      if (!failReason) {
        throw new BadRequestException('Transition to failed requires a failReason');
      }
      task.failReason = failReason;
      // 保留 inputJson 以支持 retry (R8.6)。
    } else if (next === 'queued') {
      // retry 重排队：清空上一轮失败原因 (输入 inputJson 保留)。
      task.failReason = null;
    }

    task.status = next;
    const saved = await this.taskRepo.save(task);
    this.logger.debug(`Creation_Task ${taskId} status → ${next}`);

    // R8.5：完成时通知发起者并附 ECS_World 工件引用。
    if (next === 'completed') {
      await this.notifyOnCompletion(saved);
    }
    return saved;
  }

  /**
   * R8.6 失败任务重试，保留原始输入。
   *
   * 校验任务归属本人且当前处于 `failed` 状态，随后：
   *  1. 经状态机 failed → queued 重排队（清空上一轮 failReason，inputJson 原样保留）。
   *  2. 按任务原有 target 重新派发：
   *     - `self` → 保持 queued (发起端本地重试)。
   *     - `desktop` / `agent` → 经派发通道重投，受理则 running、拒绝则重新 failed。
   *
   * R8.7 不变量天然成立：Mobile Tier_C 在首次 submit 已被强制路由为 desktop / agent，
   * 落库的 target 绝不为 self/mobile，故重试沿用原 target 仍不会回到 Mobile。
   *
   * 非 failed 状态重试抛 {@link BadRequestException}；任务不存在 / 非本人抛 404。
   */
  async retry(
    userId: string,
    taskId: string,
  ): Promise<RetryCreationTaskResponse> {
    const task = await this.loadOwned(userId, taskId);
    if (task.status !== 'failed') {
      throw new BadRequestException(
        `Only a failed Creation_Task can be retried (task ${taskId} is ${task.status})`,
      );
    }

    // failed → queued：保留 inputJson，清空 failReason (R8.6)。
    let requeued = await this.transitionStatus(taskId, 'queued');
    this.logger.debug(`retry Creation_Task ${taskId}: re-queued (target=${requeued.target})`);

    // 重新派发到原有目标 (self 保持 queued，待发起端本地重试回报)。
    if (requeued.target !== 'self') {
      requeued = await this.dispatch(requeued, requeued.target);
    }

    return { task: this.toDto(requeued) };
  }

  // ----------------------------------------------------------------
  // internal helpers
  // ----------------------------------------------------------------

  /**
   * R8.7 解析有效派发目标：Mobile 发起的 Tier_C 任务强制路由到 desktop / agent，
   * 绝不在 Mobile (`self`) 执行 (复用 {@link resolveCreationRouting})。
   *
   * 其余情形 (非 Mobile、或 Tier_A/B) 沿用请求的 target。强制路由时，请求的
   * desktop/agent 作为偏好目标透传 (默认 desktop)。
   */
  private resolveEffectiveTarget(
    requestedTarget: CreationTaskTarget,
    surface: CreationSurface | undefined,
    substrateTier: SubstrateTier | null,
  ): CreationTaskTarget {
    if (surface === 'mobile' && substrateTier === 'C') {
      const preferred = requestedTarget === 'agent' ? 'agent' : 'desktop';
      const decision = resolveCreationRouting('mobile', 'C', preferred);
      // decision.target 必为 desktop / agent (Mobile Tier_C 强制 mustDispatch)。
      return decision.target;
    }
    return requestedTarget;
  }

  /**
   * R8.5 完成通知：向发起者推送一条带 ECS_World 工件引用 (resultRef) 的通知。
   * 通知设施缺失 (未注入) 或推送失败均不阻断状态转移 (best-effort)。
   */
  private async notifyOnCompletion(task: CreationTask): Promise<void> {
    if (!this.notificationService || !task.userId) {
      return;
    }
    try {
      await this.notificationService.createNotification(task.userId, {
        type: NotificationType.SYSTEM,
        title: 'Your creation task is ready',
        message:
          `Creation_Task ${task.id} completed. ` +
          `Resulting ECS_World artifact: ${task.resultRef ?? '(unknown)'}.`,
        metadata: {
          kind: 'creation_task_completed',
          taskId: task.id,
          plotId: task.plotId,
          // ECS_World 工件引用 (versionId / diffId)，供客户端跳转打开结果 (R8.5)。
          artifactRef: task.resultRef,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to notify user ${task.userId} of Creation_Task ${task.id} completion: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * 派发到 desktop / agent 通道并推进状态机：受理 → running，拒绝 → failed。
   * 派发抛错也归一化为 failed (保留输入 + 记录原因，R8.6)，不让入队失败回滚。
   */
  private async dispatch(
    task: CreationTask,
    target: Exclude<CreationTaskTarget, 'self'>,
  ): Promise<CreationTask> {
    const ctx: CreationTaskDispatchContext = {
      taskId: task.id,
      userId: task.userId,
      plotId: task.plotId,
      substrateTier: task.substrateTier,
      target,
      input: task.inputJson ?? {},
    };

    let accepted = false;
    let detail: string | undefined;
    try {
      const result =
        target === 'desktop'
          ? await this.dispatcher.dispatchToDesktop(ctx)
          : await this.dispatcher.dispatchToAgent(ctx);
      accepted = result.accepted;
      detail = result.detail;
    } catch (err) {
      accepted = false;
      detail = err instanceof Error ? err.message : 'dispatch channel error';
      this.logger.warn(`dispatch of task ${task.id} → ${target} threw: ${detail}`);
    }

    if (accepted) {
      return this.transitionStatus(task.id, 'running');
    }
    return this.transitionStatus(task.id, 'failed', {
      failReason: `dispatch to ${target} was not accepted: ${detail ?? 'unknown reason'}`,
    });
  }

  /** 载入任务并校验归属 (非本人 / 不存在均按 404，避免泄露存在性)。 */
  private async loadOwned(userId: string, taskId: string): Promise<CreationTask> {
    const task = await this.taskRepo.findOne({ where: { id: taskId } });
    if (!task || task.userId !== userId) {
      throw new NotFoundException(`Creation_Task ${taskId} not found`);
    }
    return task;
  }

  private assertValidTarget(target: unknown): CreationTaskTarget {
    if (target === 'self' || target === 'desktop' || target === 'agent') {
      return target;
    }
    throw new BadRequestException(
      `Invalid dispatch target '${String(target)}' (expected self | desktop | agent)`,
    );
  }

  private assertLegalTransition(
    from: CreationTaskStatus,
    to: CreationTaskStatus,
  ): void {
    const allowed = LEGAL_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) {
      throw new BadRequestException(
        `Illegal Creation_Task status transition: ${from} → ${to}`,
      );
    }
  }

  private toDto(task: CreationTask): CreationTaskDto {
    return {
      taskId: task.id,
      userId: task.userId,
      plotId: task.plotId ?? '',
      target: task.target,
      status: task.status,
      substrateTier: (task.substrateTier ?? 'A') as SubstrateTier,
      resultRef: task.resultRef,
      failReason: task.failReason,
      createdAt: task.createdAt?.toISOString?.() ?? new Date(0).toISOString(),
      updatedAt: task.updatedAt?.toISOString?.() ?? new Date(0).toISOString(),
    };
  }
}
