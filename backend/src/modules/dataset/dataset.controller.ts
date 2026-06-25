import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpStatus,
  HttpCode,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DatasetService } from './dataset.service';

@ApiTags('Dataset')
@Controller('datasets')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DatasetController {
  constructor(private readonly datasetService: DatasetService) {}

  @Get()
  @ApiOperation({ summary: '获取数据集列表' })
  @ApiResponse({ status: 200, description: '获取成功' })
  async getDatasets(
    @Request() req,
    @Query('status') status?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.datasetService.getDatasets(req.user.id, { status, page, limit });
  }

  @Get('my')
  @ApiOperation({ summary: '获取我的数据集' })
  @ApiResponse({ status: 200, description: '获取成功' })
  async getMyDatasets(@Request() req) {
    return this.datasetService.getMyDatasets(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取数据集详情' })
  @ApiResponse({ status: 200, description: '获取成功' })
  @ApiResponse({ status: 404, description: '数据集不存在' })
  async getDataset(@Param('id') id: string, @Request() req) {
    const dataset = await this.datasetService.getDataset(id, req.user.id);
    if (!dataset) {
      throw new NotFoundException('Dataset not found');
    }
    return dataset;
  }

  @Post()
  @ApiOperation({ summary: '创建数据集' })
  @ApiResponse({ status: 201, description: '创建成功' })
  async createDataset(
    @Request() req,
    @Body() body: {
      name: string;
      description?: string;
      schema?: any;
      privacyLevel?: number;
    },
  ) {
    return this.datasetService.createDataset(req.user.id, body);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新数据集' })
  @ApiResponse({ status: 200, description: '更新成功' })
  async updateDataset(
    @Param('id') id: string,
    @Request() req,
    @Body() body: {
      name?: string;
      description?: string;
      privacyLevel?: number;
    },
  ) {
    return this.datasetService.updateDataset(id, req.user.id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除数据集' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteDataset(@Param('id') id: string, @Request() req) {
    await this.datasetService.deleteDataset(id, req.user.id);
  }

  @Post(':id/upload')
  @ApiOperation({ summary: '上传数据' })
  @ApiResponse({ status: 200, description: '上传成功' })
  async uploadData(
    @Param('id') id: string,
    @Request() req,
    @Body() body: {
      format: string;
      url?: string;
      data?: any;
    },
  ) {
    return this.datasetService.uploadData(id, req.user.id, body);
  }

  @Post(':id/vectorize/start')
  @ApiOperation({ summary: '开始向量化' })
  @ApiResponse({ status: 200, description: '已启动' })
  async startVectorization(@Param('id') id: string, @Request() req) {
    return this.datasetService.startVectorization(id, req.user.id);
  }

  @Post(':id/vectorize/stop')
  @ApiOperation({ summary: '停止向量化' })
  @ApiResponse({ status: 200, description: '已停止' })
  async stopVectorization(@Param('id') id: string, @Request() req) {
    return this.datasetService.stopVectorization(id, req.user.id);
  }

  @Get(':id/vectorize/progress')
  @ApiOperation({ summary: '获取向量化进度' })
  @ApiResponse({ status: 200, description: '获取成功' })
  async getVectorizationProgress(@Param('id') id: string, @Request() req) {
    return this.datasetService.getVectorizationProgress(id, req.user.id);
  }

  @Post(':id/query')
  @ApiOperation({ summary: '查询数据集' })
  @ApiResponse({ status: 200, description: '查询成功' })
  async queryDataset(
    @Param('id') id: string,
    @Request() req,
    @Body() body: {
      query: string;
      filters?: any;
      limit?: number;
    },
  ) {
    return this.datasetService.queryDataset(id, req.user.id, body);
  }

  @Put(':id/privacy')
  @ApiOperation({ summary: '更新隐私设置' })
  @ApiResponse({ status: 200, description: '更新成功' })
  async updatePrivacy(
    @Param('id') id: string,
    @Request() req,
    @Body() body: {
      level: number;
    },
  ) {
    return this.datasetService.updatePrivacy(id, req.user.id, body.level);
  }

  @Get(':id/privacy/preview')
  @ApiOperation({ summary: '预览隐私设置效果' })
  @ApiResponse({ status: 200, description: '获取成功' })
  async getPrivacyPreview(
    @Param('id') id: string,
    @Request() req,
    @Query('level') level: number,
  ) {
    return this.datasetService.getPrivacyPreview(id, req.user.id, level);
  }
}
