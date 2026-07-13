export type AeonEpoch = 'earth' | 'mars' | 'galaxy';
export declare const AEON_EPOCHS: readonly AeonEpoch[];
export declare const AEON_ACTIVE_EPOCH: AeonEpoch;
export interface AeonEpochInfo {
    id: AeonEpoch;
    unlocked: boolean;
    displayName: string;
    teaser?: string;
}
export type AeonPlotStatus = 'active' | 'dormant';
export interface AeonPlotDto {
    id: string;
    ownerUserId: string;
    epoch: AeonEpoch;
    lat: number;
    lng: number;
    gridCell: string;
    status: AeonPlotStatus;
    displayName: string;
    lastActivityAt: number;
    createdAt: number;
    poi?: AeonPlotPoi | null;
}
export interface AeonPlotMarker {
    id: string;
    ownerUserId: string;
    ownerName?: string;
    lat: number;
    lng: number;
    displayName: string;
    status: AeonPlotStatus;
    poiName?: string | null;
    poiCategory?: string | null;
}
export interface AeonNearbyPlot extends AeonPlotMarker {
    distanceM: number;
    mine?: boolean;
}
export interface AeonCheckinResult {
    ok: boolean;
    plotId: string;
    rewardAxp: number;
    alreadyCheckedInToday: boolean;
    bridged: boolean;
    balance?: number;
    message: string;
    streakDays?: number;
}
export interface AeonNearbyPerson {
    userId: string;
    displayName: string;
    clan?: string;
    distanceM: number;
    lastSeen: number;
    plotId?: string | null;
}
export interface AeonCheckinLeaderEntry {
    userId: string;
    displayName: string;
    checkins: number;
    distinctPlots: number;
    streakDays: number;
}
export interface AeonPlotPoi {
    name: string;
    category: string;
    externalPoiId?: string | null;
    merchantUserId?: string | null;
    verified?: boolean;
    storeUrl?: string | null;
    address?: string | null;
}
export declare const AEON_GEO: {
    readonly NEARBY_DEFAULT_RADIUS_M: 5000;
    readonly NEARBY_MAX_RADIUS_M: 50000;
    readonly NEARBY_LIMIT: 50;
    readonly CHECKIN_RADIUS_M: 300;
    readonly CHECKIN_REWARD_AXP: 15;
    readonly STREAK_BONUS_PER_DAY: 5;
    readonly STREAK_BONUS_CAP: 50;
    readonly PRESENCE_TTL_MS: number;
    readonly PRESENCE_REPORT_THROTTLE_MS: number;
};
export declare function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number;
export declare function wgs84ToGcj02(lat: number, lng: number): {
    lat: number;
    lng: number;
};
export declare function gcj02ToWgs84(lat: number, lng: number): {
    lat: number;
    lng: number;
};
export type AeonRoomKind = 'company' | 'venue' | 'meeting' | 'market' | 'public';
export interface AeonRoomDto {
    id: string;
    plotId: string;
    orgId: string | null;
    kind: AeonRoomKind;
    capacity: number;
    config: Record<string, unknown>;
    displayName: string;
}
export declare const AEON_WORLD: {
    readonly DEFAULT_ROOM_CAPACITY: 20;
    readonly PLOT_DORMANT_MS: number;
    readonly GRID_DECIMALS: 3;
    readonly ENTER_SCENE_TARGET_MS: 5000;
};
export declare function toGridCell(lat: number, lng: number, decimals?: 3): string;
export type AeonBuildLinkKind = 'org' | 'room' | 'stage' | 'none';
export interface AeonBuildItemDto {
    id: string;
    plotId: string;
    sourceAssetId: string | null;
    catalogId: string | null;
    x: number;
    y: number;
    rotation: number;
    linksToId: string | null;
    linksToKind: AeonBuildLinkKind;
    label: string;
}
export interface AeonBuildPlacement {
    catalogId?: string | null;
    sourceAssetId?: string | null;
    x: number;
    y: number;
    rotation?: number;
    linksToId?: string | null;
    linksToKind?: AeonBuildLinkKind;
    label?: string;
}
export interface AeonBuildCatalogItem {
    catalogId: string;
    label: string;
    footprint: {
        w: number;
        h: number;
    };
    functional: boolean;
    icon: string;
}
export type AeonNewsKind = 'task_accepted' | 'task_completed' | 'company_founded' | 'hire' | 'bounty_posted' | 'milestone' | 'market_sale' | 'micro_story';
export interface AeonNewsItem {
    id: string;
    epoch: AeonEpoch;
    kind: AeonNewsKind;
    headline: string;
    refId?: string;
    createdAt: number;
}
export interface AeonLeaderboardEntry {
    subjectId: string;
    subjectName: string;
    metric: 'output' | 'tasks_done' | 'axp_earned';
    value: number;
}
export declare const AEON_BUILD: {
    readonly PLOT_GRID_W: 32;
    readonly PLOT_GRID_H: 32;
    readonly MAX_ITEMS_PER_PLOT: 200;
};
export type AeonEventKind = 'talk_show' | 'share' | 'auction' | 'concert' | 'meetup' | 'other';
export type AeonEventStatus = 'scheduled' | 'live' | 'ended' | 'cancelled';
export interface AeonEventDto {
    id: string;
    epoch: AeonEpoch;
    kind: AeonEventKind;
    title: string;
    description: string;
    hostUserId: string;
    hostName: string;
    startsAt: number;
    endsAt: number | null;
    plotId: string | null;
    buildItemId: string | null;
    coverUrl: string | null;
    status: AeonEventStatus;
    roomId: string;
    rsvpCount: number;
    rsvpedByMe?: boolean;
    liveCount?: number;
    createdAt: number;
}
export interface AeonEventCreateInput {
    kind?: AeonEventKind;
    title: string;
    description?: string;
    startsAt: number;
    endsAt?: number | null;
    plotId?: string | null;
    buildItemId?: string | null;
    coverUrl?: string | null;
}
export declare const AEON_EVENTS: {
    readonly ROOM_PREFIX: "aeon-live-";
    readonly UPCOMING_WINDOW_MS: number;
    readonly GRACE_LIVE_BEFORE_MS: number;
    readonly GRACE_LIVE_AFTER_MS: number;
};
export declare function aeonEventRoomId(eventId: string): string;
