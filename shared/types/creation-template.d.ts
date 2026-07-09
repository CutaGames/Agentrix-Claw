import type { CreationType } from './creation';
export type CreationTemplateType = Extract<CreationType, 'shop' | 'place'>;
export type TemplateSlotType = 'text' | 'number' | 'image' | 'offeringList' | 'enum';
export interface TemplateSlot {
    key: string;
    type: TemplateSlotType;
    required: boolean;
    default?: unknown;
    constraint?: Record<string, unknown>;
}
export interface CreationTemplate {
    id: string;
    type: CreationTemplateType;
    version: number;
    slots: TemplateSlot[];
    themeSkin: string;
    copySkeleton: Record<string, string>;
    coverStylePrompt: string;
    aestheticBaselinePassed: boolean;
}
export interface SlotFillResult {
    filled: Record<string, unknown>;
    missingRequired: string[];
}
export interface TemplateSlotResolver {
    pickTemplate(prompt: string, hintType?: CreationType): Promise<CreationTemplate>;
    fillSlots(prompt: string, data: Record<string, unknown>, tpl: CreationTemplate): Promise<SlotFillResult>;
}
