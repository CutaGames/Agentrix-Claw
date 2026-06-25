import { Injectable, Logger } from '@nestjs/common';

/**
 * Phone Call (Vapi) integration — P1-#5.
 *
 * Wraps the Vapi REST API (https://docs.vapi.ai/api-reference/calls/create-call).
 * Env:
 *   VAPI_API_KEY        — required for live calls (degrades to stub mode if absent)
 *   VAPI_PHONE_NUMBER_ID — Vapi-managed sender number to dial out from
 *   VAPI_DEFAULT_ASSISTANT_ID — optional preset assistant
 *
 * If VAPI_API_KEY is unset, the service returns a deterministic stub call so the
 * tool can still be wired into chat flows in dev / on private deployments.
 */

export interface PhoneCallInput {
  to: string;
  /** Inline assistant config (overrides assistantId if both given) */
  assistant?: {
    firstMessage?: string;
    systemPrompt?: string;
    voiceId?: string;
    model?: string;
  };
  /** Pre-created Vapi assistant id */
  assistantId?: string;
  /** Optional metadata logged with the call */
  metadata?: Record<string, unknown>;
  /** Override sender phoneNumberId (default: VAPI_PHONE_NUMBER_ID) */
  phoneNumberId?: string;
}

export interface PhoneCallResult {
  callId: string;
  status: 'queued' | 'ringing' | 'in-progress' | 'ended' | 'stub';
  to: string;
  startedAt: number;
  vapiResponse?: unknown;
  stub?: boolean;
  reason?: string;
}

@Injectable()
export class PhoneCallService {
  private readonly logger = new Logger(PhoneCallService.name);

  private get apiKey(): string | undefined {
    return process.env.VAPI_API_KEY;
  }

  private get defaultPhoneNumberId(): string | undefined {
    return process.env.VAPI_PHONE_NUMBER_ID;
  }

  private get defaultAssistantId(): string | undefined {
    return process.env.VAPI_DEFAULT_ASSISTANT_ID;
  }

  isLiveMode(): boolean {
    return Boolean(this.apiKey && this.defaultPhoneNumberId);
  }

  async place(input: PhoneCallInput): Promise<PhoneCallResult> {
    if (!input.to || !/^\+?[0-9\-()\s]{6,20}$/.test(input.to)) {
      throw new Error('invalid "to" number — must be E.164 (e.g. +14155552671)');
    }
    const startedAt = Date.now();

    if (!this.isLiveMode()) {
      this.logger.warn(`stub call to ${input.to} (VAPI_API_KEY/VAPI_PHONE_NUMBER_ID missing)`);
      return {
        callId: `stub_${startedAt}`,
        status: 'stub',
        to: input.to,
        startedAt,
        stub: true,
        reason: 'VAPI credentials not configured — stub mode',
      };
    }

    const phoneNumberId = input.phoneNumberId ?? this.defaultPhoneNumberId!;
    const assistantId = input.assistantId ?? this.defaultAssistantId;

    const body: Record<string, unknown> = {
      phoneNumberId,
      customer: { number: input.to },
      metadata: input.metadata ?? {},
    };
    if (assistantId) {
      body.assistantId = assistantId;
    } else if (input.assistant) {
      body.assistant = {
        firstMessage: input.assistant.firstMessage,
        model: {
          provider: 'openai',
          model: input.assistant.model ?? 'gpt-4o-mini',
          messages: input.assistant.systemPrompt
            ? [{ role: 'system', content: input.assistant.systemPrompt }]
            : undefined,
        },
        voice: {
          provider: '11labs',
          voiceId: input.assistant.voiceId ?? 'rachel',
        },
      };
    } else {
      throw new Error('either assistantId or assistant config is required in live mode');
    }

    const res = await fetch('https://api.vapi.ai/call', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Vapi API ${res.status}: ${text.slice(0, 300)}`);
    }
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`Vapi API returned non-JSON: ${text.slice(0, 200)}`);
    }
    return {
      callId: parsed.id ?? `vapi_${startedAt}`,
      status: (parsed.status as PhoneCallResult['status']) ?? 'queued',
      to: input.to,
      startedAt,
      vapiResponse: parsed,
    };
  }

  /** Fetch current status of a previously-placed call (live mode only). */
  async getStatus(callId: string): Promise<{ status: string; raw?: unknown; stub?: boolean }> {
    if (!this.isLiveMode() || callId.startsWith('stub_')) {
      return { status: 'stub', stub: true };
    }
    const res = await fetch(`https://api.vapi.ai/call/${encodeURIComponent(callId)}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) throw new Error(`Vapi getStatus ${res.status}`);
    const parsed = await res.json();
    return { status: parsed.status ?? 'unknown', raw: parsed };
  }
}
