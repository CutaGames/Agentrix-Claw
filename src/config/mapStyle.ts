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
