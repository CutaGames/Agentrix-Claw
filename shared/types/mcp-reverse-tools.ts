/**
 * shared/types/mcp-reverse-tools — manifest for the 5 platform reverse
 * calls that the LLM can invoke (P-9 wave 13 T16.3).
 *
 * Backend mcp tool registry imports `MCP_REVERSE_TOOLS` and registers
 * each spec as a tool the LLM is allowed to call. Mobile client sees
 * `tool_call` results of these names → routes through
 * `systemAssistantBridge.requestReverseCall(req)` → user approval gate
 * via ApprovalAlertCapsule → Linking.openURL.
 *
 * Naming convention: `system.<verb>` to mirror the spec's reverse-call
 * grouping. Each spec includes JSON schema for parameters so the LLM
 * generates valid args.
 */

export interface McpToolSpec {
  name: string;
  description: string;
  zhDescription: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
  /** Whether the tool fires through user approval (always true for reverse calls). */
  requiresApproval: true;
}

export const MCP_REVERSE_TOOLS: McpToolSpec[] = [
  {
    name: 'system.callPhone',
    description: 'Place a phone call to a number on the user\'s device',
    zhDescription: '让用户的手机拨打一个电话号码',
    inputSchema: {
      type: 'object',
      properties: {
        number: { type: 'string', description: 'E.164 or local format phone number' },
        reason: { type: 'string', description: 'Why we want to call (shown in approval prompt)' },
      },
      required: ['number'],
    },
    requiresApproval: true,
  },
  {
    name: 'system.openMaps',
    description: 'Open the device map app at a specific address',
    zhDescription: '在地图 App 中打开一个地址',
    inputSchema: {
      type: 'object',
      properties: {
        address: { type: 'string', description: 'Free-text address or place name' },
        reason: { type: 'string', description: 'Why we want to open this place' },
      },
      required: ['address'],
    },
    requiresApproval: true,
  },
  {
    name: 'system.smartHome',
    description: 'Trigger a HomeKit / Google Home scene',
    zhDescription: '触发 HomeKit / Google Home 场景',
    inputSchema: {
      type: 'object',
      properties: {
        scene: { type: 'string', description: 'Scene name as the user has it labeled' },
        reason: { type: 'string', description: 'Why this scene' },
      },
      required: ['scene'],
    },
    requiresApproval: true,
  },
  {
    name: 'system.timer',
    description: 'Set a countdown timer in the device clock app',
    zhDescription: '在系统时钟里设置倒计时',
    inputSchema: {
      type: 'object',
      properties: {
        minutes: { type: 'number', description: 'Duration in minutes (1-180)' },
        reason: { type: 'string', description: 'Why this timer' },
      },
      required: ['minutes'],
    },
    requiresApproval: true,
  },
  {
    name: 'system.calendar',
    description: 'Add an event to the user calendar',
    zhDescription: '在系统日历里添加一个日程',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Event title' },
        datetime: { type: 'string', description: 'ISO 8601 datetime' },
        reason: { type: 'string', description: 'Why this event' },
      },
      required: ['title', 'datetime'],
    },
    requiresApproval: true,
  },
];

export const MCP_REVERSE_TOOL_NAMES = MCP_REVERSE_TOOLS.map((t) => t.name);
