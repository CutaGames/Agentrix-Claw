/**
 * sheetRefRegistry — module-scope holders for the global BottomSheet
 * imperative APIs that the P-9 CompanionLayer mounts.
 *
 * Why a registry instead of context:
 *   - The companion ball, capsules, and any non-React caller (deep-link
 *     handlers, intent dispatcher, push notification handlers) all need
 *     to call `present()` on these sheets. A React Context would need a
 *     hook in every such call site, but ours include `apiFetch` callbacks
 *     and `Linking.addEventListener` which are not inside the render tree.
 *   - The layer mounts exactly once and lives forever. Registry is set
 *     in CompanionLayer's effect and read by everyone else.
 *   - Each sheet's component is the source of truth for its imperative
 *     handle; the registry just stores a forwarded ref.
 *
 * Spec: design.md §Components/Core 1 (CompanionLayer orchestrator).
 */

export interface ConversationBubbleHandle {
  present: (opts?: ConversationBubblePresentOpts) => void;
  dismiss: () => void;
  expandToFull: () => void;
}

export interface ConversationBubblePresentOpts {
  /** Default true on single-tap; auto-activates voice listening. */
  autoActivateVoice?: boolean;
  /** Pre-launch the camera (right-swipe gesture). */
  autoOpenCamera?: boolean;
  /** Pre-fill the prompt (e.g. "这是什么?" after photo). */
  initialPrompt?: string;
  /** Pre-attached images, e.g. from right-swipe shot. */
  attachments?: Array<{ uri: string; kind: 'image' | 'audio' }>;
}

export interface PetDetailSheetHandle {
  present: () => void;
  dismiss: () => void;
  expandSection: (section: PetDetailSection) => void;
}

export type PetDetailSection =
  | 'wallet'
  | 'skills'
  | 'cross-device'
  | 'companion-actions'
  | 'co-raising'
  | 'settings';

export interface Trust3SigningSheetHandle {
  present: (request: Trust3SignRequest) => void;
  dismiss: () => void;
}

export interface Trust3SignRequest {
  signRequestId: string;
  reason:
    | 'wallet-transfer'
    | 'marketplace-purchase'
    | 'skill-install'
    | 'remote-control'
    | 'approval'
    | 'agentic-commerce-overlimit';
  metadata: {
    petId?: string;
    summary?: {
      from?: string;
      to?: string;
      amount?: string;
      gas?: string;
    };
    risk?: 'L0' | 'L1' | 'L2' | 'L3';
    riskExplanationZh?: string;
    riskExplanationEn?: string;
    [key: string]: unknown;
  };
  /** Total countdown in milliseconds (default 60_000). */
  timeoutMs?: number;
  /** Optional callback once the user successfully signs (sheet still dismisses by itself). */
  onConfirm?: (signature: string) => void | Promise<void>;
  /** Optional callback when user cancels or sheet times out. */
  onCancel?: (reason: 'user' | 'timeout' | 'error') => void;
}

interface RegistryEntry<T> {
  current: T | null;
}

export const conversationBubbleRef: RegistryEntry<ConversationBubbleHandle> = {
  current: null,
};

export const petDetailSheetRef: RegistryEntry<PetDetailSheetHandle> = {
  current: null,
};

export const trust3SigningSheetRef: RegistryEntry<Trust3SigningSheetHandle> = {
  current: null,
};

// ─── P-9 wave 9 — SkillInstallCard ───────────────────────────────────────

export interface SkillInstallPresentOpts {
  skillId?: string;
  /** Free-text name, used when skillId can't be resolved upfront. */
  name?: string;
  description?: string;
  developer?: string;
  version?: string;
  permissions?: string[];
  priceUsd?: number;
}

export interface SkillInstallCardHandle {
  present: (opts: SkillInstallPresentOpts) => void;
  dismiss: () => void;
}

export const skillInstallCardRef: RegistryEntry<SkillInstallCardHandle> = {
  current: null,
};

/** Imperative shortcut — guarded so test/non-mounted call sites are no-ops. */
export const companionSheets = {
  conversation: {
    present(opts?: ConversationBubblePresentOpts): void {
      conversationBubbleRef.current?.present(opts);
    },
    dismiss(): void {
      conversationBubbleRef.current?.dismiss();
    },
    expandToFull(): void {
      conversationBubbleRef.current?.expandToFull();
    },
  },
  petDetail: {
    present(): void {
      petDetailSheetRef.current?.present();
    },
    dismiss(): void {
      petDetailSheetRef.current?.dismiss();
    },
    expandSection(section: PetDetailSection): void {
      petDetailSheetRef.current?.expandSection(section);
    },
  },
  trust3: {
    present(req: Trust3SignRequest): void {
      trust3SigningSheetRef.current?.present(req);
    },
    dismiss(): void {
      trust3SigningSheetRef.current?.dismiss();
    },
  },
  skillInstall: {
    present(opts: SkillInstallPresentOpts): void {
      skillInstallCardRef.current?.present(opts);
    },
    dismiss(): void {
      skillInstallCardRef.current?.dismiss();
    },
  },
};
