/**
 * B 接受介绍后直接去建名片（L9 C2 线，P1-7，coord 10-31 E145）。
 *
 * 只出现在 B 的接收页里，受 P1-0 名单约束（转介人必须在名单里），不是全站的「我也做一个」入口。
 * 开关 `INTRODUCTION_BUILD_CARD_V1_ENABLED`（默认关，只认精确的 `'1'`，且要 `INTRODUCTIONS_V1_ENABLED` 开着）。
 * 回答只有一个布尔和一个类别枚举：不说「名单」，不说转介人是谁，不带客户的任何东西；不可用的各种原因回答完全一样。
 * 种子只带类别枚举，不带需求原话、地区、姓名，所以网址里没有个人数据。
 */
import { INTRODUCTION_NEED_CATEGORIES_V1, INTRODUCTION_SCHEMA_VERSION_V1, type IntroductionNeedCategoryV1 } from './introduction';

export const INTRODUCTION_BUILD_CARD_FLAG_V1 = 'INTRODUCTION_BUILD_CARD_V1_ENABLED';

export const INTRODUCTION_BUILD_CARD_ROUTES_V1 = {
  offer: (id: string): string => `/introductions/${encodeURIComponent(id)}/build-card`,
} as const;

export interface IntroductionBuildCardOfferV1 {
  schemaVersion: typeof INTRODUCTION_SCHEMA_VERSION_V1;
  available: boolean;
  seedCategory: IntroductionNeedCategoryV1 | null;
}

export type IntroductionBuildCardDecodeResultV1<T> =
  | { ok: true; value: T }
  | { ok: false; reasonCode: 'invalid_type' | 'invalid_value' | 'missing_field' | 'unknown_field' | 'unsupported_schema_version'; field: string };

export function introductionNeedCategoryOrNullV1(value: unknown): IntroductionNeedCategoryV1 | null {
  return typeof value === 'string' && (INTRODUCTION_NEED_CATEGORIES_V1 as readonly string[]).includes(value) ? (value as IntroductionNeedCategoryV1) : null;
}

/**
 * 判定。所有输入都是服务端自己算的布尔；`recipientHasCard` 是留给调用方的可选输入（本版服务端不传，人人都有分身，
 * 「已有名片」不能用有没有 Agent 账户来判）。
 */
export function introductionBuildCardOfferV1(input: {
  flagOn: boolean;
  introducerInCohort: boolean;
  accepted: boolean;
  recipientHasCard?: boolean;
  category?: unknown;
}): IntroductionBuildCardOfferV1 {
  const available = input.flagOn === true && input.introducerInCohort === true && input.accepted === true && input.recipientHasCard !== true;
  return { schemaVersion: INTRODUCTION_SCHEMA_VERSION_V1, available, seedCategory: available ? introductionNeedCategoryOrNullV1(input.category) : null };
}

export function decodeIntroductionBuildCardOfferV1(value: unknown): IntroductionBuildCardDecodeResultV1<IntroductionBuildCardOfferV1> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { ok: false, reasonCode: 'invalid_type', field: '$' };
  const rec = value as Record<string, unknown>;
  for (const key of Object.keys(rec)) {
    if (!['schemaVersion', 'available', 'seedCategory'].includes(key)) return { ok: false, reasonCode: 'unknown_field', field: key };
  }
  if (rec.schemaVersion !== undefined && rec.schemaVersion !== INTRODUCTION_SCHEMA_VERSION_V1) return { ok: false, reasonCode: 'unsupported_schema_version', field: 'schemaVersion' };
  if (rec.available === undefined) return { ok: false, reasonCode: 'missing_field', field: 'available' };
  if (rec.seedCategory === undefined) return { ok: false, reasonCode: 'missing_field', field: 'seedCategory' };
  if (typeof rec.available !== 'boolean') return { ok: false, reasonCode: 'invalid_type', field: 'available' };
  if (rec.seedCategory !== null && introductionNeedCategoryOrNullV1(rec.seedCategory) === null) return { ok: false, reasonCode: 'invalid_value', field: 'seedCategory' };
  if (rec.available === false && rec.seedCategory !== null) return { ok: false, reasonCode: 'invalid_value', field: 'seedCategory' };
  return { ok: true, value: { schemaVersion: INTRODUCTION_SCHEMA_VERSION_V1, available: rec.available, seedCategory: rec.seedCategory as IntroductionNeedCategoryV1 | null } };
}

/** 创建流的页面路径与网址参数名；种子只带类别枚举。 */
export const INTRODUCTION_BUILD_CARD_PATH_V1 = '/twin';
export const INTRODUCTION_BUILD_CARD_QUERY_V1 = 'introSeed';

export function introductionBuildCardHrefV1(offer: IntroductionBuildCardOfferV1): string | null {
  if (offer.available !== true) return null;
  return offer.seedCategory ? `${INTRODUCTION_BUILD_CARD_PATH_V1}?${INTRODUCTION_BUILD_CARD_QUERY_V1}=${offer.seedCategory}` : INTRODUCTION_BUILD_CARD_PATH_V1;
}

/** 创建流从网址参数里取种子；不在枚举里的当没有。 */
export function introductionSeedFromQueryV1(value: unknown): IntroductionNeedCategoryV1 | null {
  return introductionNeedCategoryOrNullV1(Array.isArray(value) ? value[0] : value);
}
