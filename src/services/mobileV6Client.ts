import {
  ActionHttpClientV1,
  AuthorityHttpClientV1,
  SoulCoreAggregateClient,
  SoulCoreClientError,
  TaskProofHttpClientV1,
  type ActionClientV1,
  type AuthorityClientV1,
  type ClientContextV1,
  type HttpTransportV1,
  type TaskProofClientV1,
} from '../../shared/client';
import type { SoulCoreAggregateV1 } from '../../shared/types/soul-core-aggregate';
import type { SoulCoreRefV1 } from '../../shared/types/soul-core';
import type {
  ActionAuthorizationPreviewV1,
  ActionTaskListV1,
  ActionTaskV1,
  ActionTransitionLogEntryV1,
  TaskProofRecordV1,
} from '../../shared/types/action-runtime';
import {
  readMobileResource,
  type MobileReadState,
  type MobileResourceReadOptions,
} from './mobileReadState';

export interface MobileV6SharedClientSet {
  soulCore: SoulCoreAggregateClient;
  actions: ActionClientV1;
  authority: AuthorityClientV1;
  taskProof: TaskProofClientV1;
}

export type MobileV6QueryOptions<T> = Omit<MobileResourceReadOptions<T>, 'capability'>;

function assertSoulCoreScope(expectedSoulCoreId: string, actualSoulCoreId: string): void {
  if (actualSoulCoreId === expectedSoulCoreId) return;
  throw new SoulCoreClientError({
    kind: 'forbidden',
    message: 'Action response is outside the selected Soul Core scope',
    retryable: false,
    code: 'MOBILE_AGENT_SCOPE_MISMATCH',
  });
}

/**
 * Build shared typed clients from the single platform transport seam. Auth,
 * base URL, schema negotiation and normalized errors stay owned by shared/client.
 */
export function createMobileV6SharedClientSet(
  transport: HttpTransportV1,
  context: ClientContextV1,
): MobileV6SharedClientSet {
  return {
    soulCore: new SoulCoreAggregateClient(transport, context),
    actions: new ActionHttpClientV1(transport, context),
    authority: new AuthorityHttpClientV1(transport, context),
    taskProof: new TaskProofHttpClientV1(transport, context),
  };
}

/**
 * Mobile-only read facade. It composes shared clients into explicit view states
 * but never derives identity, settlement, verification, reputation or assurance.
 */
export class MobileV6QueryFacade {
  constructor(private readonly clients: MobileV6SharedClientSet) {}

  listSoulCoreRefs(
    options: MobileV6QueryOptions<SoulCoreRefV1[]> = {},
  ): Promise<MobileReadState<SoulCoreRefV1[]>> {
    return readMobileResource(
      () => this.clients.soulCore.listRefs(),
      { capability: 'soul_core.directory_v1', ...options },
    );
  }

  getSoulCoreAggregate(
    soulCoreId: string,
    options: MobileV6QueryOptions<SoulCoreAggregateV1> = {},
  ): Promise<MobileReadState<SoulCoreAggregateV1>> {
    return readMobileResource(
      () => this.clients.soulCore.getAggregate(soulCoreId),
      { capability: 'soul_core.aggregate_v1', ...options },
    );
  }

  listActions(
    soulCoreId: string,
    options: MobileV6QueryOptions<ActionTaskListV1> = {},
  ): Promise<MobileReadState<ActionTaskListV1>> {
    return readMobileResource(
      async () => {
        const result = await this.clients.actions.listTasks(soulCoreId);
        result.items.forEach((task) => assertSoulCoreScope(soulCoreId, task.lifecycle.soulCoreId));
        return result;
      },
      { capability: 'action.list_v1', ...options },
    );
  }

  getAction(
    soulCoreId: string,
    actionId: string,
    options: MobileV6QueryOptions<ActionTaskV1> = {},
  ): Promise<MobileReadState<ActionTaskV1>> {
    return readMobileResource(
      async () => {
        const result = await this.clients.actions.getTask(soulCoreId, actionId);
        assertSoulCoreScope(soulCoreId, result.lifecycle.soulCoreId);
        return result;
      },
      { capability: 'action.detail_v1', ...options },
    );
  }

  getActionTimeline(
    soulCoreId: string,
    actionId: string,
    options: MobileV6QueryOptions<ActionTransitionLogEntryV1[]> = {},
  ): Promise<MobileReadState<ActionTransitionLogEntryV1[]>> {
    return readMobileResource(
      () => this.clients.actions.getTimeline(soulCoreId, actionId),
      { capability: 'action.timeline_v1', ...options },
    );
  }

  getAuthorizationPreview(
    soulCoreId: string,
    actionId: string,
    options: MobileV6QueryOptions<ActionAuthorizationPreviewV1> = {},
  ): Promise<MobileReadState<ActionAuthorizationPreviewV1>> {
    return readMobileResource(
      async () => {
        const result = await this.clients.authority.getPreview(soulCoreId, actionId);
        assertSoulCoreScope(soulCoreId, result.soulCoreId);
        return result;
      },
      { capability: 'authority.preview_v1', ...options },
    );
  }

  getTaskProof(
    taskProofId: string,
    options: MobileV6QueryOptions<TaskProofRecordV1> = {},
  ): Promise<MobileReadState<TaskProofRecordV1>> {
    return readMobileResource(
      () => this.clients.taskProof.getRecord(taskProofId),
      { capability: 'task_proof.record_v1', ...options },
    );
  }
}
