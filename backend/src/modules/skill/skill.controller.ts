import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SkillService } from './skill.service';
import { SkillReviewService } from './skill-review.service';
import { OpenAPIImporterService, ImportConfig } from './openapi-importer.service';
import { EcosystemImporterService } from './ecosystem-importer.service';
import { Skill, SkillStatus } from '../../entities/skill.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('skills')
export class SkillController {
  constructor(
    private readonly skillService: SkillService,
    private readonly skillReviewService: SkillReviewService,
    private readonly openApiImporter: OpenAPIImporterService,
    private readonly ecosystemImporter: EcosystemImporterService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() createSkillDto: Partial<Skill>, @Request() req: any) {
    return this.skillService.create(createSkillDto, req.user?.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('import-openapi')
  importOpenApi(@Body() body: { url: string; config?: ImportConfig }) {
    return this.openApiImporter.importFromUrl(body.url, body.config || { source: 'third_party' });
  }

  @UseGuards(JwtAuthGuard)
  @Get('my')
  findMySkills(
    @Request() req: any,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.skillService.findByAuthor(req.user?.id, parseInt(page), parseInt(limit));
  }

  @Get('marketplace')
  findMarketplace(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('category') category?: string,
    @Query('search') search?: string,
  ) {
    return this.skillService.findMarketplace(parseInt(page), parseInt(limit), category, search);
  }

  @Get()
  findAll(
    @Query('status') status?: SkillStatus,
    @Query('view') view?: 'summary' | 'full',
    @Query('page') page = '1',
    @Query('limit') limit?: string,
  ) {
    const parsedPage = Math.max(1, Number.parseInt(page, 10) || 1);
    const parsedLimit = limit ? Math.max(1, Number.parseInt(limit, 10) || 1) : undefined;
    return this.skillService.findAll(status, view === 'full' ? 'full' : 'summary', parsedPage, parsedLimit);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.skillService.findOne(id);
  }

  @Get(':id/stats')
  async getSkillStats(@Param('id') id: string) {
    return this.skillService.getSkillStats(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateSkillDto: Partial<Skill>) {
    return this.skillService.update(id, updateSkillDto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.skillService.remove(id);
  }

  @Get(':id/pack/:platform')
  generatePack(
    @Param('id') id: string,
    @Param('platform') platform: 'openai' | 'claude' | 'gemini' | 'openapi',
  ) {
    return this.skillService.generatePack(id, platform);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/publish')
  publish(@Param('id') id: string) {
    return this.skillService.publish(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/submit-review')
  submitReview(@Param('id') id: string, @Request() req: any) {
    return this.skillService.submitForReview(id, req.user?.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/approve')
  approveSkill(@Param('id') id: string, @Request() req: any) {
    return this.skillService.approveSkill(id, req.user?.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/reject')
  rejectSkill(@Param('id') id: string, @Body() body: { reason: string }, @Request() req: any) {
    return this.skillService.rejectSkill(id, body.reason, req.user?.id);
  }

  // ========== 生态导入 API ==========

  @Get('ecosystem/mcp-servers')
  getAvailableMCPServers() {
    return this.ecosystemImporter.getAvailableMCPServers();
  }

  @Get('ecosystem/chatgpt-actions')
  getAvailableChatGPTActions() {
    return this.ecosystemImporter.getAvailableChatGPTActions();
  }

  @UseGuards(JwtAuthGuard)
  @Post('ecosystem/import-mcp')
  importFromClaudeMCP(@Body() body: { serverIds?: string[] }) {
    return this.ecosystemImporter.importFromClaudeMCP(body.serverIds);
  }

  @UseGuards(JwtAuthGuard)
  @Post('ecosystem/import-chatgpt')
  importFromChatGPTActions(@Body() body: { actionIds?: string[] }) {
    return this.ecosystemImporter.importFromChatGPTActions(body.actionIds);
  }

  @UseGuards(JwtAuthGuard)
  @Post('ecosystem/sync')
  syncEcosystemSkills() {
    return this.ecosystemImporter.syncAllEcosystemSkills();
  }

  // ========== 用户技能安装管理 API ==========

  @UseGuards(JwtAuthGuard)
  @Get('installed')
  findUserInstalledSkills(
    @Request() req: any,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.skillService.findUserInstalledSkills(req.user?.id, parseInt(page), parseInt(limit));
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/install')
  @HttpCode(HttpStatus.OK)
  installSkill(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body?: { config?: Record<string, any> },
  ) {
    return this.skillService.installSkill(req.user?.id, id, body?.config);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/install')
  @HttpCode(HttpStatus.NO_CONTENT)
  uninstallSkill(
    @Request() req: any,
    @Param('id') id: string,
  ) {
    return this.skillService.uninstallSkill(req.user?.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/install')
  updateInstalledSkill(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { isEnabled?: boolean; config?: Record<string, any> },
  ) {
    return this.skillService.updateInstalledSkill(req.user?.id, id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/installed')
  async checkSkillInstalled(
    @Request() req: any,
    @Param('id') id: string,
  ) {
    const installed = await this.skillService.isSkillInstalled(req.user?.id, id);
    return { installed };
  }

  // ========== 用户评价 API ==========

  @Get(':id/reviews')
  async getSkillReviews(
    @Param('id') id: string,
    @Query('page') page = '1',
  ) {
    return this.skillReviewService.getReviews(id, parseInt(page));
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/reviews')
  async submitSkillReview(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: { rating: number; comment: string },
  ) {
    return this.skillReviewService.submitReview(id, req.user.id, body);
  }

  // ========== V2.0 Playground API ==========

  /**
   * Playground 演练场 - 允许用户在购买前对"逻辑类"能力进行在线参数调试（Dry-run）
   * 仅支持 logic 层的 Skill
   */
  @Post(':id/playground')
  @HttpCode(HttpStatus.OK)
  async playground(
    @Param('id') id: string,
    @Body() body: { params?: Record<string, any>; dryRun?: boolean },
  ) {
    return this.skillService.executePlayground(id, body.params || {}, body.dryRun !== false);
  }
}
