import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StrategyGraph } from './entities/strategy-graph.entity';
import { StrategyNode } from './entities/strategy-node.entity';
import { IntentRecognitionResult } from './intent-engine.service';
import { LiquidityMeshService } from '../liquidity/liquidity-mesh.service';
import { StrategyPermissionEngine } from '../agent-authorization/strategy-permission-engine.service';

/**
 * 策略图服务
 * 将意图转换为策略树（Strategy Graph）
 */
@Injectable()
export class StrategyGraphService {
  private readonly logger = new Logger(StrategyGraphService.name);

  constructor(
    @InjectRepository(StrategyGraph)
    private strategyGraphRepository: Repository<StrategyGraph>,
    @InjectRepository(StrategyNode)
    private strategyNodeRepository: Repository<StrategyNode>,
    private liquidityMeshService: LiquidityMeshService,
    private strategyPermissionEngine: StrategyPermissionEngine,
  ) {}

  /**
   * 从意图创建策略图
   */
  async createStrategyGraph(
    intent: IntentRecognitionResult,
    userId: string,
    agentId?: string,
  ): Promise<StrategyGraph> {
    this.logger.log(`创建策略图: intent=${intent.intent}, agentId=${agentId}`);

    // 1. 创建策略图
    const strategyGraph = await this.strategyGraphRepository.save({
      userId,
      agentId,
      intentText: '', // 从IntentRecord获取
      strategyType: intent.intent as any,
      status: 'active',
      config: this.buildConfig(intent),
    });

    // 2. 创建策略节点
    const nodes = await this.buildNodes(strategyGraph.id, intent);
    await this.strategyNodeRepository.save(nodes);

    // 3. 重新加载策略图以包含节点
    const graphWithNodes = await this.strategyGraphRepository.findOne({
      where: { id: strategyGraph.id },
      relations: ['nodes'],
    });

    if (!graphWithNodes) {
      throw new Error('Failed to load strategy graph with nodes');
    }

    // 4. ⭐ 权限检查：如果提供了agentId，检查Agent是否有权限执行此策略
    if (agentId) {
      const amount = intent.entities.amount || 0;
      const fromToken = intent.entities.fromToken || '';
      const toToken = intent.entities.toToken || '';
      
      // 从配置中获取DEX名称（如果有）
      const dexName = graphWithNodes.config?.liquidityRouting?.allowedDEXs?.[0];

      const permission = await this.strategyPermissionEngine.checkPermission(
        agentId,
        graphWithNodes,
        {
          amount,
          tokenAddress: toToken || fromToken,
          dexName,
        },
      );

      if (!permission.allowed) {
        this.logger.warn(
          `权限检查失败: agentId=${agentId}, reason=${permission.reason}`,
        );
        // 更新策略图状态为拒绝
        await this.strategyGraphRepository.update(graphWithNodes.id, {
          status: 'rejected',
        });
        throw new ForbiddenException(
          `权限检查失败: ${permission.reason}`,
        );
      }

      this.logger.log(`权限检查通过: agentId=${agentId}`);
    }

    return graphWithNodes;
  }

  /**
   * 构建策略配置
   */
  private buildConfig(intent: IntentRecognitionResult): StrategyGraph['config'] {
    const config: StrategyGraph['config'] = {};

    // 时间触发器
    if (intent.entities.frequency) {
      config.timeTrigger = {
        type: intent.entities.frequency === 'daily' ? 'daily' :
              intent.entities.frequency === 'weekly' ? 'weekly' :
              intent.entities.frequency === 'monthly' ? 'monthly' : 'custom',
        schedule: this.frequencyToCron(intent.entities.frequency),
      };
    }

    // 风险限制
    if (intent.entities.amount || intent.entities.percentage) {
      config.riskLimits = {
        maxAmount: intent.entities.amount || 10000,
        maxDrawdown: 10, // 默认最大回撤10%
      };
    }

    // 流动性路由
    config.liquidityRouting = {
      allowedDEXs: ['Jupiter', 'Uniswap'],
      allowedCEXs: [],
      preferDEX: true,
    };

    // 执行参数
    config.executionParams = {
      slippage: 0.5, // 默认0.5%滑点
    };

    return config;
  }

  /**
   * 构建策略节点
   */
  private async buildNodes(
    strategyGraphId: string,
    intent: IntentRecognitionResult,
  ): Promise<StrategyNode[]> {
    const nodes: StrategyNode[] = [];
    let order = 0;

    // 1. 时间触发器节点（如果有）
    if (intent.entities.frequency) {
      nodes.push({
        id: undefined,
        strategyGraphId,
        nodeType: 'trigger',
        nodeConfig: {
          schedule: this.frequencyToCron(intent.entities.frequency),
        },
        executionOrder: order++,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as StrategyNode);
    }

    // 2. 市场监控器节点
    if (intent.entities.toToken) {
      nodes.push({
        id: undefined,
        strategyGraphId,
        nodeType: 'monitor',
        nodeConfig: {
          tokenPair: `${intent.entities.fromToken || 'USDC'}/${intent.entities.toToken}`,
          threshold: {
            priceChange: 1, // 价格变化1%触发
          },
        },
        executionOrder: order++,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as StrategyNode);
    }

    // 3. 风险检查节点
    nodes.push({
      id: undefined,
      strategyGraphId,
      nodeType: 'risk',
      nodeConfig: {
        maxAmount: intent.entities.amount || 10000,
        maxDrawdown: 10,
      },
      executionOrder: order++,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as StrategyNode);

    // 4. 流动性路由节点
    nodes.push({
      id: undefined,
      strategyGraphId,
      nodeType: 'router',
      nodeConfig: {
        allowedDEXs: ['Jupiter', 'Uniswap'],
        allowedCEXs: [],
      },
      executionOrder: order++,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as StrategyNode);

    // 5. 执行器节点
    nodes.push({
      id: undefined,
      strategyGraphId,
      nodeType: 'executor',
      nodeConfig: {
        action: 'swap',
        params: {
          fromToken: intent.entities.fromToken || 'USDC',
          toToken: intent.entities.toToken || 'BTC',
          amount: intent.entities.amount,
          percentage: intent.entities.percentage,
        },
      },
      executionOrder: order++,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as StrategyNode);

    return nodes;
  }

  /**
   * 频率转换为Cron表达式
   */
  private frequencyToCron(frequency?: string): string {
    switch (frequency) {
      case 'daily':
        return '0 0 * * *'; // 每天0点
      case 'weekly':
        return '0 0 * * 0'; // 每周日0点
      case 'monthly':
        return '0 0 1 * *'; // 每月1号0点
      default:
        return '0 0 * * *'; // 默认每天
    }
  }

  /**
   * 执行策略图
   */
  async executeStrategyGraph(strategyGraphId: string): Promise<void> {
    this.logger.log(`执行策略图: ${strategyGraphId}`);

    const graph = await this.strategyGraphRepository.findOne({
      where: { id: strategyGraphId },
      relations: ['nodes'],
    });

    if (!graph) {
      throw new Error('Strategy graph not found');
    }

    // 按执行顺序排序节点
    const nodes = graph.nodes.sort((a, b) => a.executionOrder - b.executionOrder);

    // 依次执行每个节点
    for (const node of nodes) {
      await this.executeNode(node);
    }
  }

  /**
   * 执行单个节点
   */
  private async executeNode(node: StrategyNode): Promise<void> {
    this.logger.log(`执行节点: ${node.nodeType}`);

    // 更新节点状态
    await this.strategyNodeRepository.update(node.id, { status: 'running' });

    try {
      switch (node.nodeType) {
        case 'trigger':
          // 检查触发条件
          // TODO: 实现定时任务检查
          break;

        case 'monitor':
          // 检查市场条件
          // TODO: 实现市场监控
          break;

        case 'risk':
          // 检查风险限制
          // TODO: 实现风险检查
          break;

        case 'router':
          // 选择最优路由
          // TODO: 调用LiquidityMeshService获取最优路由
          break;

        case 'executor':
          // 执行交易
          if (node.nodeConfig.action === 'swap' && node.nodeConfig.params) {
            const params = node.nodeConfig.params;
            // 获取策略图的agentId（如果有）
            const graph = await this.strategyGraphRepository.findOne({
              where: { id: node.strategyGraphId },
            });
            const agentId = graph?.agentId;

            // ⭐ 调用LiquidityMeshService执行交换（传递agentId进行权限检查）
            await this.liquidityMeshService.executeSwap(
              {
                fromToken: params.fromToken,
                toToken: params.toToken,
                amount: params.amount?.toString() || '0',
                chain: 'ethereum', // TODO: 从配置获取
                walletAddress: '', // TODO: 从用户获取
              },
              agentId, // ⭐ 传递agentId进行权限检查
            );
          }
          break;
      }

      await this.strategyNodeRepository.update(node.id, { status: 'completed' });
    } catch (error: any) {
      this.logger.error(`节点执行失败: ${error.message}`, error.stack);
      await this.strategyNodeRepository.update(node.id, {
        status: 'failed',
      });
      throw error;
    }
  }
}

