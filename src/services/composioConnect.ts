/**
 * Connected apps on the phone (A9 / M1; contract `shared/types/composio-connect.ts` v0). Off unless the build sets
 * `EXPO_PUBLIC_COMPOSIO_CONNECT=1`; the routes answer 404 while the server switch `COMPOSIO_CONNECT_V0_ENABLED` is off.
 *
 * - List / connect / refresh / disconnect over `COMPOSIO_CONNECT_ROUTES_V0` with the owner's own token.
 * - Connect returns Composio's own page; the shared decoder refuses any other host, so the phone never opens a page the
 *   server did not mean. The screen opens it in the in-app browser and, once that closes, asks the server to re-check
 *   the connection (`refresh`) — the browser comes back to the web, not to the app.
 * No React Native import: the transport and token are injected.
 */
import type { HttpResponseV1, HttpTransportV1 } from '../../shared/client/transport';
import {
  COMPOSIO_CONNECT_REF_PATTERN_V0,
  COMPOSIO_CONNECT_TOOLKITS_V0,
  decodeComposioConnectInitiateResultV0,
  decodeComposioConnectionListV0,
  decodeComposioConnectionViewV0,
  type ComposioConnectInitiateResultV0,
  type ComposioConnectionListV0,
  type ComposioConnectionViewV0,
  type ComposioToolkitV0,
} from '../../shared/types/composio-connect';

export function composioConnectMobileEnabled(value: unknown): boolean {
  return value === '1';
}

// Read as a literal member expression so the Expo build inlines it.
export const COMPOSIO_CONNECT_MOBILE_ENABLED = composioConnectMobileEnabled(process.env.EXPO_PUBLIC_COMPOSIO_CONNECT);

export const COMPOSIO_TOOLKIT_COPY: Readonly<Record<ComposioToolkitV0, { zh: string; en: string }>> = {
  gmail: { zh: 'Gmail', en: 'Gmail' },
  googlecalendar: { zh: 'Google 日历', en: 'Google Calendar' },
  notion: { zh: 'Notion', en: 'Notion' },
  github: { zh: 'GitHub', en: 'GitHub' },
};

export type ComposioConnectFailureV0 = 'not_allowed' | 'not_found' | 'already_connected' | 'busy' | 'not_configured' | 'unreadable' | 'unavailable' | 'no_session';

export class ComposioConnectError extends Error {
  readonly failure: ComposioConnectFailureV0;
  constructor(failure: ComposioConnectFailureV0) {
    super(failure);
    this.name = 'ComposioConnectError';
    this.failure = failure;
  }
}

export const COMPOSIO_CONNECT_FAILURE_COPY: Readonly<Record<ComposioConnectFailureV0, { zh: string; en: string }>> = {
  not_allowed: { zh: '请重新登录后再试。', en: 'Sign in again and retry.' },
  not_found: { zh: '找不到这个连接。', en: 'That connection was not found.' },
  already_connected: { zh: '这个应用已经连着了。', en: 'That app is already connected.' },
  busy: { zh: '没完成的连接太多，先完成或断开一个。', en: 'Too many unfinished connections. Finish or disconnect one first.' },
  not_configured: { zh: '服务端还没配好这个应用。', en: 'This app is not set up on the server yet.' },
  unreadable: { zh: '读不懂服务器的回答，请更新 App。', en: 'Could not read the answer. Update the app.' },
  unavailable: { zh: '暂时连不上，请稍后再试。', en: 'Unavailable right now. Try again shortly.' },
  no_session: { zh: '请先登录。', en: 'Please sign in first.' },
};

export interface MobileComposioConnectClientV0 {
  list(): Promise<ComposioConnectionListV0>;
  connect(toolkit: ComposioToolkitV0): Promise<ComposioConnectInitiateResultV0>;
  refresh(connectionRef: string): Promise<ComposioConnectionViewV0>;
  disconnect(connectionRef: string): Promise<ComposioConnectionViewV0>;
}

function failureOf(status: number, code: unknown): ComposioConnectFailureV0 {
  if (status === 401 || status === 403) return 'not_allowed';
  if (status === 404) return 'not_found';
  if (status === 409) return 'already_connected';
  if (status === 429) return 'busy';
  if (status === 503 && code === 'COMPOSIO_CONNECT_NOT_CONFIGURED') return 'not_configured';
  return 'unavailable';
}

export function createMobileComposioConnectClient(deps: { transport: HttpTransportV1; baseUrl: string; token: () => string | null | undefined }): MobileComposioConnectClientV0 {
  const base = deps.baseUrl.replace(/\/+$/, '');
  const call = async (method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<unknown> => {
    const token = deps.token();
    if (!token) throw new ComposioConnectError('no_session');
    let response: HttpResponseV1;
    try {
      response = await deps.transport.request({
        method,
        path: `${base}${path}`,
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-Agentrix-Surface': 'mobile' },
        ...(body === undefined ? {} : { body }),
      });
    } catch {
      throw new ComposioConnectError('unavailable');
    }
    if (response.status < 200 || response.status >= 300) {
      throw new ComposioConnectError(failureOf(response.status, (response.body as { code?: unknown } | null)?.code));
    }
    return response.body;
  };
  const decoded = <T>(value: T | null): T => {
    if (value === null) throw new ComposioConnectError('unreadable');
    return value;
  };
  const ref = (connectionRef: string) => {
    if (!COMPOSIO_CONNECT_REF_PATTERN_V0.test(connectionRef)) throw new ComposioConnectError('not_found');
    return connectionRef;
  };
  return {
    async list() {
      return decoded(decodeComposioConnectionListV0(await call('GET', '/composio-connect/connections')));
    },
    async connect(toolkit) {
      if (!(COMPOSIO_CONNECT_TOOLKITS_V0 as readonly string[]).includes(toolkit)) throw new ComposioConnectError('not_found');
      const result = decoded(decodeComposioConnectInitiateResultV0(await call('POST', '/composio-connect/connections', { toolkit })));
      if (result.toolkit !== toolkit) throw new ComposioConnectError('unreadable');
      return result;
    },
    async refresh(connectionRef) {
      const view = decoded(decodeComposioConnectionViewV0(await call('POST', `/composio-connect/connections/${ref(connectionRef)}/refresh`, {})));
      if (view.connectionRef !== connectionRef) throw new ComposioConnectError('unreadable');
      return view;
    },
    async disconnect(connectionRef) {
      const view = decoded(decodeComposioConnectionViewV0(await call('DELETE', `/composio-connect/connections/${ref(connectionRef)}`)));
      if (view.connectionRef !== connectionRef) throw new ComposioConnectError('unreadable');
      return view;
    },
  };
}
