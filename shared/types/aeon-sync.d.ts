export type AeonControlState = 'manual' | 'agent' | 'copilot';
export type AeonBadge = 'human' | 'agent' | 'copilot' | 'npc';
export type AeonClan = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type AeonFacing = 'left' | 'right';
export type AeonStageRole = 'host' | 'speaker' | 'audience';
export interface AeonCharacterSnapshot {
    charId: string;
    ownerUserId: string;
    controlState: AeonControlState;
    isAgentDriven: boolean;
    badge: AeonBadge;
    clan: AeonClan;
    x: number;
    y: number;
    facing: AeonFacing;
    sprite: string;
    displayName: string;
    stageRole?: AeonStageRole;
}
export type AeonClientEvent = {
    t: 'move';
    x: number;
    y: number;
    facing: AeonFacing;
} | {
    t: 'action';
    action: string;
    targetCharId?: string;
} | {
    t: 'control';
    controlState: AeonControlState;
} | {
    t: 'chat';
    text: string;
    scope: 'proximity' | 'room';
} | {
    t: 'stage_raise_hand';
} | {
    t: 'stage_invite';
    targetCharId: string;
} | {
    t: 'stage_leave_stage';
    targetCharId?: string;
} | {
    t: 'stage_tip';
    targetCharId: string;
    amount: number;
};
export type AeonServerEvent = {
    t: 'room_state';
    roomId: string;
    chars: AeonCharacterSnapshot[];
    serverTs: number;
} | {
    t: 'char_upsert';
    char: AeonCharacterSnapshot;
    serverTs: number;
} | {
    t: 'char_leave';
    charId: string;
    serverTs: number;
} | {
    t: 'chat';
    fromCharId: string;
    text: string;
    attribution?: string;
    serverTs: number;
} | {
    t: 'action';
    fromCharId: string;
    action: string;
    serverTs: number;
} | {
    t: 'stage_hand_raised';
    fromCharId: string;
    displayName: string;
    serverTs: number;
} | {
    t: 'stage_tip';
    fromCharId: string;
    fromName: string;
    targetCharId: string;
    targetName: string;
    amount: number;
    totalToTarget: number;
    attribution?: string;
    serverTs: number;
};
export interface AeonJoinPayload {
    roomId: string;
    charId: string;
}
export declare const AEON_SYNC: {
    readonly NAMESPACE: "/aeon";
    readonly ROOM_PREFIX: "aeon:room:";
    readonly MOVE_THROTTLE_MS: 100;
    readonly P95_LATENCY_TARGET_MS: 300;
    readonly ROOM_CAPACITY_MVP: 20;
    readonly DISCONNECT_GRACE_MS: 10000;
    readonly RECONCILE_WINDOW_MS: 5000;
    readonly CLIENT_EVENT: "aeon:client";
    readonly SERVER_EVENT: "aeon:server";
    readonly JOIN: "aeon:join";
    readonly LEAVE: "aeon:leave";
    readonly HEARTBEAT: "aeon:heartbeat";
    readonly STAGE_MAX_SPEAKERS: 6;
    readonly STAGE_TIP_MIN: 1;
    readonly STAGE_TIP_MAX: 5000;
};
export declare function aeonRoomName(roomId: string): string;
export declare function identityFromControl(controlState: AeonControlState, isNpc?: boolean): {
    badge: AeonBadge;
    isAgentDriven: boolean;
};
