/**
 * mapStyle — Aeon 地图瓦片样式解析(#3 P1:高精真实世界地图 + 国内合规底图)。
 *
 * 默认用 MapLibre 免费 demo 瓦片(只有国家轮廓)。配置后自动升级。优先级:
 *   1. EAS extra.tiandituKey → 天地图(国内合规底图,GCJ-02 坐标系)
 *   2. EAS extra.mapStyleUrl → 任意自定义 style.json(可接 Mapbox / 自建天地图代理)
 *   3. EAS extra.mapTilerKey → MapTiler streets-v2(全球街区级,WGS-84)
 *   4. demo 瓦片(降级,保证可用)
 *
 * 坐标系:天地图/高德/腾讯底图为 GCJ-02(火星坐标),GPS 为 WGS-84,有数百米偏移。
 * `mapBaseIsGcj02()` 为 true 时,叠加 GPS 坐标到底图前要用 wgs84ToGcj02 转换。
 *
 * key 不硬编码进源码:通过 expo-constants 的 extra 注入(app.json / EAS secret)。
 */
import Constants from 'expo-constants';

const DEMO_STYLE = 'https://demotiles.maplibre.org/style.json';

function extra(): Record<string, any> {
  return (Constants.expoConfig?.extra as Record<string, any>) ?? {};
}

/** 是否已配置高精瓦片源(决定是否展示"高精地图"能力)。 */
export function hasHighPrecisionMap(): boolean {
  const e = extra();
  return !!(e.tiandituKey || e.mapStyleUrl || e.mapTilerKey);
}

/** 当前底图是否为 GCJ-02 坐标系(国内底图)→ 叠加 GPS 坐标需转换。 */
export function mapBaseIsGcj02(): boolean {
  const e = extra();
  // 天地图 = GCJ-02;mapStyleUrl 若标注 gcj02 也算。MapTiler/demo = WGS-84。
  return !!e.tiandituKey || e.mapBaseCrs === 'gcj02';
}

/**
 * 天地图 raster style(国内合规底图):矢量+注记两层叠加。
 * 天地图 token 申请:https://console.tianditu.gov.cn 。这里构造一个 MapLibre raster style。
 */
function tiandituStyle(tk: string): any {
  const vec = (t: string) => `https://t{s}.tianditu.gov.cn/DataServer?T=${t}&x={x}&y={y}&l={z}&tk=${tk}`;
  const subdomains = ['0', '1', '2', '3', '4', '5', '6', '7'];
  return {
    version: 8,
    sources: {
      tdt_vec: { type: 'raster', tiles: subdomains.map((s) => vec('vec_w').replace('{s}', s)), tileSize: 256 },
      tdt_cva: { type: 'raster', tiles: subdomains.map((s) => vec('cva_w').replace('{s}', s)), tileSize: 256 },
    },
    layers: [
      { id: 'tdt_vec', type: 'raster', source: 'tdt_vec' },
      { id: 'tdt_cva', type: 'raster', source: 'tdt_cva' },
    ],
  };
}

/** 解析当前应使用的 MapLibre style(URL 字符串 或 内联 style 对象)。 */
export function resolveMapStyle(): string | object {
  const e = extra();
  if (typeof e.tiandituKey === 'string' && e.tiandituKey) return tiandituStyle(e.tiandituKey);
  if (typeof e.mapStyleUrl === 'string' && e.mapStyleUrl) return e.mapStyleUrl;
  if (typeof e.mapTilerKey === 'string' && e.mapTilerKey) {
    return `https://api.maptiler.com/maps/streets-v2/style.json?key=${e.mapTilerKey}`;
  }
  return DEMO_STYLE;
}

/** 向后兼容:返回 string 形式(天地图返回内联对象时调用方应改用 resolveMapStyle)。 */
export function resolveMapStyleUrl(): string {
  const s = resolveMapStyle();
  return typeof s === 'string' ? s : DEMO_STYLE;
}

/** 高精地图下的初始缩放(能看到街区);demo 瓦片只到国家级,缩放小一些。 */
export function defaultMapZoom(): number {
  return hasHighPrecisionMap() ? 14 : 2;
}

/**
 * GPS 尚未取到时的兜底中心(WGS-84,{lat,lng})。
 * 避免地图落到 [0,0](几内亚湾海面 → 整屏蓝)。可由 extra.defaultMapCenter 覆盖,
 * 默认北京天安门。调用方需自行按底图坐标系(GCJ-02/WGS-84)用 toBase 投影。
 */
export function defaultMapCenterWgs84(): { lat: number; lng: number } {
  const e = extra();
  const c = e.defaultMapCenter;
  if (c && Number.isFinite(c.lat) && Number.isFinite(c.lng)) {
    return { lat: c.lat, lng: c.lng };
  }
  return { lat: 39.909, lng: 116.397 };
}

/** GPS 未取到时的兜底缩放(比定位到自己时小一档,城市级)。 */
export function fallbackMapZoom(): number {
  return hasHighPrecisionMap() ? 11 : 2;
}

// ── 地址 → 经纬度(geocoding):拿不到 GPS 时让用户输入地址定位 ──────────────
export interface GeocodeHit {
  /** 始终是 WGS-84(与 GPS/存库一致);天地图返回的是 GCJ-02,内部已转回。 */
  lat: number;
  lng: number;
  label: string;
}

/**
 * 把一段地址文本解析成候选坐标。优先用已配置的供应商:
 *   - 天地图(tiandituKey):国内地名/地址解析准,返回 GCJ-02 → 转回 WGS-84。
 *   - MapTiler(mapTilerKey):全球 geocoding,返回 WGS-84。
 * 没配 key 时返回空数组(调用方提示用户手填经纬度)。
 */
export async function geocodeAddress(query: string): Promise<GeocodeHit[]> {
  const e = extra();
  const q = query.trim();
  if (!q) return [];

  // 天地图地理编码(国内优先)。返回 lon/lat 为 GCJ-02。
  if (typeof e.tiandituKey === 'string' && e.tiandituKey) {
    try {
      const ds = encodeURIComponent(JSON.stringify({ keyWord: q }));
      const url = `https://api.tianditu.gov.cn/geocoder?ds=${ds}&tk=${e.tiandituKey}`;
      const r = await fetch(url);
      const j: any = await r.json();
      const loc = j?.location;
      if (loc && Number.isFinite(Number(loc.lat)) && Number.isFinite(Number(loc.lon))) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
        const { gcj02ToWgs84 } = require('../../shared/types/aeon-world');
        const w = gcj02ToWgs84(Number(loc.lat), Number(loc.lon));
        return [{ lat: w.lat, lng: w.lng, label: j?.searchVersion ? q : (loc.keyWord || q) }];
      }
    } catch { /* 落到 MapTiler 兜底 */ }
  }

  // MapTiler geocoding(全球)。返回 [lng, lat] WGS-84。
  if (typeof e.mapTilerKey === 'string' && e.mapTilerKey) {
    try {
      const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(q)}.json?key=${e.mapTilerKey}&limit=5`;
      const r = await fetch(url);
      const j: any = await r.json();
      const feats: any[] = Array.isArray(j?.features) ? j.features : [];
      return feats
        .map((f) => {
          const c = f?.center ?? f?.geometry?.coordinates;
          if (!Array.isArray(c) || c.length < 2) return null;
          return { lat: Number(c[1]), lng: Number(c[0]), label: f?.place_name || f?.text || q };
        })
        .filter((x): x is GeocodeHit => !!x && Number.isFinite(x.lat) && Number.isFinite(x.lng));
    } catch { /* ignore */ }
  }

  return [];
}

/** 是否有可用的地理编码供应商(决定是否展示"输入地址定位"入口)。 */
export function hasGeocoder(): boolean {
  const e = extra();
  return !!(e.tiandituKey || e.mapTilerKey);
}
