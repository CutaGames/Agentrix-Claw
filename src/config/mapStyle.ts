/**
 * mapStyle — Aeon 地图瓦片样式解析(#3 P1:高精真实世界地图)。
 *
 * 默认用 MapLibre 免费 demo 瓦片(只有国家轮廓)。配置了高精商业瓦片 key 后,
 * 自动升级为能看到城市街区的真实地图。优先级:
 *   1. EAS extra.mapTilerKey → MapTiler streets-v2(全球街区级矢量瓦片)
 *   2. EAS extra.mapStyleUrl → 任意自定义 style.json(可接 Mapbox / 天地图代理)
 *   3. demo 瓦片(降级,保证可用)
 *
 * key 不硬编码进源码:通过 expo-constants 的 extra 注入(app.json / EAS secret),
 * 换源/上线只改配置不改代码。
 */
import Constants from 'expo-constants';

const DEMO_STYLE = 'https://demotiles.maplibre.org/style.json';

function extra(): Record<string, any> {
  return (Constants.expoConfig?.extra as Record<string, any>) ?? {};
}

/** 是否已配置高精瓦片源(决定是否展示"高精地图"能力)。 */
export function hasHighPrecisionMap(): boolean {
  const e = extra();
  return !!(e.mapTilerKey || e.mapStyleUrl);
}

/** 解析当前应使用的 MapLibre style URL。 */
export function resolveMapStyleUrl(): string {
  const e = extra();
  if (typeof e.mapStyleUrl === 'string' && e.mapStyleUrl) return e.mapStyleUrl;
  if (typeof e.mapTilerKey === 'string' && e.mapTilerKey) {
    // MapTiler streets-v2:全球街区级,MapLibre 原生可吃其 style.json。
    return `https://api.maptiler.com/maps/streets-v2/style.json?key=${e.mapTilerKey}`;
  }
  return DEMO_STYLE;
}

/** 高精地图下的初始缩放(能看到街区);demo 瓦片只到国家级,缩放小一些。 */
export function defaultMapZoom(): number {
  return hasHighPrecisionMap() ? 14 : 2;
}
