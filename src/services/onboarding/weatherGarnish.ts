/**
 * weatherGarnish — 「天气锦上添花句」(Weather_Garnish)定位 + 天气获取与文案。
 *
 * spec:   .kiro/specs/soul-companion-onboarding/{requirements,design}.md
 * task:   3.4(Requirements 3.5 / 3.6,Design §3.3,约束 C4)
 *
 * 第一句话的**可选追加句**,基于定位 + 天气数据生成(R3.5)。核心约束:
 *   - **绝不阻塞/延迟主句**(C4):定位与天气各自 5s 超时;任一环失败/超时即
 *     **静默跳过**,返回 null(R3.6)。调用方(FirstWordsStep)先播主句,本句仅在
 *     成功时作为后续追加,失败时主线照常推进(Correctness Property 1)。
 *   - 复用:定位走 `expo-location`(项目既有依赖,与 AeonMapScreen 同款 GPS 兜底策略);
 *     天气走 Open-Meteo 前端直连(无需 key、无需新建 provider,Design §3.3 允许「前端直连」)。
 *
 * 可测试性:`getWeatherGarnish` 的全部 IO(定位 / 天气)经 `deps` 注入,
 * 文案构造 `buildWeatherGarnishLine` 为纯函数 → 便于单测(超时即 null、主句不受影响)。
 */

/** 经纬度点(WGS-84)。 */
export interface GeoPoint {
  lat: number;
  lng: number;
}

/** 天气快照(Open-Meteo current 的精简形态)。 */
export interface WeatherSnapshot {
  /** 摄氏温度。 */
  temperatureC: number;
  /** WMO weather code(0 晴 … 95+ 雷雨)。 */
  weatherCode: number;
  /** 是否白天(1 白天 / 0 夜晚),可空。 */
  isDay?: boolean;
}

// ── 通用超时闸 ────────────────────────────────────────────────────────────────

/** 超时错误(便于调用方区分超时与其它失败;两者最终都静默跳过)。 */
export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`operation timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

/**
 * 给一个 Promise 加超时:`ms` 内未 settle 则 reject(TimeoutError)。
 * 用于把「定位 / 天气」各自封顶 5s,保证永不拖住主句(C4 / Design §3.3)。
 *
 * 注意:这是「软超时」——底层原生调用可能仍在后台跑,但调用方不再等待它。
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

// ── 默认定位实现(复用 expo-location,与 AeonMapScreen 同款兜底) ─────────────────

function loadLocationModule(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    return require('expo-location');
  } catch {
    return null; // web/桩环境无原生模块 → 优雅降级
  }
}

/**
 * 取当前定位(best-effort,**永不抛错**;不可用返回 null)。
 * 策略同 AeonMapScreen:权限幂等请求 → 先用缓存位置(秒回)→ 再实时定位。
 * 调用方仍会用 `withTimeout(…, 5s)` 再封顶一层(R3.5 5s)。
 */
export async function getCurrentLocation(): Promise<GeoPoint | null> {
  const Location = loadLocationModule();
  if (!Location) return null;
  try {
    // requestForegroundPermissionsAsync 幂等:已授权直接 granted、永久拒绝直接 denied(不弹框)。
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm?.status !== 'granted') return null; // 权限被拒 → 静默跳过(R3.6)

    try {
      const enabled = await Location.hasServicesEnabledAsync();
      if (!enabled) return null; // 系统定位总开关关闭
    } catch {
      /* 老平台无此 API,忽略 */
    }

    // 1) 缓存位置(秒回)。
    try {
      const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 });
      if (last?.coords) {
        return { lat: last.coords.latitude, lng: last.coords.longitude };
      }
    } catch {
      /* ignore,继续实时定位 */
    }

    // 2) 实时定位(放宽精度更快出点)。外层 withTimeout 负责封顶。
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy?.Low ?? 2,
    });
    if (pos?.coords) {
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    }
    return null;
  } catch {
    return null; // 任何异常 → 静默跳过
  }
}

// ── 默认天气实现(Open-Meteo 前端直连,无需 key) ───────────────────────────────

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

/**
 * 拉取当前天气(best-effort,**永不抛错**;不可用返回 null)。
 * Open-Meteo 免费、无需 key、全球可用,符合「不新建 provider」(Design §3.3)。
 */
export async function fetchWeather(point: GeoPoint): Promise<WeatherSnapshot | null> {
  try {
    const url =
      `${OPEN_METEO_URL}?latitude=${encodeURIComponent(String(point.lat))}` +
      `&longitude=${encodeURIComponent(String(point.lng))}` +
      `&current=temperature_2m,weather_code,is_day`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data: any = await res.json();
    const current = data?.current;
    if (!current || typeof current.weather_code !== 'number') return null;
    return {
      temperatureC: typeof current.temperature_2m === 'number' ? current.temperature_2m : NaN,
      weatherCode: current.weather_code,
      isDay: typeof current.is_day === 'number' ? current.is_day === 1 : undefined,
    };
  } catch {
    return null;
  }
}

// ── 纯文案构造(可单测) ─────────────────────────────────────────────────────────

/** WMO weather code → 天气大类。 */
type WeatherKind =
  | 'clear'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'snow'
  | 'thunder';

function classifyWeather(code: number): WeatherKind {
  if (code >= 95) return 'thunder'; // 95,96,99 雷雨
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if (code >= 51 && code <= 57) return 'drizzle';
  if (code === 45 || code === 48) return 'fog';
  if (code === 2 || code === 3) return 'cloudy';
  return 'clear'; // 0,1 (及未知码兜底为晴朗中性句)
}

/** 温度后缀(仅在温度有效时附加,如「(现在约 23℃)」)。 */
function tempSuffix(temperatureC: number): string {
  return Number.isFinite(temperatureC)
    ? `(现在约 ${Math.round(temperatureC)}℃)`
    : '';
}

/**
 * 由天气快照生成追加句(纯函数,必定非空)。
 * 文案温暖、简短,贴合「灵魂关心你」的语气(R3.5 示例:「你那边在下雨,记得带伞。」)。
 */
export function buildWeatherGarnishLine(wx: WeatherSnapshot): string {
  const kind = classifyWeather(wx.weatherCode);
  const t = tempSuffix(wx.temperatureC);
  switch (kind) {
    case 'thunder':
      return `你那边有雷雨,注意安全,尽量待在室内。${t}`;
    case 'snow':
      return `你那边在下雪,记得穿暖一点。${t}`;
    case 'rain':
      return `你那边好像在下雨,出门记得带伞。${t}`;
    case 'drizzle':
      return `你那边飘着小雨,带把伞会更安心。${t}`;
    case 'fog':
      return `你那边有雾,出行注意安全。${t}`;
    case 'cloudy':
      return `你那边云有点多,记得留意天气变化。${t}`;
    case 'clear':
    default:
      if (Number.isFinite(wx.temperatureC) && wx.temperatureC >= 30) {
        return `你那边晴朗又有点热,记得多喝水。${t}`;
      }
      if (Number.isFinite(wx.temperatureC) && wx.temperatureC <= 5) {
        return `你那边晴朗但挺冷的,注意保暖。${t}`;
      }
      return `你那边天气不错,适合出去走走。${t}`;
  }
}

// ── 编排:定位 → 天气 → 文案(全程非阻塞主句,失败即 null) ──────────────────────

/** `getWeatherGarnish` 的可注入依赖(便于单测「超时即 null」「不阻塞主句」)。 */
export interface WeatherGarnishDeps {
  getLocation: () => Promise<GeoPoint | null>;
  fetchWeather: (point: GeoPoint) => Promise<WeatherSnapshot | null>;
  /** 定位超时(R3.5,默认 5s)。 */
  locationTimeoutMs?: number;
  /** 天气超时(R3.5,默认 5s)。 */
  weatherTimeoutMs?: number;
}

const DEFAULT_DEPS: Required<Pick<WeatherGarnishDeps, 'getLocation' | 'fetchWeather'>> = {
  getLocation: getCurrentLocation,
  fetchWeather,
};

/** 定位/天气各自的默认超时(R3.5「5 秒内」)。 */
export const LOCATION_TIMEOUT_MS = 5_000;
export const WEATHER_TIMEOUT_MS = 5_000;

/**
 * 获取天气追加句(R3.5 / R3.6 / C4)。
 *
 * 流程:`getLocation`(≤5s)→ `fetchWeather`(≤5s)→ `buildWeatherGarnishLine`。
 * **任一环失败、超时、权限被拒、数据不可获取 → 返回 null(静默跳过)**,
 * 调用方据此决定是否追加;主句永不因本函数被阻塞或延迟(C4)。
 *
 * 本函数**永不抛错**:所有错误在内部收敛为 null。
 */
export async function getWeatherGarnish(
  deps: WeatherGarnishDeps = DEFAULT_DEPS,
): Promise<string | null> {
  const getLocation = deps.getLocation ?? DEFAULT_DEPS.getLocation;
  const fetchWx = deps.fetchWeather ?? DEFAULT_DEPS.fetchWeather;
  const locTimeout = deps.locationTimeoutMs ?? LOCATION_TIMEOUT_MS;
  const wxTimeout = deps.weatherTimeoutMs ?? WEATHER_TIMEOUT_MS;

  try {
    const loc = await withTimeout(getLocation(), locTimeout);
    if (!loc) return null; // 定位失败/拒绝 → 跳过(R3.6)

    const wx = await withTimeout(fetchWx(loc), wxTimeout);
    if (!wx) return null; // 天气不可获取 → 跳过(R3.6)

    return buildWeatherGarnishLine(wx);
  } catch {
    // 超时(TimeoutError)或任何异常 → 静默跳过(R3.6 / C4)
    return null;
  }
}
