import { Injectable, Logger } from '@nestjs/common';
import { ICapabilityExecutor } from './executor.interface';
import { ExecutionContext, ExecutionResult } from '../interfaces/capability.interface';
import { AgentAuthorizationService } from '../../agent-authorization/agent-authorization.service';
import { CreateAgentAuthorizationDto } from '../../agent-authorization/dto/create-agent-authorization.dto';

/**
 * Agent授权能力执行器
 * 处理Agent授权的创建、查询、更新等操作
 */
@Injectable()
export class AgentAuthExecutor implements ICapabilityExecutor {
  readonly name = 'AgentAuthExecutor';
  private readonly logger = new Logger(AgentAuthExecutor.name);

  constructor(
    private readonly agentAuthorizationService: AgentAuthorizationService,
  ) {}

  async execute(
    params: Record<string, any>,
    context: ExecutionContext,
  ): Promise<ExecutionResult> {
    const userId = context.userId;
    if (!userId) {
      return {
        success: false,
        error: 'MISSING_USER_ID',
        message: '用户ID不能为空',
      };
    }

    const capabilityId = context.capabilityId || params.capabilityId;
    if (!capabilityId) {
      return {
        success: false,
        error: 'MISSING_CAPABILITY_ID',
        message: '能力ID不能为空',
      };
    }

    try {
      switch (capabilityId) {
        case 'create_agent_authorization':
          return await this.createAuthorization(params, userId);
        case 'get_agent_authorization':
          return await this.getAuthorization(params, userId);
        case 'update_agent_authorization':
          return await this.updateAuthorization(params, userId);
        default:
          return {
            success: false,
            error: 'UNKNOWN_CAPABILITY',
            message: `未知的Agent授权能力: ${capabilityId}`,
          };
      }
    } catch (error: any) {
      this.logger.error(`Agent授权执行失败: ${error.message}`, error.stack);
      return {
        success: false,
        error: 'EXECUTION_ERROR',
        message: `执行失败: ${error.message}`,
      };
    }
  }

  /**
   * 创建Agent授权
   */
  private async createAuthorization(
    params: Record<string, any>,
    userId: string,
  ): Promise<ExecutionResult> {
    const { agentId, authorizationType, singleLimit, dailyLimit, allowedStrategies, walletAddress } = params;

    if (!agentId || !authorizationType || !walletAddress) {
      return {
        success: false,
        error: 'MISSING_REQUIRED_PARAMS',
        message: '缺少必需参数：agentId, authorizationType, walletAddress',
      };
    }

    const dto: CreateAgentAuthorizationDto = {
      agentId,
      userId,
      walletAddress,
      authorizationType,
      singleLimit,
      dailyLimit,
      allowedStrategies: allowedStrategies || [],
    };

    const authorization = await this.agentAuthorizationService.createAgentAuthorization(dto);

    return {
      success: true,
      data: {
        authorizationId: authorization.id,
        agentId: authorization.agentId,
        authorizationType: authorization.authorizationType,
        singleLimit: authorization.singleLimit,
        dailyLimit: authorization.dailyLimit,
        isActive: authorization.isActive,
        message: 'Agent授权创建成功',
      },
    };
  }

  /**
   * 查询Agent授权
   */
  private async getAuthorization(
    params: Record<string, any>,
    userId: string,
  ): Promise<ExecutionResult> {
    const { agentId } = params;

    if (!agentId) {
      return {
        success: false,
        error: 'MISSING_AGENT_ID',
        message: '缺少必需参数：agentId',
      };
    }

    const authorization = await this.agentAuthorizationService.getActiveAuthorization(agentId);

    if (!authorization) {
      return {
        success: false,
        error: 'AUTHORIZATION_NOT_FOUND',
        message: '未找到激活的授权',
      };
    }

    return {
      success: true,
      data: {
        authorizationId: authorization.id,
        agentId: authorization.agentId,
        authorizationType: authorization.authorizationType,
        singleLimit: authorization.singleLimit,
        dailyLimit: authorization.dailyLimit,
        isActive: authorization.isActive,
        strategyPermissions: authorization.strategyPermissions || [],
        message: '获取授权信息成功',
      },
    };
  }

  /**
   * 更新Agent授权
   */
  private async updateAuthorization(
    params: Record<string, any>,
    userId: string,
  ): Promise<ExecutionResult> {
    const { authorizationId, singleLimit, dailyLimit, strategyPermissions } = params;

    if (!authorizationId) {
      return {
        success: false,
        error: 'MISSING_AUTHORIZATION_ID',
        message: '缺少必需参数：authorizationId',
      };
    }

    // TODO: 实现更新授权的方法
    // const authorization = await this.agentAuthorizationService.updateAuthorization(
    //   authorizationId,
    //   { singleLimit, dailyLimit, strategyPermissions }
    // );

    return {
      success: false,
      error: 'NOT_IMPLEMENTED',
      message: '更新授权功能待实现',
    };
  }
}

