/**
 * Skill Onboarding Controller
 * 
 * 五大用户画像的入驻API端点
 */

import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Get,
  Query,
  Param,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OnboardingService, OnboardingDto } from './onboarding.service';
import { SkillService } from './skill.service';

// 内存存储会话（生产环境应使用 Redis 或数据库）
const onboardingSessions: Map<string, any> = new Map();

@ApiTags('Skill Onboarding')
@Controller('onboarding')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OnboardingController {
  constructor(
    private readonly onboardingService: OnboardingService,
    private readonly skillService: SkillService,
  ) {}

  /**
   * 开始新的入驻流程
   */
  @Post('start')
  @ApiOperation({ summary: '开始入驻流程' })
  @ApiResponse({ status: 201, description: '入驻会话已创建' })
  async startOnboarding(
    @Request() req,
    @Body() data: { persona: string; referralCode?: string; metadata?: any },
  ) {
    const userId = req.user.id;
    const sessionId = `onb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const personaSteps = {
      personal: ['welcome', 'connect-wallet', 'create-agent', 'explore-marketplace', 'complete'],
      api_provider: ['welcome', 'verify-identity', 'import-api', 'configure-pricing', 'publish-skill', 'complete'],
      merchant: ['welcome', 'verify-identity', 'sync-store', 'configure-ucp', 'test-order', 'complete'],
      expert: ['welcome', 'verify-identity', 'create-capability-card', 'set-pricing', 'configure-sla', 'complete'],
      data_provider: ['welcome', 'verify-identity', 'upload-dataset', 'configure-privacy', 'set-x402-pricing', 'complete'],
      developer: ['welcome', 'create-developer-account', 'create-skill', 'test-skill', 'publish-skill', 'complete'],
    };

    const steps = personaSteps[data.persona] || personaSteps.developer;
    
    const session = {
      id: sessionId,
      userId,
      persona: data.persona,
      status: 'in_progress',
      currentStep: steps[0],
      steps: steps.map((stepId, index) => ({
        id: stepId,
        name: stepId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        description: '',
        status: index === 0 ? 'in_progress' : 'pending',
        isRequired: stepId !== 'verify-identity',
        data: {},
      })),
      createdResources: {},
      progress: 0,
      metadata: data.metadata || {},
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onboardingSessions.set(sessionId, session);
    // 也存储用户当前会话的映射
    onboardingSessions.set(`user_${userId}`, sessionId);

    return session;
  }

  /**
   * 获取当前入驻会话
   */
  @Get('current')
  @ApiOperation({ summary: '获取当前入驻会话' })
  async getCurrentSession(@Request() req) {
    const userId = req.user.id;
    const sessionId = onboardingSessions.get(`user_${userId}`);
    
    if (!sessionId) {
      return null;
    }

    const session = onboardingSessions.get(sessionId);
    if (!session || session.status === 'completed' || session.status === 'abandoned') {
      return null;
    }

    return session;
  }

  /**
   * 获取草稿列表
   */
  @Get('drafts')
  @ApiOperation({ summary: '获取入驻草稿' })
  async getDrafts(@Request() req) {
    const userId = req.user.id;
    const drafts: any[] = [];
    
    onboardingSessions.forEach((session, key) => {
      if (!key.startsWith('user_') && session.userId === userId && session.status === 'in_progress') {
        drafts.push(session);
      }
    });

    return drafts;
  }

  /**
   * 完成步骤
   */
  @Post(':sessionId/steps/:stepId/complete')
  @ApiOperation({ summary: '完成入驻步骤' })
  async completeStep(
    @Request() req,
    @Param('sessionId') sessionId: string,
    @Param('stepId') stepId: string,
    @Body() data?: any,
  ) {
    const session = onboardingSessions.get(sessionId);
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    const stepIndex = session.steps.findIndex(s => s.id === stepId);
    if (stepIndex === -1) {
      throw new NotFoundException('Step not found');
    }

    // 标记当前步骤完成
    session.steps[stepIndex].status = 'completed';
    session.steps[stepIndex].data = data || {};
    session.steps[stepIndex].completedAt = new Date().toISOString();

    // 更新进度
    const completedCount = session.steps.filter(s => s.status === 'completed' || s.status === 'skipped').length;
    session.progress = Math.round((completedCount / session.steps.length) * 100);

    // 移动到下一步
    const nextStepIndex = stepIndex + 1;
    if (nextStepIndex < session.steps.length) {
      session.currentStep = session.steps[nextStepIndex].id;
      session.steps[nextStepIndex].status = 'in_progress';
    } else {
      session.status = 'completed';
      session.currentStep = 'complete';
      session.completedAt = new Date().toISOString();
    }

    session.updatedAt = new Date().toISOString();
    onboardingSessions.set(sessionId, session);

    // 如果是发布步骤，实际创建 Skill
    if (stepId === 'publish-skill' && data) {
      try {
        const onboardingData = this.buildOnboardingDto(session.persona, session, data);
        const skill = await this.onboardingService.onboardSkill(req.user.id, onboardingData);
        session.createdResources.skillId = skill.id;
        onboardingSessions.set(sessionId, session);
      } catch (err) {
        // 记录错误但不阻止流程
        console.error('Failed to create skill:', err);
      }
    }

    return {
      success: true,
      nextStep: session.currentStep,
      createdResourceId: session.createdResources.skillId,
    };
  }

  /**
   * 跳过步骤
   */
  @Post(':sessionId/steps/:stepId/skip')
  @ApiOperation({ summary: '跳过入驻步骤' })
  async skipStep(
    @Request() req,
    @Param('sessionId') sessionId: string,
    @Param('stepId') stepId: string,
  ) {
    const session = onboardingSessions.get(sessionId);
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    const stepIndex = session.steps.findIndex(s => s.id === stepId);
    if (stepIndex === -1) {
      throw new NotFoundException('Step not found');
    }

    // 检查是否可跳过
    if (session.steps[stepIndex].isRequired) {
      return { success: false, message: 'This step is required and cannot be skipped' };
    }

    session.steps[stepIndex].status = 'skipped';

    // 移动到下一步
    const nextStepIndex = stepIndex + 1;
    if (nextStepIndex < session.steps.length) {
      session.currentStep = session.steps[nextStepIndex].id;
      session.steps[nextStepIndex].status = 'in_progress';
    }

    session.updatedAt = new Date().toISOString();
    onboardingSessions.set(sessionId, session);

    return {
      success: true,
      nextStep: session.currentStep,
    };
  }

  /**
   * 回到上一步
   */
  @Post(':sessionId/back')
  @ApiOperation({ summary: '返回上一步' })
  async goBack(
    @Request() req,
    @Param('sessionId') sessionId: string,
  ) {
    const session = onboardingSessions.get(sessionId);
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    const currentIndex = session.steps.findIndex(s => s.id === session.currentStep);
    if (currentIndex <= 0) {
      return session;
    }

    session.steps[currentIndex].status = 'pending';
    session.currentStep = session.steps[currentIndex - 1].id;
    session.steps[currentIndex - 1].status = 'in_progress';

    session.updatedAt = new Date().toISOString();
    onboardingSessions.set(sessionId, session);

    return session;
  }

  /**
   * 放弃入驻
   */
  @Post(':sessionId/abandon')
  @ApiOperation({ summary: '放弃入驻' })
  async abandon(
    @Request() req,
    @Param('sessionId') sessionId: string,
  ) {
    const session = onboardingSessions.get(sessionId);
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    session.status = 'abandoned';
    session.updatedAt = new Date().toISOString();
    onboardingSessions.set(sessionId, session);

    // 清除用户当前会话映射
    onboardingSessions.delete(`user_${session.userId}`);

    return { success: true };
  }

  /**
   * 恢复入驻流程
   */
  @Post(':sessionId/resume')
  @ApiOperation({ summary: '恢复入驻流程' })
  async resume(
    @Request() req,
    @Param('sessionId') sessionId: string,
  ) {
    const session = onboardingSessions.get(sessionId);
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.status === 'completed') {
      return session;
    }

    session.status = 'in_progress';
    session.updatedAt = new Date().toISOString();
    onboardingSessions.set(sessionId, session);
    onboardingSessions.set(`user_${session.userId}`, sessionId);

    return session;
  }

  /**
   * 构建 OnboardingDto
   */
  private buildOnboardingDto(persona: string, session: any, stepData: any): OnboardingDto {
    switch (persona) {
      case 'api_provider':
        return {
          type: 'api_vendor',
          apiName: stepData.apiName || 'Imported API',
          description: stepData.description || 'API imported via onboarding',
          apiDocumentUrl: stepData.apiDocumentUrl,
          pricePerCall: stepData.pricePerCall || 0.01,
          pricingType: stepData.pricingType || 'per_call',
        };
      case 'data_provider':
        return {
          type: 'data_provider',
          dataSourceUrl: stepData.dataSourceUrl,
          dataFormat: stepData.dataFormat || 'api',
          privacyLevel: stepData.privacyLevel || 'public',
          pricePerQuery: stepData.pricePerQuery || 0.001,
        };
      case 'expert':
        return {
          type: 'expert_consultant',
          expertise: stepData.expertise || 'General Consulting',
          problemSolving: stepData.problemSolving || 'Provide expert advice',
          requiredInputs: stepData.requiredInputs || [],
          pricePerSession: stepData.pricePerSession || 50,
        };
      case 'merchant':
        return {
          type: 'physical_service',
          fulfillmentType: stepData.fulfillmentType || 'service',
          products: stepData.products || [],
        };
      case 'developer':
      default:
        return {
          type: 'ai_developer',
          skillName: stepData.skillName || 'Custom Skill',
          skillDescription: stepData.skillDescription || 'Created via onboarding',
          codeLanguage: stepData.codeLanguage || 'typescript',
          visibility: 'public',
          pricePerExecution: stepData.pricePerExecution || 0.1,
          inputSchema: stepData.inputSchema || {},
          outputSchema: stepData.outputSchema || {},
        };
    }
  }

  /**
   * 统一入驻端点 - 支持所有五大用户画像（直接发布，跳过向导）
   */
  @Post()
  @ApiOperation({
    summary: '技能入驻 - 支持五大用户画像',
    description: `
      支持的用户画像:
      1. api_vendor - API厂商
      2. physical_service - 实物与服务商
      3. expert_consultant - 行业专家/顾问
      4. data_provider - 专有数据持有方
      5. ai_developer - 全能AI开发者
      
      发布后立即上架 Marketplace，支持:
      - Gemini UCP 协议
      - Claude MCP 协议
      - ChatGPT MCP/ACP 协议
      - X402 支付协议
    `,
  })
  @ApiResponse({ status: 201, description: '入驻成功，Skill已发布' })
  @ApiResponse({ status: 400, description: '入驻数据格式错误' })
  async onboardSkill(@Request() req, @Body() data: OnboardingDto) {
    return this.onboardingService.onboardSkill(req.user.id, data);
  }

  /**
   * 获取入驻模板 - 返回各画像的数据结构示例
   */
  @Get('templates')
  @ApiOperation({ summary: '获取入驻数据模板' })
  @ApiResponse({ status: 200, description: '模板列表' })
  async getTemplates(@Query('type') type?: string) {
    const templates = {
      api_vendor: {
        type: 'api_vendor',
        apiDocumentUrl: 'https://api.example.com/openapi.json',
        curlExample: 'curl -X GET https://api.example.com/v1/data',
        apiKey: 'your_api_key_here',
        apiName: 'Example API',
        description: 'Description of what this API does',
        pricingType: 'per_call',
        pricePerCall: 0.01,
      },
      physical_service: {
        type: 'physical_service',
        shopifyUrl: 'https://mystore.myshopify.com',
        amazonUrl: null,
        products: [
          {
            name: 'Product Name',
            description: 'Product description',
            price: 29.99,
            currency: 'USD',
            imageUrl: 'https://example.com/image.jpg',
            sku: 'SKU-12345',
          },
        ],
        fulfillmentType: 'physical',
      },
      expert_consultant: {
        type: 'expert_consultant',
        expertise: 'Legal Consultant',
        problemSolving: 'Provide legal advice on contract review',
        requiredInputs: ['Contract PDF', 'Client Requirements', 'Deadline'],
        slaResponseTime: 120,
        slaAccuracyRate: 95,
        outputFormat: 'PDF',
        pricePerSession: 50,
      },
      data_provider: {
        type: 'data_provider',
        dataSourceUrl: 'https://data.example.com/api',
        dataFormat: 'api',
        dataSample: { example: 'data' },
        privacyLevel: 'sensitive',
        sensitiveFields: ['email', 'phone'],
        pricePerQuery: 0.001,
        pricePerRecord: 0.0001,
      },
      ai_developer: {
        type: 'ai_developer',
        skillName: 'Image Analysis Skill',
        skillDescription: 'Analyze images and extract metadata',
        codeLanguage: 'python',
        codeRepository: 'https://github.com/user/repo',
        inputSchema: {
          type: 'object',
          properties: {
            imageUrl: { type: 'string', description: 'Image URL' },
          },
          required: ['imageUrl'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            labels: { type: 'array', description: 'Detected labels' },
            confidence: { type: 'number', description: 'Confidence score' },
          },
        },
        dependentSkills: [],
        visibility: 'public',
        pricePerExecution: 0.1,
      },
    };

    if (type && templates[type]) {
      return { template: templates[type] };
    }

    return { templates };
  }

  /**
   * 批量导入商品 (专为实物服务商优化)
   */
  @Post('bulk-import')
  @ApiOperation({ summary: '批量导入商品' })
  @ApiResponse({ status: 201, description: '批量导入成功' })
  async bulkImport(
    @Request() req,
    @Body()
    data: {
      source: 'shopify' | 'amazon' | 'csv';
      url?: string;
      products?: Array<{
        name: string;
        description: string;
        price: number;
        currency: string;
        imageUrl?: string;
        sku?: string;
      }>;
    },
  ) {
    const results = [];

    if (data.products) {
      for (const product of data.products) {
        const skill = await this.onboardingService.onboardSkill(req.user.id, {
          type: 'physical_service',
          products: [product],
          fulfillmentType: 'physical',
        });
        results.push(skill);
      }
    }

    return {
      success: true,
      imported: results.length,
      skills: results,
    };
  }
}
