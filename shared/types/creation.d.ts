import type { SubstrateTier } from './world-creation';
import type { AeonPlotPoi } from './aeon-world';
export type CreationType = 'game' | 'shop' | 'livestream' | 'stage' | 'place' | 'drama';
export type CreationStatus = 'draft' | 'under_review' | 'published' | 'listed' | 'unpublished' | 'suspended';
export type CreationAuthorType = 'user' | 'agent';
export type CreationPreviewKind = 'cover' | 'video' | 'replay' | 'first_frame';
export interface CreationPreview {
    kind: CreationPreviewKind;
    url: string;
    thumbnailUrl?: string;
    width?: number;
    height?: number;
    durationMs?: number;
}
export type OfferingKind = 'product' | 'service' | 'ticket' | 'subscription' | 'tip';
export type CreationVerb = 'query' | 'order' | 'book' | 'message' | 'subscribe' | 'donate';
export interface Offering {
    id: string;
    kind: OfferingKind;
    name: string;
    description?: string;
    price?: {
        axp?: number;
        usd?: number;
    };
    verbs: CreationVerb[];
    availability?: {
        stock?: number;
        schedule?: {
            startsAt: number;
            endsAt?: number;
        }[];
        capacity?: number;
    };
    derivedFromEntityId?: string;
}
export interface McpToolDescriptor {
    name: string;
    description?: string;
    verb: CreationVerb;
    offeringId?: string;
    inputSchema: Record<string, unknown>;
    consumes?: boolean;
}
export interface CapabilityManifest {
    creationId: string;
    version: number;
    tools: McpToolDescriptor[];
    customTools?: McpToolDescriptor[];
}
export interface CreationGeo {
    lat: number;
    lng: number;
    gridCell: string;
}
export interface CreationMetrics {
    views: number;
    likes: number;
    sales: number;
    comments: number;
}
export interface Creation {
    id: string;
    ownerAccountId: string;
    originalCreatorAccountId: string;
    type: CreationType;
    status: CreationStatus;
    title: string;
    summary?: string;
    substrateTier: SubstrateTier;
    ecsVersionId: string | null;
    boundAgentId: string | null;
    geo?: CreationGeo | null;
    poi?: AeonPlotPoi | null;
    preview: CreationPreview;
    offerings: Offering[];
    manifestVersion: number;
    shareCode: string | null;
    metrics: CreationMetrics;
    createdAt: number;
    updatedAt: number;
}
export interface CreationDiscoveryItem {
    id: string;
    type: CreationType;
    title: string;
    summary?: string;
    preview: CreationPreview;
    creator: {
        accountId: string;
        name?: string;
        avatarUrl?: string;
    };
    metrics: CreationMetrics;
    geo?: CreationGeo | null;
    poi?: AeonPlotPoi | null;
    canEnter: boolean;
    offerings?: Offering[];
}
