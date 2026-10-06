import { createI18n } from 'vue-i18n';
import type { Locale } from 'vue-i18n';

// Locale bundles. Strings missing from a bundle fall back to en-US.
import enUS from './locales/en-US.json';
import koKR from './locales/ko-KR.json';
import esES from './locales/es-ES.json';

export const SUPPORTED_LOCALES: Locale[] = ['en-US', 'ko-KR', 'es-ES'];

export const LOCALE_NAMES: Record<Locale, string> = {
  'en-US': 'English',
  'ko-KR': '한국어',
  'es-ES': 'Español',
};

const DEFAULT_LOCALE: Locale = 'en-US';

// Maps browser language tags to a supported UI locale
const BROWSER_LANGUAGE_MAP: Record<string, Locale> = {
  en: 'en-US',
  'en-US': 'en-US',
  'en-GB': 'en-US',
  ko: 'ko-KR',
  'ko-KR': 'ko-KR',
  es: 'es-ES',
  'es-ES': 'es-ES',
  'es-MX': 'es-ES',
  'es-AR': 'es-ES',
};

/**
 * Detects the browser language and maps it to a supported locale
 * @returns the detected locale, or null when unsupported
 */
function detectBrowserLanguage(): Locale | null {
  try {
    const browserLanguage = navigator.language || navigator.languages?.[0];

    if (!browserLanguage) {
      return null;
    }

    // Exact match first
    if (BROWSER_LANGUAGE_MAP[browserLanguage]) {
      return BROWSER_LANGUAGE_MAP[browserLanguage];
    }

    // Then the bare language code
    const languageCode = browserLanguage.split('-')[0];
    if (BROWSER_LANGUAGE_MAP[languageCode]) {
      return BROWSER_LANGUAGE_MAP[languageCode];
    }

    return null;
  } catch (error) {
    console.warn('Browser language detection failed:', error);
    return null;
  }
}

/**
 * Exposed for tests and debugging
 */
export function getDetectedBrowserLanguage(): Locale | null {
  return detectBrowserLanguage();
}

export const i18n = createI18n({
  legacy: false, // Composition API
  locale: DEFAULT_LOCALE,
  fallbackLocale: 'en-US',
  messages: {
    'en-US': enUS,
    'ko-KR': koKR,
    'es-ES': esES,
  },
  missingWarn: false,
  fallbackWarn: false,
  runtimeOnly: false,
  flatJson: false,
});

// Current locale
export function getCurrentLocale(): Locale {
  return i18n.global.locale.value;
}

// Set the locale
export function setLocale(locale: Locale): void {
  if (SUPPORTED_LOCALES.includes(locale)) {
    (i18n.global.locale as any).value = locale;
    // Persist the choice
    localStorage.setItem('preferred-locale', locale);
  }
}

// Locale display name
export function getLocaleName(locale: Locale): string {
  return LOCALE_NAMES[locale] || locale;
}

// Initialise the locale
export function initializeLocale(): void {
  // A saved preference wins
  const savedLocale = localStorage.getItem('preferred-locale');
  if (savedLocale && SUPPORTED_LOCALES.includes(savedLocale as Locale)) {
    setLocale(savedLocale as Locale);
    return;
  }

  // Otherwise detect the browser language
  const detectedLanguage = detectBrowserLanguage();
  if (detectedLanguage) {
    setLocale(detectedLanguage);
    return;
  }

  // Fall back to the default locale
  setLocale(DEFAULT_LOCALE);
}

export default i18n;
