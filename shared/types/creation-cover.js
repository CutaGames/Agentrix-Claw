"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isRenderableCover = isRenderableCover;
function isRenderableCover(url) {
    return typeof url === 'string' && /^https:\/\//.test(url);
}
//# sourceMappingURL=creation-cover.js.map