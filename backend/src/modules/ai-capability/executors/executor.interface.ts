/**
 * 能力执行器接口
 */

import { ExecutionContext, ExecutionResult } from '../interfaces/capability.interface';

export interface ICapabilityExecutor {
  /**
   * 执行器名称
   */
  name: string;

  /**
   * 执行能力
   */
  execute(params: Record<string, any>, context: ExecutionContext): Promise<ExecutionResult>;
}


