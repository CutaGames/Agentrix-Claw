/**
 * GlassHUDController — Manage text and notification display on AI glass HUD.
 *
 * Handles:
 * - Agent response text → HUD display (monochrome / AR overlay)
 * - Notification push (battery, status, alerts)
 * - Layout management (line wrapping, pagination for limited displays)
 * - Vendor-specific HUD capability adaptation
 *
 * BLE Write flow:  Phone → GATT HUD Characteristic (0xAGX4) → Glass HUD
 */

import { BleManager } from 'react-native-ble-plx';
import { Buffer } from 'buffer';

// ── GATT UUIDs ─────────────────────────────────────────

/** Agentrix Glass Service UUID */
const GLASS_SERVICE_UUID = '0000AGX0-0000-1000-8000-00805F9B34FB';
/** HUD text push characteristic (Write — phone → glass) */
const HUD_TEXT_CHAR_UUID = '0000AGX4-0000-1000-8000-00805F9B34FB';

// ── Types ──────────────────────────────────────────────

export type HudDisplayMode = 'monochrome' | 'ar_overlay' | 'text_only';

export interface HudCapabilities {
  maxCharsPerLine: number;
  maxLines: number;
  supportsEmoji: boolean;
  displayMode: HudDisplayMode;
  refreshRateHz: number;
}

export type HudMessageType = 'agent_response' | 'notification' | 'status' | 'translation' | 'navigation' | 'approval';

export interface HudMessage {
  type: HudMessageType;
  text: string;
  /** Priority 0 (lowest) - 3 (highest). Higher priority messages preempt lower. */
  priority: number;
  /** Duration to display in ms. 0 = until next message. */
  durationMs: number;
  /** Optional icon prefix (single emoji) */
  icon?: string;
}

export interface HudControllerCallbacks {
  onDisplayUpdate?: (text: string) => void;
  onError?: (error: Error) => void;
  onQueueChange?: (queueLength: number) => void;
}

// ── Default capabilities per vendor ────────────────────

const VENDOR_HUD_CAPS: Record<string, HudCapabilities> = {
  'even-g1': {
    maxCharsPerLine: 30,
    maxLines: 3,
    supportsEmoji: false,
    displayMode: 'monochrome',
    refreshRateHz: 15,
  },
  'xreal-air2': {
    maxCharsPerLine: 60,
    maxLines: 5,
    supportsEmoji: true,
    displayMode: 'ar_overlay',
    refreshRateHz: 60,
  },
  'default': {
    maxCharsPerLine: 24,
    maxLines: 2,
    supportsEmoji: false,
    displayMode: 'text_only',
    refreshRateHz: 10,
  },
};

// ── Service ────────────────────────────────────────────

export class GlassHUDController {
  private bleManager: BleManager;
  private deviceId: string;
  private serviceUuid: string;
  private hudCharUuid: string;
  private capabilities: HudCapabilities;
  private callbacks: HudControllerCallbacks;

  private messageQueue: HudMessage[] = [];
  private currentMessage: HudMessage | null = null;
  private displayTimer: ReturnType<typeof setTimeout> | null = null;
  private active = false;

  constructor(
    bleManager: BleManager,
    deviceId: string,
    options?: {
      vendorKey?: string;
      serviceUuid?: string;
      hudCharUuid?: string;
      callbacks?: HudControllerCallbacks;
    },
  ) {
    this.bleManager = bleManager;
    this.deviceId = deviceId;
    this.serviceUuid = options?.serviceUuid ?? GLASS_SERVICE_UUID;
    this.hudCharUuid = options?.hudCharUuid ?? HUD_TEXT_CHAR_UUID;
    this.capabilities = VENDOR_HUD_CAPS[options?.vendorKey ?? 'default'] ?? VENDOR_HUD_CAPS['default'];
    this.callbacks = options?.callbacks ?? {};
  }

  /** Start the HUD controller. Must be called before sending messages. */
  start(): void {
    this.active = true;
  }

  /** Stop the HUD controller and clear the display. */
  async stop(): Promise<void> {
    this.active = false;
    if (this.displayTimer) {
      clearTimeout(this.displayTimer);
      this.displayTimer = null;
    }
    this.messageQueue = [];
    this.currentMessage = null;
    await this.writeClear();
  }

  /** Get current HUD capabilities for this device. */
  getCapabilities(): HudCapabilities {
    return { ...this.capabilities };
  }

  /** Override capabilities (e.g. after discovering actual device specs). */
  setCapabilities(caps: Partial<HudCapabilities>): void {
    this.capabilities = { ...this.capabilities, ...caps };
  }

  // ── Public API ────────────────────────────────────────

  /**
   * Display an agent response on the HUD.
   * Long text is automatically paginated for small displays.
   */
  async showAgentResponse(text: string): Promise<void> {
    await this.enqueue({
      type: 'agent_response',
      text,
      priority: 1,
      durationMs: Math.max(3000, text.length * 80), // ~80ms per char reading time
    });
  }

  /**
   * Display a notification (battery, status, etc.).
   */
  async showNotification(text: string, icon?: string): Promise<void> {
    await this.enqueue({
      type: 'notification',
      text,
      priority: 0,
      durationMs: 3000,
      icon,
    });
  }

  /**
   * Display a real-time translation result.
   */
  async showTranslation(text: string): Promise<void> {
    await this.enqueue({
      type: 'translation',
      text,
      priority: 2,
      durationMs: Math.max(4000, text.length * 100),
      icon: '🌐',
    });
  }

  /**
   * Display an approval request (e.g. payment confirmation).
   */
  async showApprovalRequest(description: string, amount?: string): Promise<void> {
    const displayText = amount ? `${description}\n${amount}` : description;
    await this.enqueue({
      type: 'approval',
      text: displayText,
      priority: 3, // highest — preempts everything
      durationMs: 15000,
      icon: '💳',
    });
  }

  /**
   * Display navigation instruction.
   */
  async showNavigation(instruction: string): Promise<void> {
    await this.enqueue({
      type: 'navigation',
      text: instruction,
      priority: 2,
      durationMs: 5000,
      icon: '🧭',
    });
  }

  /**
   * Clear the HUD display immediately.
   */
  async clear(): Promise<void> {
    if (this.displayTimer) {
      clearTimeout(this.displayTimer);
      this.displayTimer = null;
    }
    this.currentMessage = null;
    await this.writeClear();
  }

  // ── Queue management ──────────────────────────────────

  private async enqueue(message: HudMessage): Promise<void> {
    if (!this.active) return;

    // If higher priority than current, preempt
    if (this.currentMessage && message.priority > this.currentMessage.priority) {
      if (this.displayTimer) {
        clearTimeout(this.displayTimer);
        this.displayTimer = null;
      }
      // Push current back to queue if it has remaining time
      this.messageQueue.unshift(this.currentMessage);
    }

    // Insert in priority order
    const insertIdx = this.messageQueue.findIndex((m) => m.priority < message.priority);
    if (insertIdx === -1) {
      this.messageQueue.push(message);
    } else {
      this.messageQueue.splice(insertIdx, 0, message);
    }

    this.callbacks.onQueueChange?.(this.messageQueue.length);

    // If nothing currently displayed, start display
    if (!this.currentMessage) {
      await this.displayNext();
    } else if (message.priority > this.currentMessage.priority) {
      await this.displayNext();
    }
  }

  private async displayNext(): Promise<void> {
    if (this.messageQueue.length === 0) {
      this.currentMessage = null;
      return;
    }

    this.currentMessage = this.messageQueue.shift()!;
    this.callbacks.onQueueChange?.(this.messageQueue.length);

    const pages = this.paginateText(this.currentMessage.text, this.currentMessage.icon);

    for (let i = 0; i < pages.length; i++) {
      if (!this.active) return;

      await this.writeText(pages[i]);
      this.callbacks.onDisplayUpdate?.(pages[i]);

      if (i < pages.length - 1) {
        // Wait proportional to page content
        const pageDelay = Math.max(2000, pages[i].length * 80);
        await this.delay(pageDelay);
      }
    }

    // Set timer for message duration
    if (this.currentMessage.durationMs > 0) {
      this.displayTimer = setTimeout(() => {
        this.displayTimer = null;
        this.currentMessage = null;
        void this.displayNext();
      }, this.currentMessage.durationMs / Math.max(pages.length, 1));
    }
  }

  // ── Text layout / pagination ──────────────────────────

  private paginateText(text: string, icon?: string): string[] {
    const { maxCharsPerLine, maxLines, supportsEmoji } = this.capabilities;

    // Strip emoji if display doesn't support them
    let processedText = text;
    if (!supportsEmoji) {
      processedText = text.replace(/[\u{1F600}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');
    }

    // Add icon prefix
    if (icon && supportsEmoji) {
      processedText = `${icon} ${processedText}`;
    }

    // Word wrap into lines
    const lines = this.wordWrap(processedText, maxCharsPerLine);

    // Paginate into pages of maxLines
    const pages: string[] = [];
    for (let i = 0; i < lines.length; i += maxLines) {
      const pageLines = lines.slice(i, i + maxLines);
      pages.push(pageLines.join('\n'));
    }

    return pages.length > 0 ? pages : [''];
  }

  private wordWrap(text: string, maxWidth: number): string[] {
    const inputLines = text.split('\n');
    const result: string[] = [];

    for (const line of inputLines) {
      if (line.length <= maxWidth) {
        result.push(line);
        continue;
      }

      // Word-wrap long lines
      const words = line.split(/\s+/);
      let currentLine = '';

      for (const word of words) {
        if (currentLine.length === 0) {
          currentLine = word.slice(0, maxWidth);
        } else if (currentLine.length + 1 + word.length <= maxWidth) {
          currentLine += ' ' + word;
        } else {
          result.push(currentLine);
          currentLine = word.slice(0, maxWidth);
        }
      }

      if (currentLine.length > 0) {
        result.push(currentLine);
      }
    }

    return result;
  }

  // ── BLE Write helpers ─────────────────────────────────

  private async writeText(text: string): Promise<void> {
    try {
      // BLE GATT max payload ≈ 244 bytes. Truncate if needed.
      const truncated = text.slice(0, 200);
      const b64 = Buffer.from(truncated, 'utf-8').toString('base64');

      await this.bleManager.writeCharacteristicWithResponseForDevice(
        this.deviceId,
        this.serviceUuid,
        this.hudCharUuid,
        b64,
      );
    } catch (error) {
      this.callbacks.onError?.(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  private async writeClear(): Promise<void> {
    try {
      const b64 = Buffer.from('\0', 'utf-8').toString('base64');
      await this.bleManager.writeCharacteristicWithResponseForDevice(
        this.deviceId,
        this.serviceUuid,
        this.hudCharUuid,
        b64,
      );
    } catch {
      // Ignore clear errors (device may already be disconnected)
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
