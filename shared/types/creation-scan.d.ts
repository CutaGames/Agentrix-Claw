import type { CreationPreview } from './creation';
export type ScanAssetGenerationStatus = 'card_ready' | 'mesh_pending' | 'complete' | 'mesh_failed';
export interface ScanAssetGenResult {
    assetId?: string | null;
    name?: string | null;
    category?: string | null;
    styleType?: string | null;
    generationStatus?: ScanAssetGenerationStatus | null;
    styledMeshUrl?: string | null;
    styledPortraitUrl?: string | null;
    rawPhotoUrl?: string | null;
    rawMeshUrl?: string | null;
    semanticComplete?: boolean;
}
export interface QualityGateResult {
    pass: boolean;
    reasons?: string[];
}
export interface ScanQualityCriterion {
    evaluate(result: ScanAssetGenResult): QualityGateResult;
}
export interface CreationScanMaterial {
    sourceAssetId?: string | null;
    name: string;
    category: string;
    styledMeshUrl?: string | null;
    styledPortraitUrl?: string | null;
    styleType?: string | null;
}
export type ScanIntakeStatus = 'accepted' | 'needs_restyle';
export interface ScanIntakeResult {
    accepted: boolean;
    status: ScanIntakeStatus;
    reasons?: string[];
    material?: CreationScanMaterial;
    preview?: CreationPreview;
}
