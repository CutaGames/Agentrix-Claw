export type CreationQualityDimension = 'structure' | 'commerce' | 'visual' | 'machine' | 'coherence';
export interface CreationQualityCriterionResult {
    dimension: CreationQualityDimension;
    pass: boolean;
    score?: number;
    reasons: string[];
}
export interface CreationQualityResult {
    pass: boolean;
    overallScore: number;
    failed: CreationQualityCriterionResult[];
    passed: CreationQualityCriterionResult[];
}
export interface CreationQualityInput {
    creationId: string;
    type: import('./creation').CreationType;
    title?: string | null;
    summary?: string | null;
    preview?: import('./creation').CreationPreview | null;
    offerings: import('./creation').Offering[];
    manifestToolCount: number;
    ecsEntityCount?: number;
    previewIsPlaceholder?: boolean;
}
export interface CreationQualityCriterion {
    evaluate(input: CreationQualityInput): CreationQualityResult;
}
