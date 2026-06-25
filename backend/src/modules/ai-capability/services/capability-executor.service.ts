import { Injectable, Logger } from '@nestjs/common';
import { ICapabilityExecutor } from '../executors/executor.interface';
import { BuyItemExecutor } from '../executors/buy-item.executor';
import { BookServiceExecutor } from '../executors/book-service.executor';
import { MintNFTExecutor } from '../executors/mint-nft.executor';
import { SearchProductsExecutor } from '../executors/search-products.executor';
import { PriceComparisonExecutor } from '../executors/price-comparison.executor';
import { AirdropExecutor } from '../executors/airdrop.executor';
import { AutoEarnExecutor } from '../executors/auto-earn.executor';
import { AgentAuthExecutor } from '../executors/agent-auth.executor';
import { AtomicSettlementExecutor } from '../executors/atomic-settlement.executor';
import { BestExecutionExecutor } from '../executors/best-execution.executor';
import { IntentStrategyExecutor } from '../executors/intent-strategy.executor';
import { ExecutionContext, ExecutionResult, CapabilityType } from '../interfaces/capability.interface';

@Injectable()
export class CapabilityExecutorService {
  private readonly logger = new Logger(CapabilityExecutorService.name);
  private executors: Map<string, ICapabilityExecutor> = new Map();

  constructor(
    private buyItemExecutor: BuyItemExecutor,
    private bookServiceExecutor: BookServiceExecutor,
    private mintNFTExecutor: MintNFTExecutor,
    private searchProductsExecutor: SearchProductsExecutor,
    private priceComparisonExecutor: PriceComparisonExecutor,
    private airdropExecutor: AirdropExecutor,
    private autoEarnExecutor: AutoEarnExecutor,
    private agentAuthExecutor: AgentAuthExecutor,
    private atomicSettlementExecutor: AtomicSettlementExecutor,
    private bestExecutionExecutor: BestExecutionExecutor,
    private intentStrategyExecutor: IntentStrategyExecutor,
  ) {
    // 注册所有执行器
    this.executors.set('executor_purchase', buyItemExecutor);
    this.executors.set('executor_book', bookServiceExecutor);
    this.executors.set('executor_mint', mintNFTExecutor);
    this.executors.set('executor_search', searchProductsExecutor);
    this.executors.set('executor_compare', priceComparisonExecutor);
    
    // 注册个人Agent能力执行器
    this.executors.set('executor_airdrop', airdropExecutor);
    this.executors.set('executor_autoearn', autoEarnExecutor);
    
    // 注册Phase2功能执行器
    this.executors.set('executor_agent_auth', agentAuthExecutor);
    this.executors.set('executor_atomic_settlement', atomicSettlementExecutor);
    this.executors.set('executor_best_execution', bestExecutionExecutor);
    this.executors.set('executor_intent_strategy', intentStrategyExecutor);
  }

  /**
   * 执行能力
   */
  async execute(
    executorName: string,
    params: Record<string, any>,
    context: ExecutionContext,
  ): Promise<ExecutionResult> {
    const executor = this.executors.get(executorName);

    if (!executor) {
      this.logger.error(`Executor not found: ${executorName}`);
      return {
        success: false,
        error: 'EXECUTOR_NOT_FOUND',
        message: `执行器不存在：${executorName}`,
      };
    }

    try {
      return await executor.execute(params, context);
    } catch (error: any) {
      this.logger.error(`Execution failed: ${error.message}`, error.stack);
      return {
        success: false,
        error: 'EXECUTION_ERROR',
        message: `执行失败：${error.message}`,
      };
    }
  }

  /**
   * 根据能力类型获取执行器名称
   */
  getExecutorName(capabilityType: CapabilityType): string {
    const mapping: Record<CapabilityType, string> = {
      purchase: 'executor_purchase',
      book: 'executor_book',
      mint: 'executor_mint',
      execute: 'executor_execute',
      query: 'executor_query',
    };
    return mapping[capabilityType] || 'executor_purchase';
  }

  /**
   * 根据系统能力ID获取执行器名称
   * 用于系统级能力（如 search_products, compare_prices）
   */
  getExecutorNameBySystemCapabilityId(capabilityId: string): string | null {
    const mapping: Record<string, string> = {
      'search_products': 'executor_search',
      'compare_prices': 'executor_compare',
      'add_to_cart': 'executor_cart',
      'checkout_cart': 'executor_checkout',
      'view_cart': 'executor_cart',
      'pay_order': 'executor_payment',
      'track_logistics': 'executor_logistics',
      // 个人Agent能力
      'discover_airdrops': 'executor_airdrop',
      'get_airdrops': 'executor_airdrop',
      'check_airdrop_eligibility': 'executor_airdrop',
      'claim_airdrop': 'executor_airdrop',
      'get_auto_earn_tasks': 'executor_autoearn',
      'execute_auto_earn_task': 'executor_autoearn',
      'get_auto_earn_stats': 'executor_autoearn',
      'toggle_auto_earn_strategy': 'executor_autoearn',
      // Phase2功能能力
      'create_agent_authorization': 'executor_agent_auth',
      'get_agent_authorization': 'executor_agent_auth',
      'update_agent_authorization': 'executor_agent_auth',
      'create_atomic_settlement': 'executor_atomic_settlement',
      'execute_atomic_settlement': 'executor_atomic_settlement',
      'get_atomic_settlement_status': 'executor_atomic_settlement',
      'get_best_execution': 'executor_best_execution',
      'execute_best_swap': 'executor_best_execution',
      'create_intent_strategy': 'executor_intent_strategy',
      'get_strategy_status': 'executor_intent_strategy',
    };
    return mapping[capabilityId] || null;
  }
}


