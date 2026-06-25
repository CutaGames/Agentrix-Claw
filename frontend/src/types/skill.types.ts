export enum SkillCategory {
  PAYMENT = 'payment',
  COMMERCE = 'commerce',
  DATA = 'data',
  UTILITY = 'utility',
  INTEGRATION = 'integration',
  CUSTOM = 'custom',
}

export enum SkillStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  DEPRECATED = 'deprecated',
}

export interface SkillInputSchema {
  type: 'object';
  properties: Record<string, {
    type: string;
    description: string;
    required?: boolean;
    enum?: string[];
    default?: any;
    minimum?: number;
    maximum?: number;
  }>;
  required: string[];
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  version: string;
  category: SkillCategory;
  status: SkillStatus;
  inputSchema: SkillInputSchema;
  outputSchema?: any;
  executor: {
    type: 'http' | 'internal';
    endpoint?: string;
    method?: string;
  };
  platformSchemas?: {
    openai?: any;
    claude?: any;
    gemini?: any;
  };
  callCount: number;
  rating: number;
  createdAt: string;
  updatedAt: string;
}
