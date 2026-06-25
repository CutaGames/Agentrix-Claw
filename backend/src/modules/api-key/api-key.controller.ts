import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiKeyService } from './api-key.service';
import { ApiKeyMode } from '../../entities/api-key.entity';

/**
 * API Key 管理控制器
 */
@ApiTags('API Keys')
@Controller('api-keys')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ApiKeyController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  /**
   * 创建新的 API Key
   */
  @Post()
  @ApiOperation({ summary: '创建 API Key', description: '生成新的 API Key，用于第三方应用访问' })
  @ApiResponse({ status: 201, description: 'API Key 创建成功' })
  async createApiKey(
    @Request() req: any,
    @Body() body: {
      name: string;
      expiresInDays?: number;
      scopes?: string[];
      mode?: ApiKeyMode;
    },
  ) {
    try {
      const { apiKey, apiKeyRecord } = await this.apiKeyService.createApiKey(
        req.user.id,
        body.name,
        {
          expiresInDays: body.expiresInDays,
          scopes: body.scopes,
          mode: body.mode,
        },
      );

      return {
        success: true,
        message: 'API Key 创建成功。请立即保存，此 Key 只显示一次！',
        data: {
          id: apiKeyRecord.id,
          apiKey: apiKey, // 只有这一次返回完整的 Key
          name: apiKeyRecord.name,
          keyPrefix: apiKeyRecord.keyPrefix,
          mode: apiKeyRecord.mode,
          scopes: apiKeyRecord.scopes,
          expiresAt: apiKeyRecord.expiresAt,
          createdAt: apiKeyRecord.createdAt,
        },
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          error: 'CREATE_FAILED',
          message: error.message || '创建 API Key 失败',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 获取用户的所有 API Keys
   */
  @Get()
  @ApiOperation({ summary: '获取 API Keys 列表', description: '获取当前用户的所有 API Keys' })
  @ApiResponse({ status: 200, description: 'API Keys 列表' })
  async getApiKeys(@Request() req: any) {
    const apiKeys = await this.apiKeyService.getUserApiKeys(req.user.id);

    return {
      success: true,
      data: apiKeys.map((key) => ({
        id: key.id,
        name: key.name,
        keyPrefix: key.keyPrefix,
        status: key.status,
        mode: key.mode,
        scopes: key.scopes,
        lastUsedAt: key.lastUsedAt,
        usageCount: key.usageCount,
        expiresAt: key.expiresAt,
        createdAt: key.createdAt,
      })),
    };
  }

  /**
   * 撤销 API Key
   */
  @Post(':id/revoke')
  @ApiOperation({ summary: '撤销 API Key', description: '撤销指定的 API Key，使其失效' })
  @ApiResponse({ status: 200, description: 'API Key 已撤销' })
  async revokeApiKey(@Request() req: any, @Param('id') id: string) {
    try {
      await this.apiKeyService.revokeApiKey(req.user.id, id);

      return {
        success: true,
        message: 'API Key 已撤销',
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          error: 'REVOKE_FAILED',
          message: error.message || '撤销 API Key 失败',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * 删除 API Key
   */
  @Delete(':id')
  @ApiOperation({ summary: '删除 API Key', description: '永久删除指定的 API Key' })
  @ApiResponse({ status: 200, description: 'API Key 已删除' })
  async deleteApiKey(@Request() req: any, @Param('id') id: string) {
    try {
      await this.apiKeyService.deleteApiKey(req.user.id, id);

      return {
        success: true,
        message: 'API Key 已删除',
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          error: 'DELETE_FAILED',
          message: error.message || '删除 API Key 失败',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
