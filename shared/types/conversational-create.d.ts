export declare const CONVERSATIONAL_CREATE_META_KIND = "conversational_create";
export type ConversationalCreateStatus = 'created' | 'need_more_info' | 'rejected' | 'failed';
export interface ConversationalCreateResult {
    status: ConversationalCreateStatus;
    creationId?: string;
    title?: string;
    coverUrl?: string;
    shareCode?: string;
    landingUrl?: string;
    deepLink?: string;
    missingRequired?: string[];
    reason?: string;
}
export interface ConversationalCreateMetaEvent {
    type: 'meta';
    kind: typeof CONVERSATIONAL_CREATE_META_KIND;
    conversationalCreate: ConversationalCreateResult;
}
export declare const CREATE_SHOP_TOOL_NAME = "create_shop";
export declare const CREATE_PLACE_TOOL_NAME = "create_place";
export type ConversationalCreateKind = 'shop' | 'place';
export interface AuthoringResultForCreate {
    status: string;
    creationId?: string;
    title?: string;
    coverUrl?: string;
    shareCode?: string;
    landingUrl?: string;
    deepLink?: string;
    missingRequired?: string[];
    message?: string;
}
export declare function mapAuthoringResultToConversationalCreate(raw: AuthoringResultForCreate): ConversationalCreateResult;
export declare function toolNameToConversationalCreateKind(toolName?: string | null): ConversationalCreateKind | undefined;
export interface ParsedConversationalCreate {
    result: ConversationalCreateResult;
    kind?: ConversationalCreateKind;
}
export declare function extractConversationalCreate(payload: any): ParsedConversationalCreate | null;
export declare function conversationalCreateKindEmoji(kind: ConversationalCreateKind): string;
export interface ConversationalCreateCardViewModel {
    variant: ConversationalCreateStatus;
    kind: ConversationalCreateKind;
    emoji: string;
    hasRenderableCover: boolean;
    coverUrl?: string;
    title?: string;
    shareCode?: string;
    landingUrl?: string;
    deepLink?: string;
    shareUrl: string;
    canShare: boolean;
    hasCreationId: boolean;
    missingRequired: string[];
    isRejected: boolean;
    reason?: string;
}
export declare function conversationalCreateCardViewModel(result: ConversationalCreateResult, kind?: ConversationalCreateKind): ConversationalCreateCardViewModel;
