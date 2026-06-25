// V2.0: Skill 层级
export type SkillLayer = 'infra' | 'resource' | 'logic' | 'composite';

// V2.0: Skill 来源
export type SkillSource = 'native' | 'imported' | 'converted';

// V2.0: 资源类型
export type SkillResourceType = 'physical' | 'service' | 'digital' | 'data' | 'logic';

// Skill 分类
export type SkillCategory = 
  | 'payment' | 'commerce' | 'data' | 'utility' | 'integration' | 'custom'
  | 'identity' | 'authorization' | 'chain' | 'asset' | 'algorithm' | 'analysis' | 'workflow';

export type SkillStatus = 'draft' | 'published' | 'deprecated';

export type SkillPricingType = 'free' | 'per_call' | 'subscription' | 'revenue_share';
