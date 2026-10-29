/**
 * L8-8 ALERT-1: what the phone tells the server when it registers its push token (`POST /notifications/register`).
 * The server writes each push in the language stored with the token, so the phone sends its interface language.
 * Only `zh` and `en` are sent; anything else is left out and the server keeps its Chinese default for this token.
 */
export type PushRegistrationLocale = 'zh' | 'en';

export function pushRegistrationLocale(language: unknown): PushRegistrationLocale | undefined {
  return language === 'zh' || language === 'en' ? language : undefined;
}

export interface PushRegistrationBody {
  token: string;
  platform: string;
  deviceId?: string;
  locale?: PushRegistrationLocale;
}

export function buildPushRegistrationBody(input: { token: string; platform: string; deviceId?: string; language: unknown }): PushRegistrationBody {
  const locale = pushRegistrationLocale(input.language);
  return {
    token: input.token,
    platform: input.platform,
    ...(input.deviceId ? { deviceId: input.deviceId } : {}),
    ...(locale ? { locale } : {}),
  };
}
