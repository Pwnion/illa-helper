/**
 * Language service:
 * supported languages and validation
 *
 * Features:
 * - 50+ languages
 * - language code validation and normalisation
 * - cached option lists
 */

import { browser } from 'wxt/browser';
import { LanguageOption } from '../../shared/types/api';
import { MultilingualConfig } from '../../shared/types/api';
import { Language } from './types';

// ==================== Language data ====================

/**
 * Supported languages
 */
const LANGUAGE_DEFINITIONS: { [key: string]: Language } = {
  // Popular languages
  en: { code: 'en', name: 'English', nativeName: 'English', isPopular: true },
  // Names for Han-script languages are given in English only
  zh: { code: 'zh', name: 'Chinese', nativeName: 'Chinese', isPopular: true },
  ja: { code: 'ja', name: 'Japanese', nativeName: 'Japanese', isPopular: true },
  ko: { code: 'ko', name: 'Korean', nativeName: '한국어', isPopular: true },
  fr: { code: 'fr', name: 'French', nativeName: 'Français', isPopular: true },
  de: { code: 'de', name: 'German', nativeName: 'Deutsch', isPopular: true },
  es: { code: 'es', name: 'Spanish', nativeName: 'Español', isPopular: true },
  ru: { code: 'ru', name: 'Russian', nativeName: 'Русский', isPopular: true },
  pt: {
    code: 'pt',
    name: 'Portuguese',
    nativeName: 'Português',
    isPopular: true,
  },
  it: { code: 'it', name: 'Italian', nativeName: 'Italiano', isPopular: true },
  hi: { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', isPopular: true },
  ar: { code: 'ar', name: 'Arabic', nativeName: 'العربية', isPopular: true },

  // European languages
  nl: { code: 'nl', name: 'Dutch', nativeName: 'Nederlands' },
  no: { code: 'no', name: 'Norwegian', nativeName: 'Norsk' },
  da: { code: 'da', name: 'Danish', nativeName: 'Dansk' },
  fi: { code: 'fi', name: 'Finnish', nativeName: 'Suomi' },
  sv: { code: 'sv', name: 'Swedish', nativeName: 'Svenska', isPopular: true },
  pl: { code: 'pl', name: 'Polish', nativeName: 'Polski' },
  el: { code: 'el', name: 'Greek', nativeName: 'Ελληνικά' },
  he: { code: 'he', name: 'Hebrew', nativeName: 'עברית' },
  cs: { code: 'cs', name: 'Czech', nativeName: 'Čeština' },
  hu: { code: 'hu', name: 'Hungarian', nativeName: 'Magyar' },
  ro: { code: 'ro', name: 'Romanian', nativeName: 'Română' },
  uk: { code: 'uk', name: 'Ukrainian', nativeName: 'Українська' },
  bg: { code: 'bg', name: 'Bulgarian', nativeName: 'Български' },
  hr: { code: 'hr', name: 'Croatian', nativeName: 'Hrvatski' },
  sk: { code: 'sk', name: 'Slovak', nativeName: 'Slovenčina' },
  sl: { code: 'sl', name: 'Slovenian', nativeName: 'Slovenščina' },
  et: { code: 'et', name: 'Estonian', nativeName: 'Eesti' },
  lv: { code: 'lv', name: 'Latvian', nativeName: 'Latviešu' },
  lt: { code: 'lt', name: 'Lithuanian', nativeName: 'Lietuvių' },
  ca: { code: 'ca', name: 'Catalan', nativeName: 'Català' },

  // Asian languages
  tr: { code: 'tr', name: 'Turkish', nativeName: 'Türkçe' },
  th: { code: 'th', name: 'Thai', nativeName: 'ไทย' },
  vi: { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
  id: { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia' },
  ms: { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu' },
  tl: { code: 'tl', name: 'Filipino', nativeName: 'Filipino' },
  ur: { code: 'ur', name: 'Urdu', nativeName: 'اردو' },
  bn: { code: 'bn', name: 'Bengali', nativeName: 'বাংলা' },
  ta: { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' },
  te: { code: 'te', name: 'Telugu', nativeName: 'తెలుగు' },
  fa: { code: 'fa', name: 'Persian', nativeName: 'فارسی' },
  kk: { code: 'kk', name: 'Kazakh', nativeName: 'Қазақша' },
  ky: { code: 'ky', name: 'Kyrgyz', nativeName: 'Кыргызча' },
  uz: { code: 'uz', name: 'Uzbek', nativeName: "O'zbek" },

  // Other languages
  sw: { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili' },
  am: { code: 'am', name: 'Amharic', nativeName: 'አማርኛ' },
  zu: { code: 'zu', name: 'Zulu', nativeName: 'IsiZulu' },
  af: { code: 'af', name: 'Afrikaans', nativeName: 'Afrikaans' },
  is: { code: 'is', name: 'Icelandic', nativeName: 'Íslenska' },
  mt: { code: 'mt', name: 'Maltese', nativeName: 'Malti' },
};

/**
 * Language code normalisation
 * for common code variants
 */
const LANGUAGE_CODE_NORMALIZATION: { [key: string]: string } = {
  // Chinese variants
  'zh-cn': 'zh',
  'zh-tw': 'zh',
  'zh-hk': 'zh',
  'zh-sg': 'zh',
  cmn: 'zh',
  chs: 'zh',
  cht: 'zh',

  // English variants
  'en-us': 'en',
  'en-gb': 'en',
  'en-au': 'en',
  'en-ca': 'en',
  'en-nz': 'en',
  'en-za': 'en',
  'en-ie': 'en',

  // Portuguese variants
  'pt-br': 'pt',
  'pt-pt': 'pt',

  // Spanish variants
  'es-es': 'es',
  'es-mx': 'es',
  'es-ar': 'es',
  'es-co': 'es',
  'es-cl': 'es',
  'es-pe': 'es',
  'es-ve': 'es',

  // French variants
  'fr-fr': 'fr',
  'fr-ca': 'fr',
  'fr-be': 'fr',
  'fr-ch': 'fr',

  // German variants
  'de-de': 'de',
  'de-at': 'de',
  'de-ch': 'de',

  // Arabic variants
  'ar-sa': 'ar',
  'ar-eg': 'ar',
  'ar-ae': 'ar',
  'ar-ma': 'ar',
  'ar-iq': 'ar',
  'ar-dz': 'ar',
  'ar-ly': 'ar',

  // Other variants
  nb: 'no', // Norwegian Bokmål
  nn: 'no', // Norwegian Nynorsk
  fil: 'tl', // Filipino
};

// ==================== Language service ====================

/**
 * Language service
 * (singleton)
 */
export class LanguageService {
  private static instance: LanguageService;

  // Caches
  private _targetLanguageOptionsCache: LanguageOption[] | null = null;
  private _popularLanguagesCache: Language[] | null = null;
  private _otherLanguagesCache: Language[] | null = null;

  /**
   * Private constructor (singleton)
   */
  private constructor() {}

  /**
   * Returns the singleton instance
   * @returns LanguageService instance
   */
  public static getInstance(): LanguageService {
    if (!LanguageService.instance) {
      LanguageService.instance = new LanguageService();
    }
    return LanguageService.instance;
  }

  // ==================== Language data access ====================

  /**
   * Every supported language
   * @returns language definitions
   */
  public get languages(): { [key: string]: Language } {
    return LANGUAGE_DEFINITIONS;
  }

  /**
   * Looks up a language
   * @param code language code
   * @returns language info or null
   */
  public getLanguage(code: string): Language | null {
    const normalizedCode = this.normalizeLanguageCode(code);
    return LANGUAGE_DEFINITIONS[normalizedCode] || null;
  }

  /**
   * Whether a language is supported
   * @param code language code
   * @returns whether it is supported
   */
  public isSupportedLanguage(code: string): boolean {
    const normalizedCode = this.normalizeLanguageCode(code);
    return normalizedCode in LANGUAGE_DEFINITIONS;
  }

  /**
   * Normalises a language code
   * @param code raw language code
   * @returns normalised code
   */
  public normalizeLanguageCode(code: string): string {
    const lowerCode = code.toLowerCase();
    return LANGUAGE_CODE_NORMALIZATION[lowerCode] || lowerCode;
  }

  /**
   * Detects the page's main language.
   * The single place for page language detection, so modules do not each roll their own.
   */
  public async detectPageLanguage(): Promise<string> {
    try {
      const textSample = document.body.innerText.substring(0, 1000);
      if (!textSample.trim()) {
        return 'en';
      }

      const result = await browser.i18n.detectLanguage(textSample);
      const detectedLang = result?.languages?.[0]?.language;
      if (!detectedLang) {
        return 'en';
      }

      return this.normalizeLanguageCode(detectedLang);
    } catch (error) {
      console.warn('[LanguageService] Page language detection failed:', error);
      return 'en';
    }
  }

  /**
   * Resolves the target language from the page language and language pair.
   * The single source of truth for translation direction.
   */
  public resolveTargetLanguage(
    multilingualConfig: MultilingualConfig,
    pageLanguage?: string | null,
  ): string {
    if (!pageLanguage) {
      return multilingualConfig.targetLanguage;
    }

    const normalizedPageLang = this.normalizeLanguageCode(pageLanguage);
    const normalizedTargetLang = this.normalizeLanguageCode(
      multilingualConfig.targetLanguage,
    );
    const normalizedNativeLang = this.normalizeLanguageCode(
      multilingualConfig.nativeLanguage,
    );

    if (normalizedPageLang === normalizedTargetLang) {
      return multilingualConfig.nativeLanguage;
    }

    if (normalizedPageLang === normalizedNativeLang) {
      return multilingualConfig.targetLanguage;
    }

    return multilingualConfig.targetLanguage;
  }

  // ==================== Option lists ====================

  /**
   * Popular languages (cached)
   * @returns popular languages
   */
  private getPopularLanguages(): Language[] {
    if (!this._popularLanguagesCache) {
      this._popularLanguagesCache = Object.values(LANGUAGE_DEFINITIONS)
        .filter((lang) => lang.isPopular)
        .sort((a, b) => {
          // English first, then alphabetical
          if (a.code === 'en') return -1;
          if (b.code === 'en') return 1;
          return a.name.localeCompare(b.name);
        });
    }
    return this._popularLanguagesCache;
  }

  /**
   * Other languages (cached)
   * @returns other languages
   */
  private getOtherLanguages(): Language[] {
    if (!this._otherLanguagesCache) {
      this._otherLanguagesCache = Object.values(LANGUAGE_DEFINITIONS)
        .filter((lang) => !lang.isPopular)
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    return this._otherLanguagesCache;
  }

  /**
   * Target language options
   * @returns language options
   */
  public getTargetLanguageOptions(): LanguageOption[] {
    if (!this._targetLanguageOptionsCache) {
      const allLanguages = [
        ...this.getPopularLanguages(),
        ...this.getOtherLanguages(),
      ];

      this._targetLanguageOptionsCache = allLanguages.map((lang) => ({
        code: lang.code,
        name: lang.name,
        nativeName: lang.nativeName,
        isPopular: lang.isPopular,
      }));
    }
    return this._targetLanguageOptionsCache;
  }

  // ==================== Display names ====================

  /**
   * Display name for a target language
   * @param languageCode language code
   * @returns formatted display name
   */
  public getTargetLanguageDisplayName(languageCode: string): string {
    const language = this.getLanguage(languageCode);
    if (!language) return languageCode.toUpperCase();
    return language.nativeName === language.name
      ? language.name
      : `${language.nativeName} (${language.name})`;
  }

  // ==================== Utilities ====================

  /**
   * Clears caches (for tests or resets)
   */
  public clearCache(): void {
    this._targetLanguageOptionsCache = null;
    this._popularLanguagesCache = null;
    this._otherLanguagesCache = null;
  }

  /**
   * Supported language codes
   * @returns language codes
   */
  public getSupportedLanguageCodes(): string[] {
    return Object.keys(LANGUAGE_DEFINITIONS);
  }

  /**
   * Popular language codes
   * @returns language codes
   */
  public getPopularLanguageCodes(): string[] {
    return this.getPopularLanguages().map((lang) => lang.code);
  }

  // ==================== Native language ====================

  /**
   * Native language options
   * @returns language options
   */
  public getNativeLanguageOptions(): LanguageOption[] {
    // Same list as the target language options
    return this.getTargetLanguageOptions();
  }
}

// ==================== Exports ====================

// Singleton instance
export const languageService = LanguageService.getInstance();

// Default export
export default LanguageService;
