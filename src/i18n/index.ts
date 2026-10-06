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
 * 检测浏览器语言并映射到支持的语言
 * @returns 检测到的语言代码，如果不支持则返回null
 */
function detectBrowserLanguage(): Locale | null {
  try {
    // 获取浏览器语言设置
    const browserLanguage = navigator.language || navigator.languages?.[0];

    if (!browserLanguage) {
      return null;
    }

    // 尝试直接匹配
    if (BROWSER_LANGUAGE_MAP[browserLanguage]) {
      return BROWSER_LANGUAGE_MAP[browserLanguage];
    }

    // 尝试匹配语言代码（去掉地区代码）
    const languageCode = browserLanguage.split('-')[0];
    if (BROWSER_LANGUAGE_MAP[languageCode]) {
      return BROWSER_LANGUAGE_MAP[languageCode];
    }

    return null;
  } catch (error) {
    console.warn('浏览器语言检测失败:', error);
    return null;
  }
}

/**
 * 导出浏览器语言检测函数，用于测试和调试
 */
export function getDetectedBrowserLanguage(): Locale | null {
  return detectBrowserLanguage();
}

// 创建 i18n 实例
export const i18n = createI18n({
  legacy: false, // 使用 Composition API
  locale: DEFAULT_LOCALE,
  fallbackLocale: 'en-US',
  messages: {
    'en-US': enUS,
    'ko-KR': koKR,
    'es-ES': esES,
  },
  // 配置选项
  missingWarn: false, // 开发时关闭缺失翻译警告
  fallbackWarn: false, // 开发时关闭回退警告
  // 启用运行时优化
  runtimeOnly: false,
  // 支持嵌套结构
  flatJson: false,
});

// 获取当前语言
export function getCurrentLocale(): Locale {
  return i18n.global.locale.value;
}

// 设置语言
export function setLocale(locale: Locale): void {
  if (SUPPORTED_LOCALES.includes(locale)) {
    (i18n.global.locale as any).value = locale;
    // 保存到本地存储
    localStorage.setItem('preferred-locale', locale);
  }
}

// 获取语言显示名称
export function getLocaleName(locale: Locale): string {
  return LOCALE_NAMES[locale] || locale;
}

// 初始化语言设置
export function initializeLocale(): void {
  // 优先使用用户已保存的语言设置
  const savedLocale = localStorage.getItem('preferred-locale');
  if (savedLocale && SUPPORTED_LOCALES.includes(savedLocale as Locale)) {
    setLocale(savedLocale as Locale);
    return;
  }

  // 如果没有用户设置，则检测浏览器语言
  const detectedLanguage = detectBrowserLanguage();
  if (detectedLanguage) {
    setLocale(detectedLanguage);
    return;
  }

  // 如果检测失败，使用默认语言
  setLocale(DEFAULT_LOCALE);
}

export default i18n;
