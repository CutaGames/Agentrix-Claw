"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AEON_SYNC = void 0;
exports.aeonRoomName = aeonRoomName;
exports.identityFromControl = identityFromControl;
exports.AEON_SYNC = {
    NAMESPACE: '/aeon',
    ROOM_PREFIX: 'aeon:room:',
    MOVE_THROTTLE_MS: 100,
    P95_LATENCY_TARGET_MS: 300,
    ROOM_CAPACITY_MVP: 20,
    DISCONNECT_GRACE_MS: 10_000,
    RECONCILE_WINDOW_MS: 5_000,
    CLIENT_EVENT: 'aeon:client',
    SERVER_EVENT: 'aeon:server',
    JOIN: 'aeon:join',
    LEAVE: 'aeon:leave',
    HEARTBEAT: 'aeon:heartbeat',
    STAGE_MAX_SPEAKERS: 6,
    STAGE_TIP_MIN: 1,
    STAGE_TIP_MAX: 5000,
};
function aeonRoomName(roomId) {
    return `${exports.AEON_SYNC.ROOM_PREFIX}${roomId}`;
}
function identityFromControl(controlState, isNpc = false) {
    if (isNpc)
        return { badge: 'npc', isAgentDriven: true };
    switch (controlState) {
        case 'manual':
            return { badge: 'human', isAgentDriven: false };
        case 'agent':
            return { badge: 'agent', isAgentDriven: true };
        case 'copilot':
            return { badge: 'copilot', isAgentDriven: true };
    }
}
//# sourceMappingURL=aeon-sync.js.map