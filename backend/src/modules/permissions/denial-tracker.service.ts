/**
 * Denial Tracker Service
 *
 * Tracks tool call denials per agent. When an agent hits too many
 * consecutive or total denials, falls back to prompting the LLM
 * to find alternative approaches instead of repeatedly hitting
 * permission walls.
 *
 * Reference: Claude Code's denialTracking pattern.
 */
import { Injectable, Logger } from '@nestjs/common';

interface DenialState {
  consecutive: number;
  total: number;
  lastDeniedTool?: string;
  lastDeniedAt?: number;
}

const CONSECUTIVE_THRESHOLD = 3;
const TOTAL_THRESHOLD = 20;

@Injectable()
export class DenialTrackerService {
  private readonly logger = new Logger(DenialTrackerService.name);
  private readonly state = new Map<string, DenialState>();

  /**
   * Record a tool call denial.
   */
  recordDenial(agentId: string, toolName: string): void {
    const s = this.state.get(agentId) || { consecutive: 0, total: 0 };
    s.consecutive++;
    s.total++;
    s.lastDeniedTool = toolName;
    s.lastDeniedAt = Date.now();
    this.state.set(agentId, s);

    if (s.consecutive >= CONSECUTIVE_THRESHOLD) {
      this.logger.warn(
        `Agent ${agentId} hit ${s.consecutive} consecutive denials (last: ${toolName})`,
      );
    }
  }

  /**
   * Record a successful tool execution (resets consecutive counter).
   */
  recordSuccess(agentId: string): void {
    const s = this.state.get(agentId);
    if (s) s.consecutive = 0;
  }

  /**
   * Check if the agent should fall back to prompting.
   * Returns a denial summary message if yes, null if no.
   */
  shouldFallbackToPrompting(agentId: string): string | null {
    const s = this.state.get(agentId);
    if (!s) return null;

    if (s.consecutive >= CONSECUTIVE_THRESHOLD) {
      return (
        `You have been denied ${s.consecutive} consecutive tool calls (last: ${s.lastDeniedTool}). ` +
        `Please try a different approach or ask the user for guidance instead of repeating denied actions.`
      );
    }

    if (s.total >= TOTAL_THRESHOLD) {
      return (
        `You have accumulated ${s.total} total tool call denials in this session. ` +
        `Consider asking the user to adjust permissions or take a different approach.`
      );
    }

    return null;
  }

  /**
   * Get denial stats for an agent.
   */
  getStats(agentId: string): DenialState | null {
    return this.state.get(agentId) || null;
  }

  /**
   * Reset denial tracking for an agent (e.g. on session end).
   */
  reset(agentId: string): void {
    this.state.delete(agentId);
  }

  /**
   * Reset all tracking (e.g. on service restart).
   */
  resetAll(): void {
    this.state.clear();
  }
}
