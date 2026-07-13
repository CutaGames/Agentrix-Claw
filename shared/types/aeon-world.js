"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AEON_EVENTS = exports.AEON_BUILD = exports.AEON_WORLD = exports.AEON_GEO = exports.AEON_ACTIVE_EPOCH = exports.AEON_EPOCHS = void 0;
exports.haversineMeters = haversineMeters;
exports.wgs84ToGcj02 = wgs84ToGcj02;
exports.gcj02ToWgs84 = gcj02ToWgs84;
exports.toGridCell = toGridCell;
exports.aeonEventRoomId = aeonEventRoomId;
exports.AEON_EPOCHS = ['earth', 'mars', 'galaxy'];
exports.AEON_ACTIVE_EPOCH = 'earth';
exports.AEON_GEO = {
    NEARBY_DEFAULT_RADIUS_M: 5000,
    NEARBY_MAX_RADIUS_M: 50000,
    NEARBY_LIMIT: 50,
    CHECKIN_RADIUS_M: 300,
    CHECKIN_REWARD_AXP: 15,
    STREAK_BONUS_PER_DAY: 5,
    STREAK_BONUS_CAP: 50,
    PRESENCE_TTL_MS: 5 * 60 * 1000,
    PRESENCE_REPORT_THROTTLE_MS: 30 * 1000,
};
function haversineMeters(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}
const GCJ_A = 6378245.0;
const GCJ_EE = 0.00669342162296594323;
function outOfChina(lat, lng) {
    return !(lng > 73.66 && lng < 135.05 && lat > 3.86 && lat < 53.55);
}
function transformLat(x, y) {
    let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    ret += ((20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0) / 3.0;
    ret += ((20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin((y / 3.0) * Math.PI)) * 2.0) / 3.0;
    ret += ((160.0 * Math.sin((y / 12.0) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30.0)) * 2.0) / 3.0;
    return ret;
}
function transformLng(x, y) {
    let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    ret += ((20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0) / 3.0;
    ret += ((20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin((x / 3.0) * Math.PI)) * 2.0) / 3.0;
    ret += ((150.0 * Math.sin((x / 12.0) * Math.PI) + 300.0 * Math.sin((x / 30.0) * Math.PI)) * 2.0) / 3.0;
    return ret;
}
function wgs84ToGcj02(lat, lng) {
    if (outOfChina(lat, lng))
        return { lat, lng };
    let dLat = transformLat(lng - 105.0, lat - 35.0);
    let dLng = transformLng(lng - 105.0, lat - 35.0);
    const radLat = (lat / 180.0) * Math.PI;
    let magic = Math.sin(radLat);
    magic = 1 - GCJ_EE * magic * magic;
    const sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / (((GCJ_A * (1 - GCJ_EE)) / (magic * sqrtMagic)) * Math.PI);
    dLng = (dLng * 180.0) / ((GCJ_A / sqrtMagic) * Math.cos(radLat) * Math.PI);
    return { lat: lat + dLat, lng: lng + dLng };
}
function gcj02ToWgs84(lat, lng) {
    if (outOfChina(lat, lng))
        return { lat, lng };
    const g = wgs84ToGcj02(lat, lng);
    return { lat: lat * 2 - g.lat, lng: lng * 2 - g.lng };
}
exports.AEON_WORLD = {
    DEFAULT_ROOM_CAPACITY: 20,
    PLOT_DORMANT_MS: 30 * 24 * 60 * 60 * 1000,
    GRID_DECIMALS: 3,
    ENTER_SCENE_TARGET_MS: 5000,
};
function toGridCell(lat, lng, decimals = exports.AEON_WORLD.GRID_DECIMALS) {
    const q = (n) => {
        const f = Math.pow(10, decimals);
        return (Math.round(n * f) / f).toFixed(decimals);
    };
    return `${q(lat)},${q(lng)}`;
}
exports.AEON_BUILD = {
    PLOT_GRID_W: 32,
    PLOT_GRID_H: 32,
    MAX_ITEMS_PER_PLOT: 200,
};
exports.AEON_EVENTS = {
    ROOM_PREFIX: 'aeon-live-',
    UPCOMING_WINDOW_MS: 14 * 24 * 60 * 60 * 1000,
    GRACE_LIVE_BEFORE_MS: 10 * 60 * 1000,
    GRACE_LIVE_AFTER_MS: 60 * 60 * 1000,
};
function aeonEventRoomId(eventId) {
    return `${exports.AEON_EVENTS.ROOM_PREFIX}${eventId}`;
}
//# sourceMappingURL=aeon-world.js.map