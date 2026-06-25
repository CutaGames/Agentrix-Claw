import { Controller, Post, Get, Body, UseGuards, Request, Logger, Query, Param, Patch, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { HqService } from './hq.service';
import { DeveloperService } from './developer.service';
// import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'; // 暂时注释掉方便测试，后期开启

@ApiTags('CEO HQ Console')
@Controller('hq')
export class HqController {
  private readonly logger = new Logger(HqController.name);

  constructor(
    private readonly hqService: HqService,
    private readonly developerService: DeveloperService
  ) {}

  // ========== Dashboard APIs (Phase 1) ==========

  @Get('dashboard/stats')
  @ApiOperation({ summary: '获取 Dashboard 统计数据' })
  async getDashboardStats() {
    return this.hqService.getDashboardStats();
  }

  @Get('dashboard/alerts')
  @ApiOperation({ summary: '获取系统告警列表' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getDashboardAlerts(@Query('limit') limit?: string) {
    const alertLimit = limit ? parseInt(limit) : 10;
    return this.hqService.getDashboardAlerts(alertLimit);
  }

  // ========== Agent APIs (Phase 2) ==========

  @Get('agents/status')
  @ApiOperation({ summary: '获取所有 Agent 状态' })
  async getAgentStatuses() {
    return this.hqService.getAgentStatuses();
  }

  @Post('agents/command')
  @ApiOperation({ summary: '向 Agent 发送命令' })
  async sendAgentCommand(@Body() body: { agentId: string; command: string }) {
    return this.hqService.sendAgentCommand(body.agentId, body.command);
  }

  @Get('agents/:agentId')
  @ApiOperation({ summary: '获取单个 Agent 详情' })
  async getAgentDetail(@Param('agentId') agentId: string) {
    return this.hqService.getAgentDetail(agentId);
  }

  // ========== Engine Room APIs (Phase 3) ==========

  @Get('engine/users')
  @ApiOperation({ summary: '获取用户列表' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  async getUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.hqService.getEngineUsers({
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
      status,
    });
  }

  @Patch('engine/users/:userId')
  @ApiOperation({ summary: '更新用户状态' })
  async updateUser(
    @Param('userId') userId: string,
    @Body() body: { status?: string; kycStatus?: string },
  ) {
    return this.hqService.updateEngineUser(userId, body);
  }

  @Get('engine/merchants')
  @ApiOperation({ summary: '获取商户列表' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  async getMerchants(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.hqService.getEngineMerchants({
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
      status,
    });
  }

  @Patch('engine/merchants/:merchantId')
  @ApiOperation({ summary: '更新商户状态' })
  async updateMerchant(
    @Param('merchantId') merchantId: string,
    @Body() body: { status?: string; kycStatus?: string },
  ) {
    return this.hqService.updateEngineMerchant(merchantId, body);
  }

  @Get('engine/products')
  @ApiOperation({ summary: '获取产品列表' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  async getProducts(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.hqService.getEngineProducts({
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
      status,
    });
  }

  @Patch('engine/products/:productId')
  @ApiOperation({ summary: '更新产品状态' })
  async updateProduct(
    @Param('productId') productId: string,
    @Body() body: { status?: string },
  ) {
    return this.hqService.updateEngineProduct(productId, body);
  }

  @Get('engine/risk/alerts')
  @ApiOperation({ summary: '获取风险告警列表' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'severity', required: false, type: String })
  async getRiskAlerts(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('severity') severity?: string,
  ) {
    return this.hqService.getEngineRiskAlerts({
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
      severity,
    });
  }

  @Patch('engine/risk/alerts/:alertId')
  @ApiOperation({ summary: '更新风险告警状态' })
  async updateRiskAlert(
    @Param('alertId') alertId: string,
    @Body() body: { status: string },
  ) {
    return this.hqService.updateEngineRiskAlert(alertId, body.status);
  }

  @Get('engine/finance/transactions')
  @ApiOperation({ summary: '获取交易记录' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'type', required: false, type: String })
  async getTransactions(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('type') type?: string,
  ) {
    return this.hqService.getEngineTransactions({
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
      type,
    });
  }

  @Get('engine/finance/summary')
  @ApiOperation({ summary: '获取财务汇总' })
  async getFinanceSummary() {
    return this.hqService.getEngineFinanceSummary();
  }

  // ========== Chat APIs ==========

  @Post('chat')
  @ApiOperation({ summary: '与总部 Agent 对话' })
  async chat(
    @Request() req,
    @Body() body: {
      agentId: string;
      messages: any[];
      workspaceId?: string;
    },
  ) {
    this.logger.log(`收到总部聊天请求: ${body.agentId}`);
    
    // 如果有认证，从 req.user 获取
    const userId = req.user?.id;
    
    return this.hqService.processHqChat(
      body.agentId, 
      body.messages,
      userId
    );
  }

  @Get('knowledge-base')
  @ApiOperation({ summary: '获取总部知识库内容' })
  async getKnowledgeBase() {
    return { content: this.hqService.getKnowledgeBaseContent() };
  }

  @Post('knowledge-base')
  @ApiOperation({ summary: '更新总部知识库内容' })
  async updateKnowledgeBase(@Body() body: { content: string }) {
    this.hqService.updateKnowledgeBaseContent(body.content);
    return { success: true };
  }

  @Get('rag-files')
  @ApiOperation({ summary: '获取本地 RAG 知识库文件列表' })
  async getRagFiles() {
    return this.hqService.getRagFiles();
  }

  @Post('rag-files/upload')
  @ApiOperation({ summary: '上传 RAG 文件' })
  async uploadRagFile(@Body() body: { filename: string; content: string }) {
    return this.hqService.uploadRagFile(body.filename, body.content);
  }

  @Delete('rag-files/:filename')
  @ApiOperation({ summary: '删除 RAG 文件' })
  async deleteRagFile(@Param('filename') filename: string) {
    return this.hqService.deleteRagFile(filename);
  }

  // === Workspace IDE APIs ===

  @Get('workspace/tree')
  @ApiOperation({ summary: '获取项目文件树结构' })
  async getWorkspaceTree(@Query('path') path?: string, @Query('depth') depth?: string) {
    const maxDepth = depth ? parseInt(depth) : 3;
    return this.developerService.getProjectTree(path || '.', maxDepth);
  }

  @Get('workspace/info')
  @ApiOperation({ summary: '获取项目概览信息' })
  async getWorkspaceInfo() {
    return this.developerService.getProjectInfo();
  }

  @Get('workspace/search')
  @ApiOperation({ summary: '搜索代码' })
  async searchCode(@Query('query') query: string, @Query('pattern') pattern?: string) {
    return this.developerService.searchCode(query, pattern || '*.ts');
  }

  @Post('workspace/read')
  @ApiOperation({ summary: '读取文件内容' })
  async readFile(@Body() body: { path: string }) {
    const content = await this.developerService.readFile(body.path);
    return { path: body.path, content };
  }

  @Post('workspace/write')
  @ApiOperation({ summary: '写入文件内容' })
  async writeFile(@Body() body: { path: string; content: string }) {
    return this.developerService.writeFile(body.path, body.content);
  }

  @Post('workspace/execute')
  @ApiOperation({ summary: '执行终端命令' })
  async executeCommand(@Body() body: { command: string }) {
    return this.developerService.executeCommand(body.command);
  }

  // ========== Protocol Audit APIs ==========

  @Get('protocols/summary')
  @ApiOperation({ summary: '获取协议综合审核摘要' })
  async getProtocolSummary() {
    return this.hqService.getProtocolAuditSummary();
  }

  @Get('protocols/mcp')
  @ApiOperation({ summary: '获取 MCP 工具审核列表' })
  async getMcpTools() {
    return this.hqService.getMcpToolsAudit();
  }

  @Get('protocols/ucp')
  @ApiOperation({ summary: '获取 UCP 技能审核列表' })
  async getUcpSkills() {
    return this.hqService.getUcpSkillsAudit();
  }

  @Get('protocols/x402')
  @ApiOperation({ summary: '获取 X402 资金路径审核列表' })
  async getX402FundPaths() {
    return this.hqService.getX402FundPathsAudit();
  }
}
