/**
 * Agentrix Tool Registry — Core Interfaces
 * 
 * Inspired by Claude Code's declarative buildTool() factory pattern.
 * Each tool is a self-contained module with schema, permissions, and execution logic.
 */
import { z, ZodSchema, ZodType } from 'zod';

// ============================================================
// Tool Categories
// ============================================================

export enum ToolCategory {
  COMMERCE = 'commerce',
  SKILL = 'skill',
  WALLET = 'wallet',
  TASK = 'task',
  AGENT = 'agent',
  SYSTEM = 'system',
  DESKTOP = 'desktop',
  MCP = 'mcp',
}

// ============================================================
// Permission Types
// ============================================================

export type PermissionBehavior = 'allow' | 'deny' | 'ask';

export interface PermissionResult {
  behavior: PermissionBehavior;
  reason?: string;
  updatedInput?: any;
}

// ============================================================
// Tool Context (passed to every tool execution)
// ============================================================

export interface ToolContext {
  userId: string;
  sessionId: string;
  agentId?: string;
  instanceId?: string;
  model?: string;
  parentToolCallId?: string;
  abortSignal?: AbortSignal;
  /** Extra metadata from the calling environment */
  metadata?: Record<string, any>;
}

// ============================================================
// Tool Result
// ============================================================

export interface ToolResult<TOutput = any> {
  success: boolean;
  data?: TOutput;
  error?: string;
  /** Execution time in ms */
  durationMs?: number;
  /** Token cost for paid skills */
  billingInfo?: {
    amount: number;
    currency: string;
    paymentId?: string;
  };
}

// ============================================================
// Tool Progress (for streaming progress to frontend)
// ============================================================

export type ToolProgressCallback = (progress: ToolProgress) => void;

export interface ToolProgress {
  toolCallId: string;
  type: 'status' | 'partial_result' | 'log';
  data: string;
}

// ============================================================
// Core Tool Interface
// ============================================================

export interface AgentrixTool<TInput = any, TOutput = any> {
  // === Identity ===
  readonly name: string;
  readonly category: ToolCategory;
  readonly description: string;

  // === Schema ===
  readonly inputSchema: ZodSchema<TInput>;

  // === Behavioral Markers ===
  /** Read-only tools can execute concurrently */
  readonly isReadOnly: boolean;
  /** Can this tool run in parallel with other concurrent-safe tools? */
  readonly isConcurrencySafe: boolean;
  /** Does execution require payment? */
  readonly requiresPayment: boolean;
  /** Risk level for desktop approval: 0=safe, 1=low, 2=medium, 3=high */
  readonly riskLevel: 0 | 1 | 2 | 3;

  // === Execution ===
  execute(
    input: TInput,
    ctx: ToolContext,
    onProgress?: ToolProgressCallback,
  ): Promise<ToolResult<TOutput>>;

  // === Permissions (optional override) ===
  checkPermissions?(input: TInput, ctx: ToolContext): Promise<PermissionResult>;

  // === Optional: LLM prompt hint ===
  prompt?(): string;

  // === Optional: max result chars before truncation ===
  maxResultChars?: number;
}

// ============================================================
// Tool Definition (used by buildTool factory)
// ============================================================

export interface ToolDefinition<TInput = any, TOutput = any> {
  name: string;
  category: ToolCategory;
  description: string;
  inputSchema: ZodSchema<TInput>;

  // Behavioral — all default to safe values
  isReadOnly?: boolean;
  isConcurrencySafe?: boolean;
  requiresPayment?: boolean;
  riskLevel?: 0 | 1 | 2 | 3;

  execute(
    input: TInput,
    ctx: ToolContext,
    onProgress?: ToolProgressCallback,
  ): Promise<ToolResult<TOutput>>;

  checkPermissions?(input: TInput, ctx: ToolContext): Promise<PermissionResult>;
  prompt?(): string;
  maxResultChars?: number;
}

// ============================================================
// buildTool() factory — fills safe defaults
// ============================================================

export function buildTool<TInput, TOutput>(
  def: ToolDefinition<TInput, TOutput>,
): AgentrixTool<TInput, TOutput> {
  return {
    name: def.name,
    category: def.category,
    description: def.description,
    inputSchema: def.inputSchema,

    // Fail-closed defaults
    isReadOnly: def.isReadOnly ?? false,
    isConcurrencySafe: def.isConcurrencySafe ?? false,
    requiresPayment: def.requiresPayment ?? false,
    riskLevel: def.riskLevel ?? 0,

    execute: def.execute,
    checkPermissions: def.checkPermissions,
    prompt: def.prompt,
    maxResultChars: def.maxResultChars ?? 4000,
  };
}

// ============================================================
// Provider-specific schema adapter types
// ============================================================

export type LLMProvider = 'claude' | 'openai' | 'gemini' | 'bedrock';

export interface LLMToolSchema {
  provider: LLMProvider;
  schema: any;
}
