"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AGENTRIX_PRESENCE_TYPES_VERSION = exports.PresenceTopics = void 0;
exports.PresenceTopics = {
    presence: (userId) => `user.${userId}.presence`,
    petState: (userId) => `user.${userId}.pet.state`,
    petSoulChanged: (userId) => `user.${userId}.pet.soul.changed`,
    petSkinChanged: (userId) => `user.${userId}.pet.skin.changed`,
    handoff: (userId) => `user.${userId}.handoff`,
    approval: (userId) => `user.${userId}.approval`,
    wallet: (userId) => `user.${userId}.wallet`,
    vitals: (userId) => `user.${userId}.vitals`,
    agentEvent: (userId, agentId) => `user.${userId}.agent.${agentId}.event`,
    memoryChanged: (userId) => `user.${userId}.memory.changed`,
    economyEvent: (userId) => `user.${userId}.economy.event`,
    surfacePrimaryChanged: (userId) => `user.${userId}.surface.primary.changed`,
};
exports.AGENTRIX_PRESENCE_TYPES_VERSION = '3.0.0';
//# sourceMappingURL=agentrix-presence.js.map