/**
 * P1-05 · Shared Client Platform — Soul Core clients + fallback + flags.
 *
 * `SoulCoreAggregateClient` is concrete (backed by the live P1-02 aggregate
 * API). Action/Authority/TaskProof/Handoff are typed interfaces backed by the
 * P1-03 contracts; concrete implementations land when those runtimes are wired.
 * No client derives a stable `soulCoreId` (web-soul-core-console-v6 §6.2).
 */
import {
  decodeSoulCoreAggregateV1,
  SOUL_CORE_AGGREGATE_SCHEMA_VERSION,
  type SoulCoreAggregateV1,
} from '../types/soul-core-aggregate';
import {
  decodeSoulCoreRefV1,
  type SoulCoreRefV1,
  type SoulCoreViewV1,
} from '../types/soul-core';
import {
  ACTION_RUNTIME_SCHEMA_VERSION,
  type ActionAuthorizationPreviewV1,
  type ActionLifecycleStateV1,
  type ActionMutationResultV1,
  type ActionTaskListV1,
  type ActionTaskV1,
  type ActionTransitionLogEntryV1,
  type CreateActionRequestV1,
  type DecideActionRequestV1,
  type ExecuteActionRequestV1,
  type RetryActionRequestV1,
  type TaskProofRecordV1,
} from '../types/action-runtime';
import { requestJson, type ClientContextV1, type HttpTransportV1 } from './transport';
import { SoulCoreClientError, type ClientErrorKindV1 } from './errors';

/** Unwrap the Backend `{ success, data }` envelope, tolerating a bare payload. */
function unwrapData(body: unknown): unknown {
  if (body && typeof body === 'object' && 'data' in (body as Record<string, unknown>)) {
    return (body as Record<string, unknown>).data;
  }
  return body;
}

/** Concrete P1-02 aggregate client. */
export class SoulCoreAggregateClient {
  constructor(
    private readonly transport: HttpTransportV1,
    private readonly ctx: ClientContextV1,
  ) {}

  /** `GET /v1/soul-cores` — side-effect-free directory of owned stable refs. */
  async listRefs(): Promise<SoulCoreRefV1[]> {
    return requestJson(
      this.transport,
      { ...this.ctx, schemaVersion: SOUL_CORE_AGGREGATE_SCHEMA_VERSION },
      { method: 'GET', path: '/v1/soul-cores' },
      (body) => {
        const data = unwrapData(body);
        if (!Array.isArray(data)) throw new Error('Invalid Soul Core directory');
        return data.map((item) => decodeSoulCoreRefV1(item));
      },
    );
  }

  /** `GET /v1/soul-cores/:soulCoreId` — typed, version-negotiated, decoded. */
  async getAggregate(soulCoreId: string): Promise<SoulCoreAggregateV1> {
    return requestJson(
      this.transport,
      { ...this.ctx, schemaVersion: SOUL_CORE_AGGREGATE_SCHEMA_VERSION },
      { method: 'GET', path: `/v1/soul-cores/${encodeURIComponent(soulCoreId)}` },
      (body) => decodeSoulCoreAggregateV1(unwrapData(body)),
    );
  }
}

/** Legacy compatibility view (`GET /agent-accounts/:id/soul-core`) — kept for fallback only. */
export class SoulCoreLegacyViewClient {
  constructor(
    private readonly transport: HttpTransportV1,
    private readonly ctx: ClientContextV1,
  ) {}

  async getView(agentAccountId: string): Promise<SoulCoreViewV1> {
    return requestJson(
      this.transport,
      this.ctx,
      { method: 'GET', path: `/agent-accounts/${encodeURIComponent(agentAccountId)}/soul-core` },
      (body) => unwrapData(body) as SoulCoreViewV1,
    );
  }
}

// ---- P1-03 concrete runtime clients ----

export interface ActionMutationOptionsV1 {
  idempotencyKey: string;
  requestId?: string;
}

function actionHeaders(options: ActionMutationOptionsV1): Record<string, string> {
  return {
    'Idempotency-Key': options.idempotencyKey,
    ...(options.requestId ? { 'X-Request-Id': options.requestId } : {}),
  };
}

function decodeActionContract<T>(body: unknown, validate: (data: Record<string, unknown>) => boolean): T {
  const data = unwrapData(body);
  if (
    !data ||
    typeof data !== 'object' ||
    (data as Record<string, unknown>).schemaVersion !== ACTION_RUNTIME_SCHEMA_VERSION ||
    !validate(data as Record<string, unknown>)
  ) {
    throw new SoulCoreClientError({
      kind: 'version_mismatch',
      message: 'Invalid Action Runtime v1 response',
      retryable: false,
      code: 'ACTION_SCHEMA_UNSUPPORTED',
    });
  }
  return data as T;
}

export interface ActionClientV1 {
  listTasks(soulCoreId: string): Promise<ActionTaskListV1>;
  getTask(soulCoreId: string, taskId: string): Promise<ActionTaskV1>;
  getLifecycle(soulCoreId: string, taskId: string): Promise<ActionLifecycleStateV1>;
  getTimeline(soulCoreId: string, taskId: string): Promise<ActionTransitionLogEntryV1[]>;
  createTask(
    soulCoreId: string,
    request: CreateActionRequestV1,
    options: ActionMutationOptionsV1,
  ): Promise<ActionMutationResultV1>;
  decideAuthorization(
    soulCoreId: string,
    taskId: string,
    request: DecideActionRequestV1,
    options: ActionMutationOptionsV1,
  ): Promise<ActionMutationResultV1>;
  execute(
    soulCoreId: string,
    taskId: string,
    request: ExecuteActionRequestV1,
    options: ActionMutationOptionsV1,
  ): Promise<ActionMutationResultV1>;
  revoke(
    soulCoreId: string,
    taskId: string,
    request: ExecuteActionRequestV1,
    options: ActionMutationOptionsV1,
  ): Promise<ActionMutationResultV1>;
  retry(
    soulCoreId: string,
    taskId: string,
    request: RetryActionRequestV1,
    options: ActionMutationOptionsV1,
  ): Promise<ActionMutationResultV1>;
}

export class ActionHttpClientV1 implements ActionClientV1 {
  constructor(
    private readonly transport: HttpTransportV1,
    private readonly ctx: ClientContextV1,
  ) {}

  private path(soulCoreId: string, suffix = ''): string {
    return `/v1/soul-cores/${encodeURIComponent(soulCoreId)}/actions${suffix}`;
  }

  async listTasks(soulCoreId: string): Promise<ActionTaskListV1> {
    return requestJson(
      this.transport,
      { ...this.ctx, schemaVersion: ACTION_RUNTIME_SCHEMA_VERSION },
      { method: 'GET', path: this.path(soulCoreId) },
      (body) => decodeActionContract<ActionTaskListV1>(body, (data) => Array.isArray(data.items)),
    );
  }

  async getTask(soulCoreId: string, taskId: string): Promise<ActionTaskV1> {
    return requestJson(
      this.transport,
      { ...this.ctx, schemaVersion: ACTION_RUNTIME_SCHEMA_VERSION },
      { method: 'GET', path: this.path(soulCoreId, `/${encodeURIComponent(taskId)}`) },
      (body) => decodeActionContract<ActionTaskV1>(body, (data) => typeof data.lifecycle === 'object'),
    );
  }

  async getLifecycle(soulCoreId: string, taskId: string): Promise<ActionLifecycleStateV1> {
    return (await this.getTask(soulCoreId, taskId)).lifecycle;
  }

  async getTimeline(soulCoreId: string, taskId: string): Promise<ActionTransitionLogEntryV1[]> {
    return requestJson(
      this.transport,
      { ...this.ctx, schemaVersion: ACTION_RUNTIME_SCHEMA_VERSION },
      { method: 'GET', path: this.path(soulCoreId, `/${encodeURIComponent(taskId)}/timeline`) },
      (body) => {
        const data = unwrapData(body);
        if (!Array.isArray(data)) throw new Error('Invalid Action timeline');
        return data as ActionTransitionLogEntryV1[];
      },
    );
  }

  async createTask(
    soulCoreId: string,
    request: CreateActionRequestV1,
    options: ActionMutationOptionsV1,
  ): Promise<ActionMutationResultV1> {
    return this.mutate(this.path(soulCoreId), request, options);
  }

  async decideAuthorization(
    soulCoreId: string,
    taskId: string,
    request: DecideActionRequestV1,
    options: ActionMutationOptionsV1,
  ): Promise<ActionMutationResultV1> {
    return this.mutate(this.path(soulCoreId, `/${encodeURIComponent(taskId)}/authorization`), request, options);
  }

  async execute(
    soulCoreId: string,
    taskId: string,
    request: ExecuteActionRequestV1,
    options: ActionMutationOptionsV1,
  ): Promise<ActionMutationResultV1> {
    return this.mutate(this.path(soulCoreId, `/${encodeURIComponent(taskId)}/execute`), request, options);
  }

  async revoke(
    soulCoreId: string,
    taskId: string,
    request: ExecuteActionRequestV1,
    options: ActionMutationOptionsV1,
  ): Promise<ActionMutationResultV1> {
    return this.mutate(this.path(soulCoreId, `/${encodeURIComponent(taskId)}/revoke`), request, options);
  }

  async retry(
    soulCoreId: string,
    taskId: string,
    request: RetryActionRequestV1,
    options: ActionMutationOptionsV1,
  ): Promise<ActionMutationResultV1> {
    return this.mutate(this.path(soulCoreId, `/${encodeURIComponent(taskId)}/retry`), request, options);
  }

  private async mutate(
    path: string,
    body: CreateActionRequestV1 | DecideActionRequestV1 | ExecuteActionRequestV1 | RetryActionRequestV1,
    options: ActionMutationOptionsV1,
  ): Promise<ActionMutationResultV1> {
    return requestJson(
      this.transport,
      { ...this.ctx, schemaVersion: ACTION_RUNTIME_SCHEMA_VERSION },
      { method: 'POST', path, headers: actionHeaders(options), body },
      (response) => decodeActionContract<ActionMutationResultV1>(
        response,
        (data) => typeof data.task === 'object' && typeof data.replayed === 'boolean',
      ),
    );
  }
}

export interface AuthorityClientV1 {
  getPreview(soulCoreId: string, taskId: string): Promise<ActionAuthorizationPreviewV1>;
}

export class AuthorityHttpClientV1 implements AuthorityClientV1 {
  constructor(
    private readonly transport: HttpTransportV1,
    private readonly ctx: ClientContextV1,
  ) {}

  async getPreview(soulCoreId: string, taskId: string): Promise<ActionAuthorizationPreviewV1> {
    return requestJson(
      this.transport,
      { ...this.ctx, schemaVersion: ACTION_RUNTIME_SCHEMA_VERSION },
      {
        method: 'GET',
        path: `/v1/soul-cores/${encodeURIComponent(soulCoreId)}/actions/${encodeURIComponent(taskId)}/authorization`,
      },
      (body) => decodeActionContract<ActionAuthorizationPreviewV1>(
        body,
        (data) => typeof data.authorizationId === 'string' && typeof data.taskId === 'string',
      ),
    );
  }
}

export interface TaskProofClientV1 {
  getRecord(taskProofId: string): Promise<TaskProofRecordV1>;
}

export class TaskProofHttpClientV1 implements TaskProofClientV1 {
  constructor(
    private readonly transport: HttpTransportV1,
    private readonly ctx: ClientContextV1,
  ) {}

  async getRecord(taskProofId: string): Promise<TaskProofRecordV1> {
    return requestJson(
      this.transport,
      { ...this.ctx, schemaVersion: ACTION_RUNTIME_SCHEMA_VERSION },
      { method: 'GET', path: `/v1/task-proofs/${encodeURIComponent(taskProofId)}` },
      (body) => decodeActionContract<TaskProofRecordV1>(
        body,
        (data) => typeof data.taskProofId === 'string' && typeof data.proof === 'object',
      ),
    );
  }
}

export interface HandoffClientV1 {
  getHandoffState(soulCoreId: string): Promise<{ soulCoreId: string; taskId?: string; shellId?: string }>;
}

// ---- Feature flags + fallback ----

export interface ClientFeatureFlagsV1 {
  aggregateV1Enabled: boolean;
  actionV1Enabled: boolean;
  handoffV1Enabled: boolean;
}

export const DEFAULT_CLIENT_FLAGS_V1: ClientFeatureFlagsV1 = {
  aggregateV1Enabled: false,
  actionV1Enabled: false,
  handoffV1Enabled: false,
};

/**
 * Run `primary`; if it fails with one of `fallbackKinds` (default: the endpoint
 * is absent/unsupported/unavailable), run `fallback`. Authorization failures
 * (`unauthorized`/`forbidden`/`redacted`) never fall back — they are surfaced.
 */
export async function withClientFallback<T>(
  primary: () => Promise<T>,
  fallback: (err: SoulCoreClientError) => Promise<T>,
  fallbackKinds: ClientErrorKindV1[] = ['not_found', 'version_mismatch', 'unavailable'],
): Promise<T> {
  try {
    return await primary();
  } catch (e) {
    if (e instanceof SoulCoreClientError && fallbackKinds.includes(e.kind)) {
      return fallback(e);
    }
    throw e;
  }
}

/** Gate whether to attempt the v1 aggregate path at all (client-side flag only). */
export function shouldUseAggregateV1(flags: ClientFeatureFlagsV1): boolean {
  return flags.aggregateV1Enabled === true;
}
