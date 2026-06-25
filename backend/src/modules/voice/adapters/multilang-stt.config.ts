/**
 * Multi-Language Code-Switching STT Configuration
 *
 * Handles seamless recognition of mixed-language speech (e.g. Chinese + English)
 * without requiring the user to switch language modes manually.
 *
 * Strategy per STT provider:
 * - Groq (Whisper large-v3-turbo): Set language=null for auto-detect; Whisper
 *   natively handles code-switching within a single utterance.
 * - Deepgram Nova-2: Use detect_language=true + multi_language=true parameters.
 * - AWS Transcribe: Use identify-multiple-languages with language_options.
 * - Web Speech API: Limited — set lang to primary language, relies on browser.
 *
 * This module provides unified config generation for each provider.
 */

export interface MultiLangConfig {
  /** Primary language hint (used when code-switching is off) */
  primaryLang: string;
  /** Whether code-switching detection is enabled */
  codeSwitchingEnabled: boolean;
  /** Expected language mix (helps providers optimize) */
  expectedLanguages: string[];
}

const DEFAULT_CONFIG: MultiLangConfig = {
  primaryLang: 'auto',
  codeSwitchingEnabled: true,
  expectedLanguages: ['zh', 'en'],
};

/**
 * Get Groq/Whisper config for code-switching.
 * Whisper large-v3 handles code-switching natively when language is not forced.
 */
export function getGroqMultiLangConfig(config: MultiLangConfig = DEFAULT_CONFIG): {
  language?: string;
  prompt: string;
} {
  if (!config.codeSwitchingEnabled) {
    return {
      language: config.primaryLang === 'auto' ? undefined : config.primaryLang,
      prompt: '',
    };
  }

  // For code-switching: do NOT set language — let Whisper auto-detect per segment
  return {
    language: undefined,
    prompt: buildCodeSwitchingPrompt(config.expectedLanguages),
  };
}

/**
 * Get Deepgram config for code-switching.
 */
export function getDeepgramMultiLangConfig(config: MultiLangConfig = DEFAULT_CONFIG): Record<string, string> {
  const params: Record<string, string> = {
    model: 'nova-2',
    smart_format: 'true',
    punctuate: 'true',
  };

  if (config.codeSwitchingEnabled) {
    params.detect_language = 'true';
    // Deepgram's multi_language feature for code-switching
    params.language = config.expectedLanguages.join(',');
  } else if (config.primaryLang !== 'auto') {
    params.language = config.primaryLang;
  } else {
    params.detect_language = 'true';
  }

  return params;
}

/**
 * Get AWS Transcribe config for code-switching.
 */
export function getAWSTranscribeMultiLangConfig(config: MultiLangConfig = DEFAULT_CONFIG): {
  identifyMultipleLanguages: boolean;
  languageOptions: string[];
  preferredLanguage?: string;
} {
  if (!config.codeSwitchingEnabled) {
    return {
      identifyMultipleLanguages: false,
      languageOptions: [],
      preferredLanguage: mapToAWSLangCode(config.primaryLang),
    };
  }

  return {
    identifyMultipleLanguages: true,
    languageOptions: config.expectedLanguages.map(mapToAWSLangCode),
    preferredLanguage: config.primaryLang !== 'auto'
      ? mapToAWSLangCode(config.primaryLang)
      : undefined,
  };
}

/**
 * Get Web Speech API lang parameter.
 * Web Speech API has limited code-switching support — we set the primary
 * language and hope the browser's engine handles mixing.
 */
export function getWebSpeechLang(config: MultiLangConfig = DEFAULT_CONFIG): string {
  if (config.primaryLang === 'auto' || config.codeSwitchingEnabled) {
    // For mixed Chinese+English, 'zh-CN' tends to handle English words better
    // than 'en-US' handles Chinese characters
    if (config.expectedLanguages.includes('zh')) return 'zh-CN';
    return 'en-US';
  }
  return config.primaryLang === 'zh' ? 'zh-CN' : 'en-US';
}

// ── Helpers ──

function buildCodeSwitchingPrompt(languages: string[]): string {
  const langNames: Record<string, string> = {
    zh: '中文/Chinese',
    en: 'English',
    ja: '日本語/Japanese',
    ko: '한국어/Korean',
    es: 'Español/Spanish',
    fr: 'Français/French',
    de: 'Deutsch/German',
  };

  const names = languages.map((l) => langNames[l] || l).join(', ');

  if (languages.includes('zh') && languages.includes('en')) {
    return `这段音频可能包含中英混合对话。请准确转录中文和英文内容，保留品牌名、专有名词的原文。The audio may contain mixed Chinese and English. Preserve brand names and proper nouns in their original language.`;
  }

  return `The audio may contain mixed speech in: ${names}. Transcribe accurately preserving all languages as spoken.`;
}

function mapToAWSLangCode(lang: string): string {
  const map: Record<string, string> = {
    zh: 'zh-CN',
    en: 'en-US',
    ja: 'ja-JP',
    ko: 'ko-KR',
    es: 'es-US',
    fr: 'fr-FR',
    de: 'de-DE',
  };
  return map[lang] || `${lang}-${lang.toUpperCase()}`;
}
