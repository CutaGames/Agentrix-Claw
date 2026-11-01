/**
 * Private vault v1 over HTTP (L8 E4): the three routes of `backend/src/modules/private-vault` as a `PrivateVaultApiV1`.
 * Web, desktop and mobile pass their own `HttpTransportV1`; the paths and the body decoding are the same everywhere.
 * Only ciphertext goes out and comes back. A response that does not decode is an error, never a guess.
 */
import type { HttpTransportV1 } from '../client/transport';
import {
  PRIVATE_VAULT_SCHEMA_VERSION_V1,
  decodePrivateVaultItemPutV1,
  decodePrivateVaultKeySlotPutV1,
  type PrivateVaultItemViewV1,
  type PrivateVaultKeySlotViewV1,
} from './private-vault';
import type { PrivateVaultApiV1, PrivateVaultPutOutcomeV1 } from './private-vault-session';

export const PRIVATE_VAULT_ROUTES_V1 = {
  items: '/private-vault/items',
  slots: '/private-vault/slots',
} as const;

export class PrivateVaultHttpErrorV1 extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
  ) {
    super(`private_vault_http_${status}${code ? `_${code}` : ''}`);
    this.name = 'PrivateVaultHttpErrorV1';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const codeOf = (body: unknown): string | null => {
  if (!isRecord(body)) return null;
  const value = body.code ?? body.error;
  return typeof value === 'string' ? value : null;
};

export function createPrivateVaultHttpApiV1(options: {
  transport: HttpTransportV1;
  /** Includes no trailing slash, e.g. `https://api.agentrix.top`. */
  baseUrl: string;
  getAuthToken: () => string | undefined | Promise<string | undefined>;
}): PrivateVaultApiV1 {
  const base = options.baseUrl.replace(/\/+$/, '');

  async function call(method: 'GET' | 'PUT' | 'DELETE', path: string, body?: unknown) {
    const token = await options.getAuthToken();
    return options.transport.request({
      method,
      path: `${base}${path}`,
      headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body }),
    });
  }

  return {
    async listItems() {
      const response = await call('GET', PRIVATE_VAULT_ROUTES_V1.items);
      if (response.status !== 200) throw new PrivateVaultHttpErrorV1(response.status, codeOf(response.body));
      const list = isRecord(response.body) ? response.body.items : null;
      if (!Array.isArray(list)) throw new PrivateVaultHttpErrorV1(200, 'unreadable');
      return list as PrivateVaultItemViewV1[];
    },

    async getItem(itemId) {
      const response = await call('GET', `${PRIVATE_VAULT_ROUTES_V1.items}/${encodeURIComponent(itemId)}`);
      if (response.status === 404) return null;
      if (response.status !== 200) throw new PrivateVaultHttpErrorV1(response.status, codeOf(response.body));
      if (!isRecord(response.body) || typeof response.body.updatedAt !== 'string') throw new PrivateVaultHttpErrorV1(200, 'unreadable');
      const { updatedAt, ...put } = response.body;
      const decoded = decodePrivateVaultItemPutV1(put);
      if (decoded.ok === false) throw new PrivateVaultHttpErrorV1(200, 'unreadable');
      return { ...decoded.value, updatedAt: updatedAt as string };
    },

    async putItem(put): Promise<PrivateVaultPutOutcomeV1> {
      const response = await call('PUT', `${PRIVATE_VAULT_ROUTES_V1.items}/${encodeURIComponent(put.itemId)}`, put);
      if (response.status === 200) return { ok: true };
      if (response.status === 400) return { ok: false, reasonCode: 'rejected' };
      if (response.status === 409) {
        const body = isRecord(response.body) ? response.body : {};
        if (body.error === 'PrivateVaultItemLimit') return { ok: false, reasonCode: 'limit' };
        return { ok: false, reasonCode: body.reasonCode === 'item_deleted' ? 'item_deleted' : 'version_conflict' };
      }
      throw new PrivateVaultHttpErrorV1(response.status, codeOf(response.body));
    },

    async deleteItem(itemId) {
      const response = await call('DELETE', `${PRIVATE_VAULT_ROUTES_V1.items}/${encodeURIComponent(itemId)}`);
      if (response.status === 204 || response.status === 200) return true;
      if (response.status === 404) return false;
      throw new PrivateVaultHttpErrorV1(response.status, codeOf(response.body));
    },

    async listSlots() {
      const response = await call('GET', PRIVATE_VAULT_ROUTES_V1.slots);
      if (response.status !== 200) throw new PrivateVaultHttpErrorV1(response.status, codeOf(response.body));
      const list = isRecord(response.body) ? response.body.slots : null;
      if (!Array.isArray(list)) throw new PrivateVaultHttpErrorV1(200, 'unreadable');
      const slots: PrivateVaultKeySlotViewV1[] = [];
      for (const raw of list) {
        if (!isRecord(raw) || typeof raw.createdAt !== 'string') throw new PrivateVaultHttpErrorV1(200, 'unreadable');
        const { createdAt, ...slot } = raw;
        const decoded = decodePrivateVaultKeySlotPutV1({ ...slot, schemaVersion: PRIVATE_VAULT_SCHEMA_VERSION_V1 });
        if (decoded.ok === false) throw new PrivateVaultHttpErrorV1(200, 'unreadable');
        slots.push({ ...decoded.value, createdAt });
      }
      return slots;
    },

    async putSlot(slot) {
      const response = await call('PUT', `${PRIVATE_VAULT_ROUTES_V1.slots}/${encodeURIComponent(slot.slotId)}`, slot);
      if (response.status === 200) return true;
      // 403 is the server asking for a recent sign-in (STEP_UP_REQUIRED): the caller shows that prompt.
      if (response.status === 403 || response.status === 400) throw new PrivateVaultHttpErrorV1(response.status, codeOf(response.body));
      if (response.status === 409) return false;
      throw new PrivateVaultHttpErrorV1(response.status, codeOf(response.body));
    },
  };
}
