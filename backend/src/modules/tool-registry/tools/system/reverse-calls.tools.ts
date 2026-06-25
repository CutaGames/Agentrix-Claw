/**
 * 5 reverse-call MCP tools for the P-9 Companion (T16.3 backend half).
 *
 * Each tool returns "approval-pending" instead of actually invoking the
 * platform intent — that's the mobile client's job. The LLM sees the
 * pending result and waits for user confirmation; mobile-side
 * `systemAssistantBridge.requestReverseCall` runs the approval gate
 * and finally calls `Linking.openURL`. When the user accepts/rejects,
 * a follow-up tool call (`system.report_reverse_result` if we ever add
 * it) or natural conversation feeds the outcome back to the LLM.
 *
 * Phase 1 simplification: backend doesn't track per-call approval state.
 * The "pending" response carries enough context that the LLM can decide
 * whether to retry / abandon based on subsequent user messages.
 *
 * Spec: requirements.md R9.7-R9.10, design.md §Components/Core 6.
 */
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  AgentrixTool,
  ToolCategory,
  ToolContext,
  ToolResult,
} from '../../interfaces';
import { RegisterTool } from '../../decorators/register-tool.decorator';

// ─── system.callPhone ────────────────────────────────────────────────

const callPhoneSchema = z.object({
  number: z.string().min(3).max(40).describe('Phone number (E.164 or local format)'),
  reason: z.string().max(200).optional().describe('Why we want to call (shown in approval prompt)'),
});
type CallPhoneInput = z.infer<typeof callPhoneSchema>;

@RegisterTool()
@Injectable()
export class SystemCallPhoneTool implements AgentrixTool<CallPhoneInput> {
  readonly name = 'system.callPhone';
  readonly category = ToolCategory.SYSTEM;
  readonly description = 'Place a phone call on the user\'s mobile device. Surfaces an in-app approval card; user must accept before the call dials.';
  readonly inputSchema = callPhoneSchema;
  readonly isReadOnly = false;
  readonly isConcurrencySafe = false;
  readonly requiresPayment = false;
  readonly riskLevel = 2 as const;

  async execute(input: CallPhoneInput, _ctx: ToolContext): Promise<ToolResult> {
    return {
      success: true,
      data: {
        status: 'approval-pending',
        platform: 'mobile.callPhone',
        promptZh: `让你的手机拨打 ${input.number}${input.reason ? ` (${input.reason})` : ''}`,
        args: { number: input.number, reason: input.reason },
      },
    };
  }

  prompt(): string {
    return '让用户的手机拨打一个电话号码。会先弹审批卡,用户同意后才真正拨号。';
  }
}

// ─── system.openMaps ─────────────────────────────────────────────────

const openMapsSchema = z.object({
  address: z.string().min(1).max(300).describe('Free-text address or place name'),
  reason: z.string().max(200).optional(),
});
type OpenMapsInput = z.infer<typeof openMapsSchema>;

@RegisterTool()
@Injectable()
export class SystemOpenMapsTool implements AgentrixTool<OpenMapsInput> {
  readonly name = 'system.openMaps';
  readonly category = ToolCategory.SYSTEM;
  readonly description = 'Open the user\'s map app at a specific address. Surfaces an in-app approval card.';
  readonly inputSchema = openMapsSchema;
  readonly isReadOnly = false;
  readonly isConcurrencySafe = false;
  readonly requiresPayment = false;
  readonly riskLevel = 1 as const;

  async execute(input: OpenMapsInput, _ctx: ToolContext): Promise<ToolResult> {
    return {
      success: true,
      data: {
        status: 'approval-pending',
        platform: 'mobile.openMaps',
        promptZh: `在地图里打开「${input.address}」`,
        args: input,
      },
    };
  }

  prompt(): string {
    return '在用户的地图 App 中打开一个地址。';
  }
}

// ─── system.smartHome ────────────────────────────────────────────────

const smartHomeSchema = z.object({
  scene: z.string().min(1).max(120).describe('Scene name as the user has it labeled'),
  reason: z.string().max(200).optional(),
});
type SmartHomeInput = z.infer<typeof smartHomeSchema>;

@RegisterTool()
@Injectable()
export class SystemSmartHomeTool implements AgentrixTool<SmartHomeInput> {
  readonly name = 'system.smartHome';
  readonly category = ToolCategory.SYSTEM;
  readonly description = 'Trigger a HomeKit / Google Home scene. Surfaces an in-app approval card.';
  readonly inputSchema = smartHomeSchema;
  readonly isReadOnly = false;
  readonly isConcurrencySafe = false;
  readonly requiresPayment = false;
  readonly riskLevel = 2 as const;

  async execute(input: SmartHomeInput, _ctx: ToolContext): Promise<ToolResult> {
    return {
      success: true,
      data: {
        status: 'approval-pending',
        platform: 'mobile.smartHome',
        promptZh: `执行场景「${input.scene}」`,
        args: input,
      },
    };
  }

  prompt(): string {
    return '触发 HomeKit / Google Home 场景。';
  }
}

// ─── system.timer ────────────────────────────────────────────────────

const timerSchema = z.object({
  minutes: z.number().min(1).max(180).describe('Duration in minutes (1-180)'),
  reason: z.string().max(200).optional(),
});
type TimerInput = z.infer<typeof timerSchema>;

@RegisterTool()
@Injectable()
export class SystemTimerTool implements AgentrixTool<TimerInput> {
  readonly name = 'system.timer';
  readonly category = ToolCategory.SYSTEM;
  readonly description = 'Set a countdown timer in the device clock app.';
  readonly inputSchema = timerSchema;
  readonly isReadOnly = false;
  readonly isConcurrencySafe = false;
  readonly requiresPayment = false;
  readonly riskLevel = 0 as const;

  async execute(input: TimerInput, _ctx: ToolContext): Promise<ToolResult> {
    return {
      success: true,
      data: {
        status: 'approval-pending',
        platform: 'mobile.timer',
        promptZh: `设置 ${input.minutes} 分钟倒计时`,
        args: input,
      },
    };
  }

  prompt(): string {
    return '在系统时钟里设置倒计时。';
  }
}

// ─── system.calendar ─────────────────────────────────────────────────

const calendarSchema = z.object({
  title: z.string().min(1).max(200).describe('Event title'),
  datetime: z.string().describe('ISO 8601 datetime'),
  reason: z.string().max(200).optional(),
});
type CalendarInput = z.infer<typeof calendarSchema>;

@RegisterTool()
@Injectable()
export class SystemCalendarTool implements AgentrixTool<CalendarInput> {
  readonly name = 'system.calendar';
  readonly category = ToolCategory.SYSTEM;
  readonly description = 'Add an event to the user calendar.';
  readonly inputSchema = calendarSchema;
  readonly isReadOnly = false;
  readonly isConcurrencySafe = false;
  readonly requiresPayment = false;
  readonly riskLevel = 1 as const;

  async execute(input: CalendarInput, _ctx: ToolContext): Promise<ToolResult> {
    return {
      success: true,
      data: {
        status: 'approval-pending',
        platform: 'mobile.calendar',
        promptZh: `添加日程「${input.title}」 (${input.datetime})`,
        args: input,
      },
    };
  }

  prompt(): string {
    return '在系统日历里添加一个日程。';
  }
}
