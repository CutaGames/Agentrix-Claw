/**
 * Skill SDK Service - P3: SDK 自动投影
 * 
 * 核心功能：
 * 1. 将第三方开发者的普通函数自动转换为合规的 Skill 实体
 * 2. 自动生成 MCP Tool Schema 和 OpenAPI Schema
 * 3. 支持装饰器模式和配置文件模式
 */

import { Injectable, Logger } from '@nestjs/common';
import { SkillService } from './skill.service';
import { 
  Skill, 
  SkillCategory, 
  SkillStatus, 
  SkillPricingType,
  SkillInputSchema,
  SkillExecutor,
  SkillPricing,
} from '../../entities/skill.entity';

export interface FunctionDefinition {
  name: string;
  description: string;
  parameters: ParameterDefinition[];
  returnType?: string;
  category?: SkillCategory;
  pricing?: {
    type: 'free' | 'per_call' | 'subscription';
    pricePerCall?: number;
    currency?: string;
  };
  endpoint?: string;
  tags?: string[];
}

export interface ParameterDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required?: boolean;
  enum?: string[];
  default?: any;
  minimum?: number;
  maximum?: number;
}

export interface SkillProjectionResult {
  success: boolean;
  skill?: Skill;
  mcpSchema?: any;
  openApiSchema?: any;
  error?: string;
}

export interface BatchProjectionResult {
  success: boolean;
  total: number;
  created: number;
  failed: number;
  results: SkillProjectionResult[];
}

@Injectable()
export class SkillSdkService {
  private readonly logger = new Logger(SkillSdkService.name);

  constructor(
    private readonly skillService: SkillService,
  ) {}

  /**
   * 从函数定义创建 Skill
   */
  async projectFunction(
    authorId: string,
    definition: FunctionDefinition,
    pluginId?: string,
  ): Promise<SkillProjectionResult> {
    try {
      this.logger.log(`Projecting function: ${definition.name}`);

      // 1. 生成 InputSchema
      const inputSchema = this.generateInputSchema(definition.parameters);

      // 2. 生成 Executor
      const executor = this.generateExecutor(definition);

      // 3. 生成 Pricing
      const pricing = this.generatePricing(definition.pricing);

      // 4. 创建 Skill 实体
      const skillData: Partial<Skill> = {
        name: definition.name,
        description: definition.description,
        category: definition.category || SkillCategory.CUSTOM,
        status: SkillStatus.DRAFT,
        inputSchema,
        executor,
        pricing,
        tags: definition.tags || [],
        authorId,
        pluginId,
        metadata: {
          projectedAt: new Date().toISOString(),
          returnType: definition.returnType,
          sdkVersion: '1.0.0',
        },
      };

      const skill = await this.skillService.create(skillData);

      // 5. 生成 MCP Schema
      const mcpSchema = this.generateMcpSchema(skill);

      // 6. 生成 OpenAPI Schema
      const openApiSchema = this.generateOpenApiSchema(skill);

      return {
        success: true,
        skill,
        mcpSchema,
        openApiSchema,
      };
    } catch (error: any) {
      this.logger.error(`Failed to project function ${definition.name}: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 批量投影函数
   */
  async projectFunctions(
    authorId: string,
    definitions: FunctionDefinition[],
    pluginId?: string,
  ): Promise<BatchProjectionResult> {
    const results: SkillProjectionResult[] = [];
    let created = 0;
    let failed = 0;

    for (const definition of definitions) {
      const result = await this.projectFunction(authorId, definition, pluginId);
      results.push(result);
      if (result.success) {
        created++;
      } else {
        failed++;
      }
    }

    return {
      success: failed === 0,
      total: definitions.length,
      created,
      failed,
      results,
    };
  }

  /**
   * 从 TypeScript 类型定义解析函数
   * 支持 JSDoc 注释提取描述
   */
  parseTypeScriptFunction(code: string): FunctionDefinition | null {
    try {
      // 简单的正则解析（生产环境应使用 TypeScript Compiler API）
      const functionMatch = code.match(
        /(?:\/\*\*[\s\S]*?\*\/\s*)?(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)\s*(?::\s*([^{]+))?\s*\{/
      );

      if (!functionMatch) {
        return null;
      }

      const [, name, paramsStr, returnType] = functionMatch;

      // 提取 JSDoc 描述
      const jsdocMatch = code.match(/\/\*\*\s*([\s\S]*?)\s*\*\//);
      let description = name;
      const paramDescriptions: Record<string, string> = {};

      if (jsdocMatch) {
        const jsdocContent = jsdocMatch[1];
        
        // 提取主描述
        const descMatch = jsdocContent.match(/^\s*\*?\s*([^@\n]+)/m);
        if (descMatch) {
          description = descMatch[1].trim();
        }

        // 提取参数描述
        const paramMatches = jsdocContent.matchAll(/@param\s+(?:\{[^}]+\}\s+)?(\w+)\s+(.+)/g);
        for (const match of paramMatches) {
          paramDescriptions[match[1]] = match[2].trim();
        }
      }

      // 解析参数
      const parameters: ParameterDefinition[] = [];
      if (paramsStr.trim()) {
        const paramParts = paramsStr.split(',');
        for (const part of paramParts) {
          const paramMatch = part.trim().match(/(\w+)(?:\?)?(?::\s*(\w+))?(?:\s*=\s*(.+))?/);
          if (paramMatch) {
            const [, paramName, paramType, defaultValue] = paramMatch;
            parameters.push({
              name: paramName,
              type: this.mapTsTypeToJsonType(paramType || 'any'),
              description: paramDescriptions[paramName] || paramName,
              required: !part.includes('?') && !defaultValue,
              default: defaultValue ? this.parseDefaultValue(defaultValue) : undefined,
            });
          }
        }
      }

      return {
        name,
        description,
        parameters,
        returnType: returnType?.trim(),
      };
    } catch (error: any) {
      this.logger.error(`Failed to parse TypeScript function: ${error.message}`);
      return null;
    }
  }

  /**
   * 从配置文件创建 Skills
   */
  async projectFromConfig(
    authorId: string,
    config: {
      skills: FunctionDefinition[];
      pluginId?: string;
      defaultCategory?: SkillCategory;
      defaultPricing?: FunctionDefinition['pricing'];
    },
  ): Promise<BatchProjectionResult> {
    const definitions = config.skills.map(skill => ({
      ...skill,
      category: skill.category || config.defaultCategory,
      pricing: skill.pricing || config.defaultPricing,
    }));

    return this.projectFunctions(authorId, definitions, config.pluginId);
  }

  /**
   * 生成 InputSchema
   */
  private generateInputSchema(parameters: ParameterDefinition[]): SkillInputSchema {
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const param of parameters) {
      properties[param.name] = {
        type: param.type,
        description: param.description,
      };

      if (param.enum) {
        properties[param.name].enum = param.enum;
      }
      if (param.default !== undefined) {
        properties[param.name].default = param.default;
      }
      if (param.minimum !== undefined) {
        properties[param.name].minimum = param.minimum;
      }
      if (param.maximum !== undefined) {
        properties[param.name].maximum = param.maximum;
      }

      if (param.required) {
        required.push(param.name);
      }
    }

    return {
      type: 'object',
      properties,
      required,
    };
  }

  /**
   * 生成 Executor 配置
   */
  private generateExecutor(definition: FunctionDefinition): SkillExecutor {
    if (definition.endpoint) {
      return {
        type: 'http',
        endpoint: definition.endpoint,
        method: 'POST',
      };
    }

    // 默认使用内部处理器
    return {
      type: 'internal',
      internalHandler: definition.name,
    };
  }

  /**
   * 生成 Pricing 配置
   */
  private generatePricing(pricing?: FunctionDefinition['pricing']): SkillPricing {
    if (!pricing) {
      return { type: SkillPricingType.FREE };
    }

    return {
      type: pricing.type === 'per_call' 
        ? SkillPricingType.PER_CALL 
        : pricing.type === 'subscription'
          ? SkillPricingType.SUBSCRIPTION
          : SkillPricingType.FREE,
      pricePerCall: pricing.pricePerCall,
      currency: pricing.currency || 'USD',
    };
  }

  /**
   * 生成 MCP Tool Schema
   */
  private generateMcpSchema(skill: Skill): any {
    return {
      name: skill.name.replace(/[^a-zA-Z0-9_]/g, '_'),
      description: skill.description,
      inputSchema: {
        type: 'object',
        properties: skill.inputSchema.properties,
        required: skill.inputSchema.required,
      },
    };
  }

  /**
   * 生成 OpenAPI Schema
   */
  private generateOpenApiSchema(skill: Skill): any {
    return {
      [`/api/skills/${skill.id}/execute`]: {
        post: {
          operationId: skill.name.replace(/[^a-zA-Z0-9_]/g, '_'),
          summary: skill.description,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: skill.inputSchema.properties,
                  required: skill.inputSchema.required,
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Successful execution',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: { type: 'object' },
                      executionTime: { type: 'number' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
  }

  /**
   * 映射 TypeScript 类型到 JSON Schema 类型
   */
  private mapTsTypeToJsonType(tsType: string): ParameterDefinition['type'] {
    const typeMap: Record<string, ParameterDefinition['type']> = {
      'string': 'string',
      'number': 'number',
      'boolean': 'boolean',
      'object': 'object',
      'any': 'object',
      'Array': 'array',
      'array': 'array',
    };
    return typeMap[tsType] || 'string';
  }

  /**
   * 解析默认值
   */
  private parseDefaultValue(value: string): any {
    const trimmed = value.trim();
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (trimmed === 'null') return null;
    if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
    if (/^\d+\.\d+$/.test(trimmed)) return parseFloat(trimmed);
    if (trimmed.startsWith("'") || trimmed.startsWith('"')) {
      return trimmed.slice(1, -1);
    }
    return trimmed;
  }

  /**
   * 导出 Skill 为 SDK 配置文件
   */
  async exportToConfig(skillIds: string[]): Promise<{ skills: FunctionDefinition[] }> {
    const skills: FunctionDefinition[] = [];

    for (const id of skillIds) {
      try {
        const skill = await this.skillService.findById(id);
        
        const parameters: ParameterDefinition[] = Object.entries(skill.inputSchema.properties).map(
          ([name, prop]: [string, any]) => ({
            name,
            type: prop.type,
            description: prop.description || name,
            required: skill.inputSchema.required?.includes(name),
            enum: prop.enum,
            default: prop.default,
            minimum: prop.minimum,
            maximum: prop.maximum,
          })
        );

        skills.push({
          name: skill.name,
          description: skill.description,
          parameters,
          category: skill.category,
          pricing: skill.pricing ? {
            type: skill.pricing.type === SkillPricingType.PER_CALL 
              ? 'per_call' 
              : skill.pricing.type === SkillPricingType.SUBSCRIPTION
                ? 'subscription'
                : 'free',
            pricePerCall: skill.pricing.pricePerCall,
            currency: skill.pricing.currency,
          } : undefined,
          endpoint: skill.executor.type === 'http' ? skill.executor.endpoint : undefined,
          tags: skill.tags,
        });
      } catch (e) {
        this.logger.warn(`Failed to export skill ${id}`);
      }
    }

    return { skills };
  }
}
