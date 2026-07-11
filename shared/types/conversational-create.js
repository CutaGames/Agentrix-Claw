"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CREATE_PLACE_TOOL_NAME = exports.CREATE_SHOP_TOOL_NAME = exports.CONVERSATIONAL_CREATE_META_KIND = void 0;
exports.mapAuthoringResultToConversationalCreate = mapAuthoringResultToConversationalCreate;
exports.toolNameToConversationalCreateKind = toolNameToConversationalCreateKind;
exports.extractConversationalCreate = extractConversationalCreate;
exports.conversationalCreateKindEmoji = conversationalCreateKindEmoji;
exports.conversationalCreateCardViewModel = conversationalCreateCardViewModel;
const creation_cover_1 = require("./creation-cover");
exports.CONVERSATIONAL_CREATE_META_KIND = 'conversational_create';
exports.CREATE_SHOP_TOOL_NAME = 'create_shop';
exports.CREATE_PLACE_TOOL_NAME = 'create_place';
function mapAuthoringResultToConversationalCreate(raw) {
    const status = raw.status === 'published'
        ? 'created'
        : raw.status === 'need_more_info'
            ? 'need_more_info'
            : raw.status === 'quality_rejected'
                ? 'rejected'
                : 'failed';
    const result = { status };
    if (raw.creationId)
        result.creationId = raw.creationId;
    if (status === 'created') {
        if (raw.title)
            result.title = raw.title;
        if (raw.coverUrl && (0, creation_cover_1.isRenderableCover)(raw.coverUrl))
            result.coverUrl = raw.coverUrl;
        if (raw.shareCode)
            result.shareCode = raw.shareCode;
        if (raw.landingUrl)
            result.landingUrl = raw.landingUrl;
        if (raw.deepLink)
            result.deepLink = raw.deepLink;
    }
    else if (status === 'need_more_info') {
        if (raw.missingRequired?.length)
            result.missingRequired = [...raw.missingRequired];
    }
    else {
        if (raw.message)
            result.reason = raw.message;
    }
    return result;
}
function toolNameToConversationalCreateKind(toolName) {
    if (toolName === exports.CREATE_SHOP_TOOL_NAME)
        return 'shop';
    if (toolName === exports.CREATE_PLACE_TOOL_NAME)
        return 'place';
    return undefined;
}
function isConversationalCreateResult(v) {
    return (!!v &&
        typeof v === 'object' &&
        (v.status === 'created' ||
            v.status === 'need_more_info' ||
            v.status === 'rejected' ||
            v.status === 'failed'));
}
function unwrapAuthoringResult(out) {
    let v = out;
    if (typeof v === 'string') {
        try {
            v = JSON.parse(v);
        }
        catch {
            return null;
        }
    }
    if (!v || typeof v !== 'object')
        return null;
    if (v.status === undefined) {
        v = v.result ?? v.output ?? v.data ?? v.toolResult ?? v;
    }
    if (v && typeof v === 'object' && typeof v.status === 'string') {
        return v;
    }
    return null;
}
function extractConversationalCreate(payload) {
    if (!payload || typeof payload !== 'object')
        return null;
    if (payload.kind === exports.CONVERSATIONAL_CREATE_META_KIND &&
        isConversationalCreateResult(payload.conversationalCreate)) {
        return { result: payload.conversationalCreate };
    }
    if (isConversationalCreateResult(payload.conversationalCreate)) {
        return { result: payload.conversationalCreate };
    }
    if (isConversationalCreateResult(payload)) {
        return { result: payload };
    }
    if (payload.meta && typeof payload.meta === 'object') {
        const fromMeta = extractConversationalCreate(payload.meta);
        if (fromMeta)
            return fromMeta;
    }
    const toolCalls = Array.isArray(payload.toolCalls)
        ? payload.toolCalls
        : Array.isArray(payload.tool_calls)
            ? payload.tool_calls
            : null;
    if (toolCalls) {
        for (const call of toolCalls) {
            if (!call || typeof call !== 'object')
                continue;
            const name = call.name ?? call.toolName ?? call.function?.name;
            const kind = toolNameToConversationalCreateKind(name);
            if (!kind)
                continue;
            const rawOut = call.output ?? call.result ?? call.toolResult ?? call.response ?? call.content;
            const authoring = unwrapAuthoringResult(rawOut);
            if (authoring) {
                return { result: mapAuthoringResultToConversationalCreate(authoring), kind };
            }
        }
    }
    return null;
}
function conversationalCreateKindEmoji(kind) {
    return kind === 'place' ? '🏛️' : '🏪';
}
function conversationalCreateCardViewModel(result, kind = 'shop') {
    const shareUrl = result.landingUrl || result.deepLink || '';
    return {
        variant: result.status,
        kind,
        emoji: conversationalCreateKindEmoji(kind),
        hasRenderableCover: (0, creation_cover_1.isRenderableCover)(result.coverUrl),
        coverUrl: result.coverUrl,
        title: result.title,
        shareCode: result.shareCode,
        landingUrl: result.landingUrl,
        deepLink: result.deepLink,
        shareUrl,
        canShare: shareUrl.length > 0,
        hasCreationId: typeof result.creationId === 'string' && result.creationId.length > 0,
        missingRequired: result.status === 'need_more_info' && result.missingRequired ? [...result.missingRequired] : [],
        isRejected: result.status === 'rejected',
        reason: result.status === 'rejected' || result.status === 'failed' ? result.reason : undefined,
    };
}
//# sourceMappingURL=conversational-create.js.map