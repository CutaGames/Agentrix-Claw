/**
 * OpenAPI Importer Service
 * 
 * Phase 3: 从 OpenAPI Schema 导入外部 Skill
 */

import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Skill, SkillLayer, SkillCategory, SkillSource, SkillOriginalPlatform, SkillStatus, SkillPricingType } from '../../entities/skill.entity';
import { ExternalSkillMapping, ExternalPlatform, SyncStatus } from '../../entities/external-skill-mapping.entity';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    description?: string;
    version: string;
  };
  servers?: Array<{ url: string; description?: string }>;
  paths: Record<string, Record<string, OpenAPIOperation>>;
  components?: {
    schemas?: Record<string, any>;
    securitySchemes?: Record<string, any>;
  };
}

export interface OpenAPIOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: OpenAPIParameter[];
  requestBody?: {
    required?: boolean;
    content: Record<string, { schema: any }>;
  };
  responses: Record<string, any>;
  security?: any[];
}

export interface OpenAPIParameter {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  required?: boolean;
  description?: string;
  schema: any;
}

export interface ImportConfig {
  source: 'openai_gpt' | 'third_party';
  baseUrl?: string;
  authConfig?: {
    type: 'none' | 'api_key' | 'oauth' | 'bearer';
    apiKey?: string;
    headerName?: string;
  };
  categoryOverride?: SkillCategory;
  tagPrefix?: string;
}

export interface ImportResult {
  success: string[];
  failed: Array<{ operationId: string; error: string }>;
  skills: Skill[];
}

@Injectable()
export class OpenAPIImporterService {
  private readonly logger = new Logger(OpenAPIImporterService.name);

  constructor(
    @InjectRepository(Skill)
    private skillRepository: Repository<Skill>,
    @InjectRepository(ExternalSkillMapping)
    private externalMappingRepository: Repository<ExternalSkillMapping>,
    private configService: ConfigService,
  ) {}

  /**
   * 从 URL 导入 OpenAPI Schema
   */
  async importFromUrl(schemaUrl: string, config: ImportConfig): Promise<ImportResult> {
    this.logger.log(`Importing OpenAPI schema from: ${schemaUrl}`);

    try {
      const response = await axios.get(schemaUrl);
      const spec = response.data as OpenAPISpec;
      return this.importFromSpec(spec, config);
    } catch (error) {
      this.logger.error(`Failed to fetch OpenAPI schema: ${error.message}`);
      throw new HttpException(
        `Failed to fetch OpenAPI schema: ${error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * 从 OpenAPI Spec 对象导入
   */
  async importFromSpec(spec: OpenAPISpec, config: ImportConfig): Promise<ImportResult> {
    this.logger.log(`Importing OpenAPI spec: ${spec.info.title} v${spec.info.version}`);

    const success: string[] = [];
    const failed: Array<{ operationId: string; error: string }> = [];
    const skills: Skill[] = [];

    const baseUrl = config.baseUrl || spec.servers?.[0]?.url || '';

    for (const [path, methods] of Object.entries(spec.paths)) {
      for (const [method, operation] of Object.entries(methods)) {
        if (!this.isValidHttpMethod(method)) continue;

        const operationId = operation.operationId || this.generateOperationId(method, path);

        try {
          const skill = await this.createSkillFromOperation(
            operationId,
            path,
            method.toUpperCase() as 'GET' | 'POST' | 'PUT' | 'DELETE',
            operation,
            baseUrl,
            spec,
            config,
          );
          skills.push(skill);
          success.push(operationId);
        } catch (error) {
          this.logger.error(`Failed to import operation ${operationId}: ${error.message}`);
          failed.push({ operationId, error: error.message });
        }
      }
    }

    this.logger.log(`Import complete: ${success.length} success, ${failed.length} failed`);
    return { success, failed, skills };
  }

  /**
   * 从 GPT Action 配置导入
   */
  async importFromGPTAction(actionConfig: {
    name: string;
    description: string;
    schemaUrl: string;
    authConfig?: ImportConfig['authConfig'];
  }): Promise<Skill> {
    const result = await this.importFromUrl(actionConfig.schemaUrl, {
      source: 'openai_gpt',
      authConfig: actionConfig.authConfig,
      tagPrefix: 'gpt_action',
    });

    if (result.skills.length === 0) {
      throw new HttpException(
        'No operations found in GPT Action schema',
        HttpStatus.BAD_REQUEST,
      );
    }

    return result.skills[0];
  }

  /**
   * 创建 Skill 从 OpenAPI Operation
   */
  private async createSkillFromOperation(
    operationId: string,
    path: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    operation: OpenAPIOperation,
    baseUrl: string,
    spec: OpenAPISpec,
    config: ImportConfig,
  ): Promise<Skill> {
    // 检查是否已存在
    const existingMapping = await this.externalMappingRepository.findOne({
      where: {
        externalPlatform: this.getExternalPlatform(config.source),
        externalId: operationId,
      },
    });

    if (existingMapping) {
      const existingSkill = await this.skillRepository.findOne({
        where: { id: existingMapping.agentrixSkillId },
      });
      if (existingSkill) {
        return this.updateSkillFromOperation(existingSkill, operation, config);
      }
    }

    // 生成输入 Schema
    const inputSchema = this.generateInputSchema(operation, spec);

    // 生成输出 Schema
    const outputSchema = this.generateOutputSchema(operation, spec);

    // 创建 Skill
    const skill = new Skill();
    skill.name = this.sanitizeName(operationId);
    skill.displayName = operation.summary || this.formatDisplayName(operationId);
    skill.description = operation.description || operation.summary || `API: ${method} ${path}`;
    skill.layer = SkillLayer.LOGIC;
    skill.category = config.categoryOverride || this.inferCategory(operation);
    skill.source = SkillSource.IMPORTED;
    skill.originalPlatform = config.source === 'openai_gpt' 
      ? SkillOriginalPlatform.OPENAI 
      : SkillOriginalPlatform.THIRD_PARTY;
    skill.status = SkillStatus.PUBLISHED;
    skill.humanAccessible = true;
    skill.tags = this.generateTags(operation, config);
    skill.inputSchema = inputSchema;
    skill.outputSchema = outputSchema;
    skill.executor = {
      type: 'http',
      endpoint: `${baseUrl}${path}`,
      method,
      // #2 ②:把导入时提供的鉴权烘焙进 executor.headers,使 executeHttpSkill 调三方
      // 带鉴权 API 时直接带上 key/token(此前缺失导致带鉴权的三方 API 调不通)。
      headers: this.buildAuthHeaders(config.authConfig),
    };
    skill.pricing = {
      type: SkillPricingType.FREE,
      currency: 'USD',
    };
    skill.platformSchemas = {
      openai: this.generateOpenAISchema(operationId, operation, inputSchema),
    };
    skill.authorInfo = {
      id: 'external',
      name: spec.info.title,
      type: 'developer',
    };

    const savedSkill = await this.skillRepository.save(skill);

    // 创建外部映射
    const mapping = new ExternalSkillMapping();
    mapping.agentrixSkillId = savedSkill.id;
    mapping.externalPlatform = this.getExternalPlatform(config.source);
    mapping.externalId = operationId;
    mapping.externalName = operation.summary || operationId;
    mapping.externalEndpoint = `${baseUrl}${path}`;
    mapping.originalSchema = { path, method, operation };
    mapping.proxyConfig = {
      enabled: true,
      authType: config.authConfig?.type || 'none',
      authConfig: config.authConfig,
    };
    mapping.syncStatus = SyncStatus.ACTIVE;
    mapping.lastSyncedAt = new Date();

    await this.externalMappingRepository.save(mapping);

    return savedSkill;
  }

  /**
   * 更新已存在的 Skill
   */
  private async updateSkillFromOperation(
    skill: Skill,
    operation: OpenAPIOperation,
    config: ImportConfig,
  ): Promise<Skill> {
    skill.description = operation.description || operation.summary || skill.description;
    skill.displayName = operation.summary || skill.displayName;
    return this.skillRepository.save(skill);
  }

  /**
   * 生成输入 Schema
   */
  private generateInputSchema(operation: OpenAPIOperation, spec: OpenAPISpec): any {
    const properties: Record<string, any> = {};
    const required: string[] = [];

    // 处理 parameters
    if (operation.parameters) {
      for (const param of operation.parameters) {
        properties[param.name] = {
          type: param.schema?.type || 'string',
          description: param.description || param.name,
        };
        if (param.required) {
          required.push(param.name);
        }
      }
    }

    // 处理 requestBody
    if (operation.requestBody?.content) {
      const jsonContent = operation.requestBody.content['application/json'];
      if (jsonContent?.schema) {
        const bodySchema = this.resolveSchema(jsonContent.schema, spec);
        if (bodySchema.properties) {
          Object.assign(properties, bodySchema.properties);
          if (bodySchema.required) {
            required.push(...bodySchema.required);
          }
        }
      }
    }

    return {
      type: 'object',
      properties,
      required,
    };
  }

  /**
   * 生成输出 Schema
   */
  private generateOutputSchema(operation: OpenAPIOperation, spec: OpenAPISpec): any {
    const successResponse = operation.responses['200'] || operation.responses['201'];
    if (successResponse?.content?.['application/json']?.schema) {
      return this.resolveSchema(successResponse.content['application/json'].schema, spec);
    }
    return { type: 'object', properties: {} };
  }

  /**
   * 解析 Schema 引用
   */
  private resolveSchema(schema: any, spec: OpenAPISpec): any {
    if (schema.$ref) {
      const refPath = schema.$ref.replace('#/components/schemas/', '');
      return spec.components?.schemas?.[refPath] || schema;
    }
    return schema;
  }

  /**
   * 生成 OpenAI 兼容的 Schema
   */
  private generateOpenAISchema(operationId: string, operation: OpenAPIOperation, inputSchema: any): any {
    return {
      type: 'function',
      function: {
        name: this.sanitizeName(operationId),
        description: operation.description || operation.summary || operationId,
        parameters: inputSchema,
      },
    };
  }

  /**
   * 推断分类
   */
  private inferCategory(operation: OpenAPIOperation): SkillCategory {
    const tags = operation.tags || [];
    const description = (operation.description || '').toLowerCase();

    if (tags.includes('payment') || description.includes('payment')) {
      return SkillCategory.PAYMENT;
    }
    if (tags.includes('data') || description.includes('data')) {
      return SkillCategory.DATA;
    }
    if (tags.includes('commerce') || description.includes('commerce')) {
      return SkillCategory.COMMERCE;
    }
    return SkillCategory.INTEGRATION;
  }

  /**
   * 生成标签
   */
  private generateTags(operation: OpenAPIOperation, config: ImportConfig): string[] {
    const tags = ['imported', config.source];
    if (config.tagPrefix) {
      tags.push(config.tagPrefix);
    }
    if (operation.tags) {
      tags.push(...operation.tags);
    }
    return [...new Set(tags)];
  }

  /**
   * 获取外部平台枚举
   */
  private getExternalPlatform(source: string): ExternalPlatform {
    switch (source) {
      case 'openai_gpt':
        return ExternalPlatform.OPENAI_GPT;
      default:
        return ExternalPlatform.OTHER;
    }
  }

  /**
   * 验证 HTTP 方法
   */
  private isValidHttpMethod(method: string): boolean {
    return ['get', 'post', 'put', 'delete', 'patch'].includes(method.toLowerCase());
  }

  /**
   * 生成 Operation ID
   */
  private generateOperationId(method: string, path: string): string {
    const cleanPath = path
      .replace(/\{([^}]+)\}/g, 'By$1')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
    return `${method.toLowerCase()}_${cleanPath}`;
  }

  /**
   * 清理名称
   */
  private sanitizeName(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .toLowerCase();
  }

  /**
   * 格式化显示名称
   */
  private formatDisplayName(name: string): string {
    return name
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * #2 ②:把导入鉴权配置转成实际请求头。
   *   - bearer:Authorization: Bearer <key>
   *   - api_key:自定义头名(headerName,默认 X-API-Key): <key>
   *   - none/oauth:不在此处注入(oauth 需用户态 token 交换,后续接 oauth 流程)。
   * 注意:apiKey 明文存入 executor.headers(jsonb)。MVP 接受;生产应走密钥保管箱 + 运行时注入。
   */
  private buildAuthHeaders(authConfig?: ImportConfig['authConfig']): Record<string, string> | undefined {
    if (!authConfig || authConfig.type === 'none' || !authConfig.apiKey) return undefined;
    if (authConfig.type === 'bearer') {
      return { Authorization: `Bearer ${authConfig.apiKey}` };
    }
    if (authConfig.type === 'api_key') {
      const headerName = authConfig.headerName?.trim() || 'X-API-Key';
      return { [headerName]: authConfig.apiKey };
    }
    return undefined;
  }
}
