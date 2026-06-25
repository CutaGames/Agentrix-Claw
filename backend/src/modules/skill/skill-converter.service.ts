import { Injectable } from '@nestjs/common';
import { Skill, SkillInputSchema } from '../../entities/skill.entity';

@Injectable()
export class SkillConverterService {
  /**
   * Convert AX Skill to OpenAI Function / Tool format
   */
  convertToOpenAI(skill: Skill) {
    const { name, description, inputSchema } = skill;
    
    if (!name) {
      throw new Error('Skill name is required for conversion');
    }
    
    const schema = inputSchema || { properties: {}, required: [] };
    
    return {
      type: 'function',
      function: {
        name: name.replace(/[^a-zA-Z0-9_]/g, '_'),
        description: description || '',
        parameters: {
          type: 'object',
          properties: schema.properties || {},
          required: schema.required || [],
        },
      },
    };
  }

  /**
   * Convert AX Skill to Claude MCP (Model Context Protocol) format
   */
  convertToClaude(skill: Skill) {
    const { name, description, inputSchema } = skill;
    
    if (!name) {
      throw new Error('Skill name is required for conversion');
    }
    
    const schema = inputSchema || { properties: {}, required: [] };
    
    return {
      name: name.replace(/[^a-zA-Z0-9_]/g, '_'),
      description: description || '',
      inputSchema: {
        type: 'object',
        properties: schema.properties || {},
        required: schema.required || [],
      },
    };
  }

  /**
   * Convert AX Skill to Gemini Function Declaration
   */
  convertToGemini(skill: Skill) {
    const { name, description, inputSchema } = skill;
    
    if (!name) {
      throw new Error('Skill name is required for conversion');
    }
    
    const schema = inputSchema || { properties: {}, required: [] };
    
    return {
      name: name.replace(/[^a-zA-Z0-9_]/g, '_'),
      description: description || '',
      parameters: {
        type: 'OBJECT',
        properties: schema.properties || {},
        required: schema.required || [],
      },
    };
  }

  /**
   * Convert AX Skill to OpenAPI 3.0 (for custom GPT Actions)
   */
  convertToOpenAPI(skill: Skill) {
    const { name, description, inputSchema, executor } = skill;
    
    if (!name) {
      throw new Error('Skill name is required for conversion');
    }
    
    const safeName = name.replace(/[^a-zA-Z0-9_]/g, '_');
    const schema = inputSchema || { properties: {}, required: [] };
    const exec = executor || { endpoint: '/execute', method: 'POST' };
    
    return {
      openapi: '3.0.0',
      info: {
        title: `${name} API`,
        version: skill.version || '1.0.0',
        description: description || '',
      },
      paths: {
        [exec.endpoint || '/execute']: {
          [exec.method?.toLowerCase() || 'post']: {
            operationId: safeName,
            summary: description || '',
            responses: {
              '200': {
                description: 'Successful response',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                    },
                  },
                },
              },
            },
            ...(exec.method === 'GET' ? {
              parameters: Object.entries(schema.properties || {}).map(([key, val]) => {
                const prop = val as { description?: string; type?: string } | undefined;
                return {
                  name: key,
                  in: 'query',
                  description: prop?.description || '',
                  required: schema.required?.includes(key),
                  schema: { type: prop?.type || 'string' }
                };
              })
            } : {
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: schema.properties || {},
                      required: schema.required || [],
                    },
                  },
                },
              },
            }),
          },
        },
      },
    };
  }
}
