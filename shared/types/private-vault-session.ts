/**
 * Private vault v1, the part every surface shares (L8 E4): create or unlock the vault with this device's key, save and read
 * entries, search them locally, and hand one to a model only where that is allowed. A surface supplies three things:
 *
 *   - `PrivateVaultCryptoPortV1`  (AES-256-GCM, HKDF) - WebCrypto on web and desktop; mobile once a library is approved.
 *   - `PrivateVaultDeviceKeyV1`   (how THIS device wraps and unwraps the vault key) - passkey PRF on web, the OS keychain on
 *                                 desktop (the key never leaves Rust), SecureStore on mobile.
 *   - `PrivateVaultApiV1`         (the three routes of `backend/src/modules/private-vault`) - ciphertext in, ciphertext out.
 *
 * The vault key and the decrypted entries live in this object's memory only. `lock()` zeroes the key. Nothing here writes to
 * disk, logs, or sends a title, a body or a search term anywhere.
 */
import {
  PRIVATE_VAULT_MODEL_ROUTES_V1,
  PRIVATE_VAULT_RECOVERY_CHECK_SALT_V1,
  PRIVATE_VAULT_RECOVERY_KEK_SALT_V1,
  privateVaultLocalSearchV1,
  privateVaultMayReachModelV1,
  type PrivateVaultItemKindV1,
  type PrivateVaultItemPutV1,
  type PrivateVaultItemViewV1,
  type PrivateVaultKeySlotPutV1,
  type PrivateVaultKeySlotViewV1,
  type PrivateVaultModelRouteV1,
  type PrivateVaultSlotKindV1,
  type PrivateVaultSurfaceV1,
} from './private-vault';
import {
  PrivateVaultClientErrorV1,
  createPrivateVaultKeyV1,
  openPrivateVaultItemV1,
  sealPrivateVaultItemV1,
  unwrapPrivateVaultKeyV1,
  wrapPrivateVaultKeyV1,
  zeroPrivateVaultBytesV1,
  type PrivateVaultCryptoPortV1,
  type PrivateVaultSlotBindingV1,
} from './private-vault-client';

/** What the owner types. It exists only in memory and inside the ciphertext. */
export interface PrivateVaultEntryV1 {
  title: string;
  body: string;
}

export interface PrivateVaultDeviceKeyV1 {
  readonly slotKind: Exclude<PrivateVaultSlotKindV1, 'recovery_kit'>;
  wrap(binding: PrivateVaultSlotBindingV1, vaultKey: Uint8Array): Promise<PrivateVaultKeySlotPutV1>;
  /** Throws when this device cannot open the slot (another device's slot, a changed key, a tampered slot). */
  unwrap(binding: PrivateVaultSlotBindingV1, slot: PrivateVaultKeySlotViewV1): Promise<Uint8Array>;
  /** True when `slot` was made by this device's key (passkey credential id, keychain account, SecureStore key). */
  owns(slot: PrivateVaultKeySlotViewV1): boolean;
}

export type PrivateVaultPutOutcomeV1 = { ok: true } | { ok: false; reasonCode: 'version_conflict' | 'item_deleted' | 'limit' | 'rejected' };

export interface PrivateVaultApiV1 {
  listItems(): Promise<PrivateVaultItemViewV1[]>;
  getItem(itemId: string): Promise<(PrivateVaultItemPutV1 & { updatedAt: string }) | null>;
  putItem(put: PrivateVaultItemPutV1): Promise<PrivateVaultPutOutcomeV1>;
  deleteItem(itemId: string): Promise<boolean>;
  listSlots(): Promise<PrivateVaultKeySlotViewV1[]>;
  putSlot(slot: PrivateVaultKeySlotPutV1): Promise<boolean>;
}

export type PrivateVaultSessionErrorCodeV1 = 'locked' | 'no_slot_for_this_device' | 'conflict' | 'model_route_not_allowed' | 'not_found' | 'invalid_entry';

export class PrivateVaultSessionErrorV1 extends Error {
  constructor(readonly code: PrivateVaultSessionErrorCodeV1) {
    super(code);
    this.name = 'PrivateVaultSessionErrorV1';
  }
}

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

export function encodePrivateVaultEntryV1(entry: PrivateVaultEntryV1): Uint8Array {
  if (typeof entry?.title !== 'string' || typeof entry?.body !== 'string' || entry.title.length > 200 || entry.body.length > 100_000) {
    throw new PrivateVaultSessionErrorV1('invalid_entry');
  }
  return utf8(JSON.stringify({ v: 1, title: entry.title, body: entry.body }));
}

export function decodePrivateVaultEntryV1(bytes: Uint8Array): PrivateVaultEntryV1 {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (parsed?.v === 1 && typeof parsed.title === 'string' && typeof parsed.body === 'string') return { title: parsed.title, body: parsed.body };
  } catch {
    // falls through
  }
  throw new PrivateVaultSessionErrorV1('invalid_entry');
}

function randomUuid(port: PrivateVaultCryptoPortV1): string {
  const b = port.randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export class PrivateVaultSessionV1 {
  private vaultKey: Uint8Array | null = null;

  constructor(
    private readonly options: {
      ownerUserId: string;
      surface: PrivateVaultSurfaceV1;
      crypto: PrivateVaultCryptoPortV1;
      deviceKey: PrivateVaultDeviceKeyV1;
      api: PrivateVaultApiV1;
    },
  ) {}

  get unlocked(): boolean {
    return this.vaultKey !== null;
  }

  /** Forget the key. Entries already decrypted by the caller are the caller's to drop. */
  lock(): void {
    if (this.vaultKey) zeroPrivateVaultBytesV1(this.vaultKey);
    this.vaultKey = null;
  }

  private key(): Uint8Array {
    if (!this.vaultKey) throw new PrivateVaultSessionErrorV1('locked');
    return this.vaultKey;
  }

  /**
   * Open the vault on this device. First device ever: make the vault key and wrap it for this device. A device that already has
   * a slot unwraps it. A device with no slot of its own cannot open it: adding one needs an already unlocked device
   * (`addThisDevice`) or a recovery kit; there is no server-side way in.
   */
  async openOrCreate(): Promise<'created' | 'unlocked'> {
    const { ownerUserId, deviceKey, api, crypto } = this.options;
    const slots = await api.listSlots();
    if (slots.length === 0) {
      const vaultKey = createPrivateVaultKeyV1(crypto);
      const binding = { ownerUserId, slotId: randomUuid(crypto), slotKind: deviceKey.slotKind };
      try {
        const slot = await deviceKey.wrap(binding, vaultKey);
        if (!(await api.putSlot(slot))) throw new PrivateVaultSessionErrorV1('conflict');
      } catch (error) {
        // the vault key is forgotten if this device could not be given a slot: nothing was stored, nothing is kept
        zeroPrivateVaultBytesV1(vaultKey);
        throw error;
      }
      this.vaultKey = vaultKey;
      return 'created';
    }
    const mine = slots.find((slot) => deviceKey.owns(slot));
    if (!mine) throw new PrivateVaultSessionErrorV1('no_slot_for_this_device');
    this.vaultKey = await deviceKey.unwrap({ ownerUserId, slotId: mine.slotId, slotKind: mine.slotKind }, mine);
    return 'unlocked';
  }

  /**
   * Make a recovery kit: 32 random bytes shown to the owner ONCE (write it down). The vault key is wrapped under a key derived
   * from the kit and stored as a `recovery_kit` slot, which is useless without the kit. Recovery = the Soul Key envelope's
   * recovery slot idea (`soul-key-envelope.ts`); the server never sees the kit.
   */
  async createRecoveryKit(): Promise<string> {
    const { ownerUserId, crypto, api } = this.options;
    const vaultKey = this.key();
    const kit = crypto.randomBytes(32);
    const slotId = randomUuid(crypto);
    const kek = await crypto.hkdfSha256(kit, utf8(PRIVATE_VAULT_RECOVERY_KEK_SALT_V1), utf8(slotId), 32);
    try {
      const slot = await wrapPrivateVaultKeyV1(crypto, kek, { ownerUserId, slotId, slotKind: 'recovery_kit' }, vaultKey);
      if (!(await api.putSlot(slot))) throw new PrivateVaultSessionErrorV1('conflict');
      const check = await crypto.hkdfSha256(kit, utf8(PRIVATE_VAULT_RECOVERY_CHECK_SALT_V1), new Uint8Array(0), 2);
      const hex = Array.from([...kit, ...check], (x) => x.toString(16).padStart(2, '0')).join('');
      return (hex.match(/.{1,4}/g) as string[]).join('-');
    } finally {
      zeroPrivateVaultBytesV1(kek);
      zeroPrivateVaultBytesV1(kit);
    }
  }

  /** On a new device: open the vault with the kit, then give this device a slot of its own. */
  async restoreFromRecoveryKit(kitText: string): Promise<void> {
    const { ownerUserId, crypto, api } = this.options;
    const hex = typeof kitText === 'string' ? kitText.replace(/[\s-]/g, '').toLowerCase() : '';
    if (!/^[0-9a-f]{68}$/.test(hex)) throw new PrivateVaultSessionErrorV1('invalid_entry');
    const bytes = Uint8Array.from(hex.match(/.{2}/g) as string[], (pair) => parseInt(pair, 16));
    const kit = bytes.slice(0, 32);
    const claimed = bytes.slice(32);
    const check = await crypto.hkdfSha256(kit, utf8(PRIVATE_VAULT_RECOVERY_CHECK_SALT_V1), new Uint8Array(0), 2);
    if (check[0] !== claimed[0] || check[1] !== claimed[1]) throw new PrivateVaultSessionErrorV1('invalid_entry');
    const slots = (await api.listSlots()).filter((slot) => slot.slotKind === 'recovery_kit');
    let opened: Uint8Array | null = null;
    for (const slot of slots) {
      const kek = await crypto.hkdfSha256(kit, utf8(PRIVATE_VAULT_RECOVERY_KEK_SALT_V1), utf8(slot.slotId), 32);
      try {
        opened = await unwrapPrivateVaultKeyV1(crypto, kek, { ownerUserId, slotId: slot.slotId, slotKind: 'recovery_kit' }, slot);
        break;
      } catch {
        // not this kit's slot
      } finally {
        zeroPrivateVaultBytesV1(kek);
      }
    }
    zeroPrivateVaultBytesV1(kit);
    if (!opened) throw new PrivateVaultSessionErrorV1('no_slot_for_this_device');
    this.vaultKey = opened;
    await this.addThisDevice();
  }

  /** From an unlocked device: let this device open the vault too (the server also asks for a recent sign-in). */
  async addThisDevice(): Promise<void> {
    const { ownerUserId, deviceKey, api, crypto } = this.options;
    const vaultKey = this.key();
    const slot = await deviceKey.wrap({ ownerUserId, slotId: randomUuid(crypto), slotKind: deviceKey.slotKind }, vaultKey);
    if (!(await api.putSlot(slot))) throw new PrivateVaultSessionErrorV1('conflict');
  }

  async saveEntry(entry: PrivateVaultEntryV1, options: { itemId?: string; kind?: PrivateVaultItemKindV1 } = {}): Promise<{ itemId: string; version: number }> {
    const { ownerUserId, crypto, api } = this.options;
    const vaultKey = this.key();
    const plaintext = encodePrivateVaultEntryV1(entry);
    try {
      let itemId = options.itemId;
      let version = 1;
      let kind: PrivateVaultItemKindV1 = options.kind ?? 'note';
      if (itemId) {
        const current = await api.getItem(itemId);
        if (!current) throw new PrivateVaultSessionErrorV1('not_found');
        version = current.version + 1;
        kind = options.kind ?? current.kind;
      } else {
        itemId = randomUuid(crypto);
      }
      const put = await sealPrivateVaultItemV1(crypto, vaultKey, { ownerUserId, itemId, kind, version }, plaintext);
      const outcome = await api.putItem(put);
      if (outcome.ok === false) throw new PrivateVaultSessionErrorV1('conflict');
      return { itemId, version };
    } finally {
      zeroPrivateVaultBytesV1(plaintext);
    }
  }

  async loadEntry(itemId: string): Promise<PrivateVaultEntryV1> {
    const { ownerUserId, crypto, api } = this.options;
    const vaultKey = this.key();
    const stored = await api.getItem(itemId);
    if (!stored) throw new PrivateVaultSessionErrorV1('not_found');
    const bytes = await openPrivateVaultItemV1(crypto, vaultKey, { ownerUserId, itemId, kind: stored.kind, version: stored.version }, stored);
    try {
      return decodePrivateVaultEntryV1(bytes);
    } finally {
      zeroPrivateVaultBytesV1(bytes);
    }
  }

  async deleteEntry(itemId: string): Promise<void> {
    this.key();
    if (!(await this.options.api.deleteItem(itemId))) throw new PrivateVaultSessionErrorV1('not_found');
  }

  /** Decrypt every entry here and search the text on this device. The query goes nowhere. */
  async search(query: string): Promise<Array<{ itemId: string; title: string }>> {
    this.key();
    const list = await this.options.api.listItems();
    const decrypted: Array<{ itemId: string; title: string; text: string }> = [];
    for (const item of list) {
      try {
        const entry = await this.loadEntry(item.itemId);
        decrypted.push({ itemId: item.itemId, title: entry.title, text: `${entry.title}\n${entry.body}` });
      } catch (error) {
        if (!(error instanceof PrivateVaultClientErrorV1 || error instanceof PrivateVaultSessionErrorV1)) throw error;
        // an entry this key cannot open is skipped, not guessed at
      }
    }
    return privateVaultLocalSearchV1(decrypted, query).map(({ itemId, title }) => ({ itemId, title }));
  }

  /** The only way an entry's text leaves this object towards a model: the desktop, and a model on this computer. */
  async entryForModel(itemId: string, route: PrivateVaultModelRouteV1): Promise<string> {
    if (!(PRIVATE_VAULT_MODEL_ROUTES_V1 as readonly string[]).includes(route) || !privateVaultMayReachModelV1(this.options.surface, route)) {
      throw new PrivateVaultSessionErrorV1('model_route_not_allowed');
    }
    const entry = await this.loadEntry(itemId);
    return `${entry.title}\n${entry.body}`;
  }
}
