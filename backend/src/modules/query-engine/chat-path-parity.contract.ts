import { AGENT_PRESET_SKILLS } from '../skill/agent-preset-skills.config';

export const AGENTRIX_RUNTIME_INTELLIGENCE_TOOL_NAMES = Object.freeze([
  'save_memory',
  'create_subtask',
  'agent_spawn',
  'agent_coordinate',
  'agent_send_message',
  'code_index_workspace',
  'code_search_symbols',
  'code_semantic_search',
  'code_references',
  'code_call_graph',
  'auto_repair_analyze',
  'auto_repair_start_job',
  'auto_repair_request_patch',
  'tool_policy_report',
  'programmatic_tool_plan',
]);

export const AGENTRIX_RUNTIME_TOOL_NAMES = Object.freeze([
  ...AGENT_PRESET_SKILLS.map(skill => skill.handlerName),
  ...AGENTRIX_RUNTIME_INTELLIGENCE_TOOL_NAMES,
]);

export const AGENTRIX_STREAM_EVENT_TYPES = Object.freeze([
  'text_delta',
  'thinking',
  'reasoning',
  'runtime_fallback',
  'context_compaction',
  'tool_start',
  'tool_progress',
  'tool_result',
  'tool_error',
  'approval_required',
  'usage',
  'turn_info',
  'meta',
  'error',
  'done',
]);

export interface ChatPathRuntimeContract {
  path: '/openclaw/proxy/:id/stream' | '/claude/chat';
  toolNames: string[];
  streamEventTypes: string[];
  approvalEvents: string[];
  notes?: string[];
}

export interface ChatPathParityReport {
  canonicalToolNames: string[];
  canonicalStreamEventTypes: string[];
  paths: ChatPathRuntimeContract[];
  missingByPath: Record<string, string[]>;
  extraByPath: Record<string, string[]>;
  isParity: boolean;
}

export function buildCanonicalChatPathContracts(): ChatPathRuntimeContract[] {
  const toolNames = [...AGENTRIX_RUNTIME_TOOL_NAMES].sort();
  const streamEventTypes = [...AGENTRIX_STREAM_EVENT_TYPES].sort();
  return [
    {
      path: '/openclaw/proxy/:id/stream',
      toolNames,
      streamEventTypes,
      approvalEvents: ['approval_required'],
      notes: ['Canonical hosted runtime path.'],
    },
    {
      path: '/claude/chat',
      toolNames,
      streamEventTypes,
      approvalEvents: ['approval_required'],
      notes: ['Compatibility path delegates authenticated requests into the OpenClaw runtime.'],
    },
  ];
}

export function buildChatPathParityReport(
  contracts: ChatPathRuntimeContract[] = buildCanonicalChatPathContracts(),
): ChatPathParityReport {
  const canonicalToolNames = [...AGENTRIX_RUNTIME_TOOL_NAMES].sort();
  const canonicalStreamEventTypes = [...AGENTRIX_STREAM_EVENT_TYPES].sort();
  const missingByPath: Record<string, string[]> = {};
  const extraByPath: Record<string, string[]> = {};

  for (const contract of contracts) {
    const toolSet = new Set(contract.toolNames);
    missingByPath[contract.path] = canonicalToolNames.filter(name => !toolSet.has(name));
    extraByPath[contract.path] = contract.toolNames.filter(name => !canonicalToolNames.includes(name)).sort();
  }

  return {
    canonicalToolNames,
    canonicalStreamEventTypes,
    paths: contracts,
    missingByPath,
    extraByPath,
    isParity: Object.values(missingByPath).every(items => items.length === 0)
      && Object.values(extraByPath).every(items => items.length === 0),
  };
}