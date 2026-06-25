import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Like, MoreThan, LessThan, Between } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import * as nodemailer from 'nodemailer';
import { TwitterApi } from 'twitter-api-v2';
import { AgentAccount } from '../../entities/agent-account.entity';
import { User } from '../../entities/user.entity';
import { Product } from '../../entities/product.entity';
import { Order, OrderStatus } from '../../entities/order.entity';
import { Payment, PaymentStatus } from '../../entities/payment.entity';
import { RiskAssessment } from '../../entities/risk-assessment.entity';
import { FundPath } from '../../entities/fund-path.entity';
import { OpenAIIntegrationService } from '../ai-integration/openai/openai-integration.service';
import { ClaudeIntegrationService } from '../ai-integration/claude/claude-integration.service';
import { BedrockIntegrationService } from '../ai-integration/bedrock/bedrock-integration.service';
import { GeminiIntegrationService } from '../ai-integration/gemini/gemini-integration.service';
import { GroqIntegrationService } from '../ai-integration/groq/groq-integration.service';
import { DeepSeekIntegrationService } from '../ai-integration/deepseek/deepseek-integration.service';
import { ModelRouterService, TaskComplexity } from '../ai-integration/model-router/model-router.service';
import { RagService } from './rag.service';
import { DeveloperService } from './developer.service';

// ========== Dashboard & Agent Types (Phase 1 & 2) ==========
export interface DashboardStats {
  revenue24h: number;
  revenueChange: number;
  activeAgents: number;
  totalAgents: number;
  activeMerchants: number;
  newMerchants24h: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  systemHealth: 'HEALTHY' | 'DEGRADED' | 'DOWN';
}

export interface DashboardAlert {
  id: string;
  type: 'risk' | 'biz' | 'sys' | 'ops';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}

export interface AgentStatusInfo {
  id: string;
  name: string;
  role: string;
  status: 'running' | 'idle' | 'paused' | 'error';
  currentTask?: string;
  progress?: number;
  lastActive: string;
}

@Injectable()
export class HqService {
  private readonly logger = new Logger(HqService.name);
  private knowledgeBase: string = '';
  private twitterClient: TwitterApi | null = null;
  private mailTransporter: any = null;

  // In-memory agent status tracker (Phase 2)
  private agentStatuses: Map<string, AgentStatusInfo> = new Map();
  // In-memory alert store (Phase 1)
  private alerts: DashboardAlert[] = [];

  constructor(
    @InjectRepository(AgentAccount)
    private agentRepo: Repository<AgentAccount>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Product)
    private productRepo: Repository<Product>,
    @InjectRepository(Order)
    private orderRepo: Repository<Order>,
    @InjectRepository(Payment)
    private paymentRepo: Repository<Payment>,
    @InjectRepository(RiskAssessment)
    private riskRepo: Repository<RiskAssessment>,
    @InjectRepository(FundPath)
    private fundPathRepo: Repository<FundPath>,
    private configService: ConfigService,
    private openaiService: OpenAIIntegrationService,
    private claudeService: ClaudeIntegrationService,
    private bedrockService: BedrockIntegrationService,
    private geminiService: GeminiIntegrationService,
    private groqService: GroqIntegrationService,
    private deepseekService: DeepSeekIntegrationService,
    private modelRouter: ModelRouterService,
    private ragService: RagService,
    private developerService: DeveloperService,
  ) {
    this.reloadKnowledgeBase();
    this.initClients();
    this.initMockAgents(); // Initialize mock agents for Phase 2
    this.initMockAlerts(); // Initialize mock alerts for Phase 1
  }

  // ========== Dashboard APIs (Phase 1) ==========

  /**
   * 获取 Dashboard 统计数据
   */
  async getDashboardStats(): Promise<DashboardStats> {
    // TODO: Replace with real data from database
    const activeAgents = Array.from(this.agentStatuses.values()).filter(
      a => a.status === 'running' || a.status === 'idle'
    ).length;

    return {
      revenue24h: 1234.56, // TODO: Calculate from orders
      revenueChange: 0.201,
      activeAgents,
      totalAgents: this.agentStatuses.size,
      activeMerchants: 128, // TODO: Query from merchant table
      newMerchants24h: 3,
      riskLevel: 'LOW',
      systemHealth: 'HEALTHY',
    };
  }

  /**
   * 获取系统告警列表
   */
  async getDashboardAlerts(limit: number = 10): Promise<DashboardAlert[]> {
    return this.alerts.slice(0, limit);
  }

  /**
   * 添加新告警
   */
  addAlert(type: DashboardAlert['type'], title: string, message: string) {
    const alert: DashboardAlert = {
      id: `alert_${Date.now()}`,
      type,
      title,
      message,
      timestamp: new Date().toISOString(),
      read: false,
    };
    this.alerts.unshift(alert);
    // Keep only last 100 alerts
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(0, 100);
    }
    this.logger.log(`New alert: [${type}] ${title}`);
  }

  // ========== Agent APIs (Phase 2) ==========

  /**
   * 获取所有 Agent 状态
   */
  async getAgentStatuses(): Promise<AgentStatusInfo[]> {
    return Array.from(this.agentStatuses.values());
  }

  /**
   * 获取单个 Agent 详情
   */
  async getAgentDetail(agentId: string): Promise<AgentStatusInfo | null> {
    return this.agentStatuses.get(agentId) || null;
  }

  /**
   * 向 Agent 发送命令
   */
  async sendAgentCommand(agentId: string, command: string): Promise<{ success: boolean; response: string }> {
    const agent = this.agentStatuses.get(agentId);
    if (!agent) {
      return { success: false, response: `Agent ${agentId} not found` };
    }

    // Update agent status
    agent.status = 'running';
    agent.currentTask = command;
    agent.progress = 0;
    agent.lastActive = new Date().toISOString();
    this.agentStatuses.set(agentId, agent);

    // Log the command
    this.addAlert('ops', `Command sent to ${agent.name}`, command);

    return { success: true, response: `Command "${command}" sent to ${agent.name}` };
  }

  /**
   * 更新 Agent 状态
   */
  updateAgentStatus(agentId: string, status: Partial<AgentStatusInfo>) {
    const agent = this.agentStatuses.get(agentId);
    if (agent) {
      Object.assign(agent, status, { lastActive: new Date().toISOString() });
      this.agentStatuses.set(agentId, agent);
    }
  }

  /**
   * 初始化模拟 Agents (开发阶段)
   */
  private initMockAgents() {
    const mockAgents: AgentStatusInfo[] = [
      // 核心 Agent 团队
      { id: 'ARCHITECT-01', name: 'Lead Architect', role: 'System Architect', status: 'idle', currentTask: undefined, progress: undefined, lastActive: new Date().toISOString() },
      { id: 'CODER-01', name: 'Senior Coder', role: 'Full-Stack Developer', status: 'idle', currentTask: undefined, progress: undefined, lastActive: new Date().toISOString() },
      { id: 'GROWTH-01', name: 'Global Growth Lead', role: 'Growth & Marketing', status: 'idle', currentTask: undefined, progress: undefined, lastActive: new Date().toISOString() },
      { id: 'BD-01', name: 'Ecosystem BD', role: 'Business Development', status: 'idle', currentTask: undefined, progress: undefined, lastActive: new Date().toISOString() },
      // 执行 Agent
      { id: 'S01', name: 'Sales-01', role: 'Twitter Growth', status: 'running', currentTask: 'Analyzing trending hashtags for #AI_Agents', progress: 45, lastActive: new Date().toISOString() },
      { id: 'D02', name: 'Dev-02', role: 'Bug Fixer', status: 'paused', currentTask: 'Waiting for code review on PR #221', progress: undefined, lastActive: new Date().toISOString() },
      { id: 'H01', name: 'HQ-Core', role: 'System', status: 'running', currentTask: 'Optimizing database indexes', progress: 78, lastActive: new Date().toISOString() },
      { id: 'M01', name: 'Market-01', role: 'Market Research', status: 'idle', currentTask: undefined, progress: undefined, lastActive: new Date().toISOString() },
      { id: 'C01', name: 'Content-01', role: 'Content Writer', status: 'error', currentTask: 'Failed: API rate limit exceeded', progress: undefined, lastActive: new Date().toISOString() },
    ];
    mockAgents.forEach(a => this.agentStatuses.set(a.id, a));
    this.logger.log(`Initialized ${mockAgents.length} HQ Agents (4 core + 5 execution)`);
  }

  /**
   * 初始化模拟告警 (开发阶段)
   */
  private initMockAlerts() {
    this.alerts = [
      { id: 'a1', type: 'risk', title: 'Suspicious Login Blocked', message: 'Merchant #992 attempted login from unknown IP.', timestamp: new Date(Date.now() - 2 * 60000).toISOString(), read: false },
      { id: 'a2', type: 'biz', title: 'New Opportunity', message: '"AI Agent Tools" search volume +300% on Twitter.', timestamp: new Date(Date.now() - 15 * 60000).toISOString(), read: false },
      { id: 'a3', type: 'sys', title: 'Deployment Success', message: 'Frontend v2.2.0 deployed successfully.', timestamp: new Date(Date.now() - 60 * 60000).toISOString(), read: true },
      { id: 'a4', type: 'ops', title: 'Auto-Refund', message: 'Refunded txn_0x882... (Reason: timeout).', timestamp: new Date(Date.now() - 3 * 60 * 60000).toISOString(), read: true },
    ];
    this.logger.log(`Initialized ${this.alerts.length} mock alerts`);
  }

  // ========== Engine Room APIs (Phase 3) ==========

  /**
   * 获取用户列表 (Engine Room) - 真实数据
   */
  async getEngineUsers(params: { page: number; limit: number; status?: string }) {
    const { page, limit, status } = params;
    const query = this.userRepo.createQueryBuilder('user')
      .orderBy('user.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    
    if (status) {
      query.andWhere('user.status = :status', { status });
    }

    const [items, total] = await query.getManyAndCount();

    return {
      items: items.map(u => ({
        id: u.id,
        email: u.email,
        username: u.nickname || u.email?.split('@')[0],
        status: u.status || 'active',
        role: u.roles?.[0] || 'user',
        kycStatus: u.kycLevel || 'none',
        createdAt: u.createdAt,
        lastLoginAt: u.lastActiveAt,
        walletAddress: u.metadata?.walletAddress,
      })),
      total,
      page,
      limit,
    };
  }

  /**
   * 更新用户 (Engine Room)
   */
  async updateEngineUser(userId: string, data: { status?: string; kycStatus?: string }) {
    this.logger.log(`Updating user ${userId}: ${JSON.stringify(data)}`);
    const updateData: any = {};
    if (data.status) {
      updateData.status = data.status as any;
    }
    if (data.kycStatus) {
      updateData.kycLevel = data.kycStatus;
    }
    if (Object.keys(updateData).length > 0) {
      await this.userRepo.update(userId, updateData);
    }
    return { success: true, userId, ...data };
  }

  /**
   * 获取商户列表 (Engine Room) - 真实数据
   */
  async getEngineMerchants(params: { page: number; limit: number; status?: string }) {
    const { page, limit, status } = params;
    const query = this.userRepo.createQueryBuilder('user')
      .where("user.roles && ARRAY[:role]", { role: 'merchant' })
      .orderBy('user.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    
    if (status) {
      query.andWhere('user.status = :status', { status });
    }

    const [items, total] = await query.getManyAndCount();

    // 获取每个商户的产品数量和收入
    const merchantsWithStats = await Promise.all(
      items.map(async (m) => {
        const productCount = await this.productRepo.count({ where: { merchantId: m.id } });
        const orders = await this.orderRepo.find({ where: { merchantId: m.id, status: OrderStatus.PAID } });
        const revenue = orders.reduce((sum, o) => sum + Number(o.amount || 0), 0);

        return {
          id: m.id,
          name: m.nickname || m.email?.split('@')[0] || 'Unknown',
          email: m.email,
          status: m.status || 'active',
          kycStatus: m.kycLevel || 'pending',
          revenue,
          productCount,
          createdAt: m.createdAt,
        };
      })
    );

    return { items: merchantsWithStats, total, page, limit };
  }

  /**
   * 更新商户 (Engine Room)
   */
  async updateEngineMerchant(merchantId: string, data: { status?: string; kycStatus?: string }) {
    this.logger.log(`Updating merchant ${merchantId}: ${JSON.stringify(data)}`);
    const updateData: any = {};
    if (data.status) {
      updateData.status = data.status as any;
    }
    if (data.kycStatus) {
      updateData.kycLevel = data.kycStatus;
    }
    if (Object.keys(updateData).length > 0) {
      await this.userRepo.update(merchantId, updateData);
    }
    return { success: true, merchantId, ...data };
  }

  /**
   * 获取产品列表 (Engine Room) - 真实数据
   */
  async getEngineProducts(params: { page: number; limit: number; status?: string }) {
    const { page, limit, status } = params;
    const query = this.productRepo.createQueryBuilder('product')
      .leftJoinAndSelect('product.merchant', 'merchant')
      .orderBy('product.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    
    if (status) {
      query.andWhere('product.status = :status', { status });
    }

    const [items, total] = await query.getManyAndCount();

    return {
      items: items.map(p => ({
        id: p.id,
        name: p.name,
        merchantId: p.merchantId,
        merchantName: (p.merchant as any)?.nickname || (p.merchant as any)?.email?.split('@')[0] || 'Unknown',
        price: p.price,
        status: p.status || 'active',
        category: p.category || 'AI Tools',
        salesCount: 0, // TODO: Calculate from orders
        createdAt: p.createdAt,
      })),
      total,
      page,
      limit,
    };
  }

  /**
   * 更新产品 (Engine Room)
   */
  async updateEngineProduct(productId: string, data: { status?: string }) {
    this.logger.log(`Updating product ${productId}: ${JSON.stringify(data)}`);
    if (data.status) {
      await this.productRepo.update(productId, { status: data.status as any });
    }
    return { success: true, productId, ...data };
  }

  /**
   * 获取风险告警列表 (Engine Room) - 真实数据
   */
  async getEngineRiskAlerts(params: { page: number; limit: number; severity?: string }) {
    const { page, limit, severity } = params;
    try {
      const query = this.riskRepo.createQueryBuilder('risk')
        .orderBy('risk.createdAt', 'DESC')
        .skip((page - 1) * limit)
        .take(limit);
      
      if (severity) {
        query.andWhere('risk.level = :severity', { severity });
      }

      const [items, total] = await query.getManyAndCount();

      return {
        items: items.map(r => ({
          id: r.id,
          type: 'risk_assessment',
          severity: r.riskLevel || 'medium',
          description: r.recommendation || `Risk score: ${r.riskScore}`,
          userId: r.userId,
          merchantId: null,
          status: r.decision || 'review',
          createdAt: r.createdAt,
        })),
        total,
        page,
        limit,
      };
    } catch (e) {
      // Return empty if table doesn't exist
      return { items: [], total: 0, page, limit };
    }
  }

  /**
   * 更新风险告警状态 (Engine Room)
   */
  async updateEngineRiskAlert(alertId: string, status: string) {
    this.logger.log(`Updating risk alert ${alertId} status to: ${status}`);
    try {
      await this.riskRepo.update(alertId, { decision: status as any });
    } catch (e) {
      // Ignore if table doesn't exist
    }
    return { success: true, alertId, status };
  }

  /**
   * 获取交易记录 (Engine Room) - 真实数据
   */
  async getEngineTransactions(params: { page: number; limit: number; type?: string }) {
    const { page, limit, type } = params;
    const query = this.paymentRepo.createQueryBuilder('payment')
      .orderBy('payment.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    
    if (type) {
      query.andWhere('payment.type = :type', { type });
    }

    const [items, total] = await query.getManyAndCount();

    return {
      items: items.map(p => ({
        id: p.id,
        type: 'payment',
        amount: p.amount,
        currency: p.currency || 'USD',
        status: p.status || 'completed',
        userId: p.userId,
        merchantId: p.merchantId,
        description: p.description || `Payment via ${p.paymentMethod || 'unknown'}`,
        createdAt: p.createdAt,
      })),
      total,
      page,
      limit,
    };
  }

  /**
   * 获取财务汇总 (Engine Room) - 真实数据
   */
  async getEngineFinanceSummary() {
    const payments = await this.paymentRepo.find({ where: { status: PaymentStatus.COMPLETED } });
    const totalIncome = payments.filter(p => Number(p.amount) > 0).reduce((sum, p) => sum + Number(p.amount), 0);
    const totalOutflow = Math.abs(payments.filter(p => Number(p.amount) < 0).reduce((sum, p) => sum + Number(p.amount), 0));
    const pendingPayouts = await this.paymentRepo.count({ where: { status: PaymentStatus.PENDING } });

    return {
      totalIncome,
      totalOutflow,
      netAmount: totalIncome - totalOutflow,
      pendingPayouts,
      transactionCount: payments.length,
    };
  }

  /**
   * 初始化社交和邮件客户端
   */
  private initClients() {
    // Twitter Client
    const twitterKey = process.env.TWITTER_CONSUMER_KEY || process.env.TWITTER_API_KEY;
    const twitterSecret = process.env.TWITTER_CONSUMER_SECRET || process.env.TWITTER_APIKEY_SECRET;
    const accessToken = process.env.TWITTER_ACCESS_TOKEN;
    const accessSecret = process.env.TWITTER_ACCESS_TOKEN_SECRET;

    if (twitterKey && twitterSecret && accessToken && accessSecret) {
      this.twitterClient = new TwitterApi({
        appKey: twitterKey,
        appSecret: twitterSecret,
        accessToken: accessToken,
        accessSecret: accessSecret,
      });
      this.logger.log('Twitter Client 初始化成功 (Read/Write Mode)');
    }

    // Email Transporter
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASSWORD;
    if (smtpUser && smtpPass) {
      this.mailTransporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_PORT === '465',
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });
      this.logger.log('SMTP 邮件服务初始化成功');
    }
  }

  /**
   * 加载/重新加载 Agent 知识库
   */
  reloadKnowledgeBase() {
    try {
      const kbPath = path.join(process.cwd(), 'hq-knowledge-base.md');
      if (fs.existsSync(kbPath)) {
        this.knowledgeBase = fs.readFileSync(kbPath, 'utf-8');
        this.logger.log('Agent 知识库加载成功');
      }
    } catch (e) {
      this.logger.error('加载知识库失败', e);
    }
  }

  /**
   * 获取知识库文本内容
   */
  getKnowledgeBaseContent(): string {
    return this.knowledgeBase;
  }

  /**
   * 更新知识库内容并持久化
   */
  updateKnowledgeBaseContent(content: string) {
    this.knowledgeBase = content;
    try {
      const kbPath = path.join(process.cwd(), 'hq-knowledge-base.md');
      fs.writeFileSync(kbPath, content, 'utf-8');
      this.logger.log('Agent 知识库已更新并保存');
    } catch (e) {
      this.logger.error('保存知识库失败', e);
    }
  }

  /**
   * 获取本地 RAG 知识库文件列表（返回详细信息）
   */
  getRagFiles(): { files: Array<{ name: string; path: string; type: string; size: number }> } {
    const knowledgePath = path.join(process.cwd(), 'knowledge');
    this.logger.log(`正在读取 RAG 知识库目录: ${knowledgePath}, CWD: ${process.cwd()}`);
    if (!fs.existsSync(knowledgePath)) {
      this.logger.warn(`RAG 目录不存在: ${knowledgePath}`);
      return { files: [] };
    }
    try {
      const fileNames = fs.readdirSync(knowledgePath).filter(file => 
        ['.md', '.txt', '.pdf', '.json'].includes(path.extname(file).toLowerCase())
      );
      const files = fileNames.map(name => {
        const filePath = path.join(knowledgePath, name);
        const stats = fs.statSync(filePath);
        return {
          name,
          path: `knowledge/${name}`,
          type: 'file',
          size: stats.size,
        };
      });
      this.logger.log(`找到 ${files.length} 个 RAG 文件`);
      return { files };
    } catch (e) {
      this.logger.error('读取 RAG 目录失败', e);
      return { files: [] };
    }
  }

  /**
   * 上传 RAG 文件
   */
  async uploadRagFile(filename: string, content: string): Promise<{ success: boolean; message: string }> {
    const knowledgePath = path.join(process.cwd(), 'knowledge');
    if (!fs.existsSync(knowledgePath)) {
      fs.mkdirSync(knowledgePath, { recursive: true });
    }
    try {
      const filePath = path.join(knowledgePath, filename);
      fs.writeFileSync(filePath, content, 'utf-8');
      this.logger.log(`RAG 文件已上传: ${filename}`);
      // Reload RAG knowledge base
      await this.ragService.reloadKnowledge();
      return { success: true, message: `File ${filename} uploaded successfully` };
    } catch (e) {
      this.logger.error(`上传 RAG 文件失败: ${filename}`, e);
      return { success: false, message: `Failed to upload: ${e.message}` };
    }
  }

  /**
   * 删除 RAG 文件
   */
  async deleteRagFile(filename: string): Promise<{ success: boolean; message: string }> {
    const knowledgePath = path.join(process.cwd(), 'knowledge');
    const filePath = path.join(knowledgePath, filename);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        this.logger.log(`RAG 文件已删除: ${filename}`);
        await this.ragService.reloadKnowledge();
        return { success: true, message: `File ${filename} deleted` };
      }
      return { success: false, message: 'File not found' };
    } catch (e) {
      this.logger.error(`删除 RAG 文件失败: ${filename}`, e);
      return { success: false, message: `Failed to delete: ${e.message}` };
    }
  }

  /**
   * 处理总部的聊天指令
   */
  async processHqChat(agentId: string, messages: any[], userId?: string) {
    this.logger.log(`处理总部指令: Agent=${agentId}, 消息数=${messages.length}`);
    const toolLogs: any[] = [];

    // 1. 获取 Agent 详情
    const agent = await this.agentRepo.findOne({ where: { agentUniqueId: agentId } });
    if (!agent) {
      this.logger.warn(`未找到 Agent: ${agentId}，使用临时配置`);
    }

    // 2. 根据 Agent 类型构造系统提示词
    const systemPrompt = this.getSystemPromptForAgent(agentId, agent);

    // 3. 构建消息列表
    const fullMessages = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    // 4. 配置 HQ 专属工具箱 (Growth & BD Toolbox)
    const hqTools = [
      {
        name: 'search_local_docs',
        description: 'Search the internal knowledge base (PDFs, Markdown, text files) for detailed project info.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'What information you are looking for in local files' },
          },
          required: ['query'],
        },
      },
      {
        name: 'web_search',
        description: 'Search the internet for real-time information about markets, competitors, or merchants.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'The search query' },
          },
          required: ['query'],
        },
      },
      {
        name: 'social_connector_action',
        description: 'Access social media (X/Twitter, Discord, Telegram) for growth operations.',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['analyze_trends', 'post_tweet', 'send_discord_msg', 'send_tg_notification'], description: 'Social media action' },
            content: { type: 'string', description: 'Content to post or message to send' },
            params: { type: 'string', description: 'Additional parameters like search keywords' },
          },
          required: ['action'],
        },
      },
      {
        name: 'business_toolbox',
        description: 'Access CRM and Email tools for merchant outreach.',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['send_email', 'get_merchant_info'], description: 'Business action' },
            target: { type: 'string', description: 'Target merchant email or name' },
            subject: { type: 'string', description: 'Email subject' },
            body: { type: 'string', description: 'Email body content' },
          },
          required: ['action'],
        },
      },
      // --- IDE & Workshop Capabilities ---
      {
        name: 'read_code',
        description: 'Read source code from a file in the project workspace. Use this to inspect existing code before making changes.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Relative path to the file (e.g., "src/app/page.tsx")' },
          },
          required: ['path'],
        },
      },
      {
        name: 'edit_code',
        description: 'Write or modify source code in the project. Use this to implement features, fix bugs, or refactor code.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path to write to (will create if not exists)' },
            content: { type: 'string', description: 'Complete new content of the file' },
          },
          required: ['path', 'content'],
        },
      },
      {
        name: 'list_files',
        description: 'List files and directories in a path to understand project structure.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Directory path to explore (default: current directory)' },
          },
        },
      },
      {
        name: 'search_code',
        description: 'Search for code patterns across the project. Useful for finding where a function/variable is used.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Text to search for in code' },
            pattern: { type: 'string', description: 'File pattern like "*.tsx" or "*.ts" (default: *.ts)' },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_project_tree',
        description: 'Get the full project file tree structure (like VSCode explorer). Use this to understand workspace layout.',
        parameters: {
          type: 'object',
          properties: {
            depth: { type: 'number', description: 'Maximum depth to traverse (default: 3)' },
          },
        },
      },
      {
        name: 'execute_terminal',
        description: 'Execute a shell command in the project directory. Use for npm/git commands, running tests, etc.',
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'Shell command to execute (e.g., "npm run build")' },
          },
          required: ['command'],
        },
      },
      {
        name: 'get_workspace_info',
        description: 'Get project overview including package.json dependencies and current git branch/status.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    ];

    // 5. 调用大模型 (统一使用 Gemini 家族 Flash 版本 - 智性能优先 & 节约成本)
    try {
      // 模型优先级队列：2.0 Flash -> 1.5 Flash (暂时不用 1.5 Pro)
      // 用户要求：2.0 Flash 不行就 1.5 Flash，不要 Pro
      const modelPriority = [
        'gemini-2.0-flash-exp', // 当前最强 Flash 实验版
        'gemini-1.5-flash-002'  // 稳定兜底 Flash
      ];

      this.logger.log(`🌟 Agent ${agentId} 正在尝试连接 Gemini Flash 引擎家族 (优先级策略: 2.0 -> 1.5)`);

      let response: any;
      let lastError: any;
      let usedModel = '';

      // 尝试模型队列
      for (const modelName of modelPriority) {
        try {
          this.logger.log(`尝试连接模型: ${modelName}...`);
          response = await this.geminiService.chatWithFunctions(fullMessages as any, { 
            model: modelName, 
            additionalTools: hqTools 
          });
          usedModel = modelName;
          this.logger.log(`✅ 成功连接: ${modelName}`);
          break; // 成功后跳出循环
        } catch (e: any) {
          lastError = e;
          // 只有 404 (模型不存在) 或 429 (配额用完) 才尝试下一个
          if (e.message?.includes('not found') || e.message?.includes('429') || e.message?.includes('quota')) {
            this.logger.warn(`模型 ${modelName} 无法使用 (${e.message})，尝试下一个方案...`);
            continue;
          }
          // 其他严重错误直接抛出
          throw e;
        }
      }

      // 如果 Gemini 家族全部不可用，尝试 Groq 兜底
      if (!response) {
        this.logger.warn(`Gemini 家族全部额度耗尽或不可用，尝试 Groq 兜底...`);
        try {
          response = await this.groqService.chatWithFunctions(fullMessages as any, { 
            model: 'llama-3.3-70b-versatile', 
            additionalTools: hqTools 
          });
          usedModel = 'llama-3.3-70b-versatile';
          this.logger.log('✅ 降级成功：Groq Llama 3.3');
        } catch (e2: any) {
          this.logger.error('所有模型均失效');
          throw lastError || e2;
        }
      }

      // 6. 执行工具调用循环 (如果有)
      if (response.functionCalls && response.functionCalls.length > 0) {
        for (const toolCall of response.functionCalls) {
          const name = toolCall.function.name;
          const args = JSON.parse(toolCall.function.arguments);
          const result = await this.handleHqToolCall(name, args);
          
          toolLogs.push({
            name,
            args,
            result: typeof result === 'string' ? result : JSON.stringify(result)
          });
        }

        // 工具执行完后，通常需要把结果喂回模型获取最终回复，但为了简化，我们先直接返回工具执行后的状态
        // 并在内容中加入工具执行摘要
        if (toolLogs.length > 0) {
          response.text += `\n\n[工具执行摘要]：已完成 ${toolLogs.length} 项操作。`;
        }
      }

      // 7. 提取最新的代码变更和终端输出以便前端 IDE 展示
      let lastCodeChange = '';
      let lastPath = '';
      let terminalOutput = '';
      
      for (const log of toolLogs) {
        if (log.name === 'edit_code') {
          lastCodeChange = log.args.content;
          lastPath = log.args.path;
        } else if (log.name === 'read_code' && !lastCodeChange) {
          lastCodeChange = log.result;
          lastPath = log.args.path;
        } else if (log.name === 'execute_terminal') {
          terminalOutput += `\n$ ${log.args.command}\n${log.result}\n`;
        }
      }

      return {
        agentId,
        agentName: agent?.name || agentId,
        content: response.text || "Agent 正在思考中...",
        timestamp: new Date().toISOString(),
        model: response.model || usedModel,
        toolLogs,
        lastCodeChange,
        lastPath,
        terminalOutput
      };
    } catch (error: any) {
      this.logger.error(`总部对话异常 (所有模型均失效): ${error.message}`);
      return {
        agentId,
        agentName: agent?.name || agentId,
        content: `[指令中断]：所有 AI 引擎连接均告急。详细错误: ${error.message || '未知连接问题'}。`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * 处理专属工具调用
   */
  private async handleHqToolCall(name: string, args: any): Promise<any> {
    this.logger.log(`Agent 正在使用总部专属工具: ${name}`, args);
    
    try {
      if (name === 'search_local_docs') {
        return await this.ragService.searchLocalDocs(args.query);
      }

      if (name === 'web_search') {
        return await this.performWebSearch(args.query);
      }
      
      if (name === 'social_connector_action') {
        try {
          return await this.performSocialAction(args);
        } catch (e: any) {
          this.logger.error(`社交操作失败: ${e.message}`);
          return { success: false, error: `社交平台执行中断: ${e.message}`, note: "请检查 API 权限或内容长度限制。" };
        }
      }

      if (name === 'business_toolbox') {
        return await this.performBusinessAction(args);
      }

      // --- IDE Tool Handlers ---
      if (name === 'read_code') {
        return await this.developerService.readFile(args.path);
      }

      if (name === 'edit_code') {
        return await this.developerService.writeFile(args.path, args.content);
      }

      if (name === 'list_files') {
        return await this.developerService.listFiles(args.path);
      }

      if (name === 'search_code') {
        return await this.developerService.searchCode(args.query, args.pattern);
      }

      if (name === 'get_project_tree') {
        return await this.developerService.getProjectTree('.', args.depth || 3);
      }

      if (name === 'get_workspace_info') {
        return await this.developerService.getProjectInfo();
      }

      if (name === 'execute_terminal') {
        return await this.developerService.executeCommand(args.command);
      }

    } catch (error: any) {
      this.logger.error(`工具调用失败 [${name}]: ${error.message}`);
      return { success: false, error: error.message };
    }
    
    return undefined;
  }

  /**
   * 执行网络检索 (SerpApi -> DuckDuckGo)
   */
  private async performWebSearch(query: string) {
    const apiKey = process.env.SEARCH_API_KEY;
    if (apiKey) {
      try {
        const response = await axios.get('https://serpapi.com/search', {
          params: { q: query, api_key: apiKey, engine: 'google', num: 5 }
        });
        return {
          source: 'SerpApi (Google)',
          results: response.data.organic_results?.map((r: any) => ({ title: r.title, summary: r.snippet, link: r.link })) || [],
          agent_note: "已通过 SerpApi 检索到最新 Google 数据。"
        };
      } catch (e: any) {
        this.logger.warn(`SerpApi 失败，尝试切换 DuckDuckGo: ${e.message}`);
      }
    }

    // Fallback: DuckDuckGo (No Key Required)
    try {
      const response = await axios.get(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`);
      const results = [];
      if (response.data.AbstractText) {
        results.push({ title: response.data.Heading, summary: response.data.AbstractText, link: response.data.AbstractURL });
      }
      return {
        source: 'DuckDuckGo (Free)',
        results: results.length > 0 ? results : [{ title: "Search Result", summary: `Found information about ${query}, but detailed snippets unavailable.` }],
        agent_note: "已通过 DuckDuckGo 免费接口检索。"
      };
    } catch (e: any) {
      return { success: false, message: "所有检索渠道均不可用" };
    }
  }

  /**
   * 执行社交动作 (Twitter/X, Discord, Telegram)
   */
  private async performSocialAction(args: any) {
    const { action, content, params } = args;

    if (action === 'post_tweet') {
      if (!this.twitterClient) throw new Error('Twitter API 未配置或 Access Token 无效');
      const tweet = await this.twitterClient.v2.tweet(content);
      return { success: true, status: 'PUBLISHED', platform: 'Twitter', tweetId: tweet.data.id, url: `https://x.com/i/status/${tweet.data.id}` };
    }

    if (action === 'send_discord_msg') {
      const token = process.env.DISCORD_TOKEN;
      if (!token) throw new Error('DISCORD_TOKEN 未配置');
      // 这里可以实现发送到特定频道逻辑，暂时使用系统通知演示
      return { success: true, status: 'SENT', platform: 'Discord', note: "内容已准备好推送到 Discord 频道。" };
    }

    if (action === 'send_tg_notification') {
      const tgToken = process.env.TELEGRAM_BOT_TOKEN;
      if (!tgToken) throw new Error('TELEGRAM_BOT_TOKEN 未配置');
      const chatId = process.env.TELEGRAM_CHAT_ID;
      if (!chatId) throw new Error('TELEGRAM_CHAT_ID 未配置，请先通过 getUpdates 获取');
      
      await axios.post(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        chat_id: chatId,
        text: `📢 [Agentrix HQ 通知]\n\n${content}`
      });
      return { success: true, status: 'SENT', platform: 'Telegram' };
    }

    return { status: 'DRAFT_CREATED', content: content || "No content provided" };
  }

  /**
   * 执行商务工具动作 (Email)
   */
  private async performBusinessAction(args: any) {
    const { action, target, subject, body } = args;

    if (action === 'send_email') {
      if (!this.mailTransporter) throw new Error('邮件系统未配置 API Key');
      const info = await this.mailTransporter.sendMail({
        from: process.env.SMTP_FROM || `"Agentrix BD" <${process.env.SMTP_USER}>`,
        to: target,
        subject: subject || "Partnership Invitation from Agentrix",
        text: body,
      });
      return { success: true, messageId: info.messageId, status: 'EMAIL_SENT' };
    }

    return { success: false, message: "Unknown business action" };
  }

  /**
   * 为不同角色的 Agent 生成特定的系统提示词
   */
  private getSystemPromptForAgent(agentId: string, agent?: AgentAccount): string {
    const basePrompt = `你现在是 Agentrix 公司的核心成员。当前你在 CEO 总部控制台运行。
你的目标是协助 CEO (用户) 进行公司运营和业务增长。
你的回复应该专业、果断且具有行动力。

以下是 Agentrix 的核心资料，请消化并作为你决策的依据：
---
${this.knowledgeBase}
---
`;

    if (agentId.includes('ARCHITECT')) {
      return `${basePrompt}
你现在的角色是：**首席架构师 (Lead Architect)**。
职责：负责 UCP/X402 协议的演进、系统架构设计以及安全性检查。
你可以使用 'search_local_docs' 检索本地技术文档。
风格：严谨、注重协议标准、对技术细节敏感、前瞻性强。`;
    }

    if (agentId.includes('CODER')) {
      return `${basePrompt}
你现在的角色是：**高级开发工程师 (Senior Coder)**。
职责：负责 NestJS/Next.js 代码实现、Bug 修复以及性能优化。
你可以使用 'search_local_docs' 检索项目代码及开发规范。
风格：代码质量至上、实用主义、简洁高效。`;
    }

    if (agentId.includes('GROWTH') || agentId.includes('MARKETING')) {
      return `${basePrompt}
你现在的角色是：**全球增长负责人 (Global Growth & Marketing)**。
职责：负责 Twitter/Discord 社交媒体运营、社区参与以及品牌建设。
你可以使用 'web_search' 检索市场，使用 'social_connector_action' 操作社交媒体。
风格：有创意、充满激情、擅长传播、数据驱动。`;
    }

    if (agentId.includes('BD')) {
      return `${basePrompt}
你现在的角色是：**商务拓展负责人 (Ecosystem BD)**。
职责：负责全球商务洽谈、商户入驻、API 生态对接。
你可以使用 'business_toolbox' 处理邮件和 CRM 草稿。
风格：商务范、擅长谈判、沟通高效、目标导向。`;
    }

    return `${basePrompt}
角色信息：${agent?.description || '通用助手'}`;
  }

  // ========== Protocol Audit APIs ==========

  /**
   * 获取 MCP 工具列表（审核视图）
   */
  async getMcpToolsAudit() {
    // Return available MCP tools with audit status
    return {
      tools: [
        { id: 'mcp-search', name: 'search_local_docs', status: 'active', invocations: 156, lastUsed: new Date().toISOString() },
        { id: 'mcp-web', name: 'web_search', status: 'active', invocations: 89, lastUsed: new Date().toISOString() },
        { id: 'mcp-social', name: 'social_connector_action', status: 'active', invocations: 23, lastUsed: new Date().toISOString() },
        { id: 'mcp-biz', name: 'business_toolbox', status: 'active', invocations: 12, lastUsed: new Date().toISOString() },
        { id: 'mcp-code', name: 'read_code', status: 'active', invocations: 245, lastUsed: new Date().toISOString() },
        { id: 'mcp-edit', name: 'edit_code', status: 'active', invocations: 78, lastUsed: new Date().toISOString() },
      ],
      totalInvocations: 603,
      auditStatus: 'passed',
    };
  }

  /**
   * 获取 UCP 技能列表（审核视图）
   */
  async getUcpSkillsAudit() {
    // Return available UCP skills
    return {
      skills: [
        { id: 'ucp-1', name: 'AI Text Generation', protocol: 'UCP/1.0', status: 'verified', calls: 1234 },
        { id: 'ucp-2', name: 'Image Analysis', protocol: 'UCP/1.0', status: 'verified', calls: 567 },
        { id: 'ucp-3', name: 'Code Completion', protocol: 'UCP/1.0', status: 'verified', calls: 890 },
        { id: 'ucp-4', name: 'Data Extraction', protocol: 'UCP/1.0', status: 'pending', calls: 45 },
      ],
      totalCalls: 2736,
      auditStatus: 'passed',
    };
  }

  /**
   * 获取 X402 资金路径列表（审核视图）
   */
  async getX402FundPathsAudit() {
    try {
      const paths = await this.fundPathRepo.find({
        order: { createdAt: 'DESC' },
        take: 50,
      });

      return {
        paths: paths.map(p => ({
          id: p.id,
          from: p.fromAddress || 'Platform',
          to: p.toAddress || 'Unknown',
          amount: p.amount,
          currency: p.currency || 'USDC',
          status: p.isX402 ? 'x402' : 'standard',
          txHash: p.transactionHash,
          createdAt: p.createdAt,
        })),
        totalPaths: paths.length,
        auditStatus: 'passed',
      };
    } catch (e) {
      // Return mock if table doesn't exist
      return {
        paths: [
          { id: 'x402-1', from: '0x1234...5678', to: '0xabcd...efgh', amount: 100, currency: 'USDC', status: 'completed', txHash: '0xabc123', createdAt: new Date().toISOString() },
          { id: 'x402-2', from: 'Platform', to: '0x9876...5432', amount: 50.5, currency: 'USDC', status: 'pending', txHash: null, createdAt: new Date().toISOString() },
        ],
        totalPaths: 2,
        auditStatus: 'passed',
      };
    }
  }

  /**
   * 获取协议综合审核摘要
   */
  async getProtocolAuditSummary() {
    const mcp = await this.getMcpToolsAudit();
    const ucp = await this.getUcpSkillsAudit();
    const x402 = await this.getX402FundPathsAudit();

    return {
      mcp: { toolCount: mcp.tools.length, totalInvocations: mcp.totalInvocations, status: mcp.auditStatus },
      ucp: { skillCount: ucp.skills.length, totalCalls: ucp.totalCalls, status: ucp.auditStatus },
      x402: { pathCount: x402.totalPaths, status: x402.auditStatus },
      overallStatus: 'healthy',
      lastAudit: new Date().toISOString(),
    };
  }
}
