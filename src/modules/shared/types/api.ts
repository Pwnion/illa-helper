/**
 * API types:
 * API configuration and translation request/response interfaces
 */

export enum ApiProtocolFamily {
  OPENAI_COMPATIBLE = 'openai-compatible',
  GEMINI = 'gemini',
}

// A single word-mode replacement
export interface Replacement {
  original: string;
  translation: string;
  position: {
    start: number;
    end: number;
  };
  isNew: boolean;
  explanation?: string;
  // Pronunciation fields
  hasPhonetic?: boolean;
  phoneticData?: any; // typed in the pronunciation module
  // Language detection info
  detectedSourceLanguage?: string;
  targetLanguage?: string;
}

// Full-text analysis response
export interface FullTextAnalysisResponse {
  original: string;
  processed: string;
  replacements: Replacement[];
}

// API configuration
export interface ApiConfig {
  apiKey: string;
  apiEndpoint: string;
  model: string;
  temperature: number;
  enable_thinking?: boolean;
  includeThinkingParam?: boolean;
  customParams?: string;
  phraseEnabled?: boolean;
  requestsPerSecond?: number; // maximum requests per second
}

// API configuration item with metadata
export interface ApiConfigItem {
  id: string;
  name: string;
  protocolFamily: ApiProtocolFamily;
  config: ApiConfig;
}

// Replacement configuration
export interface ReplacementConfig {
  userLevel: import('./core').UserLevel;
  replacementRate: number;
  useGptApi: boolean;
  userSettings: import('./storage').UserSettings;
  activeApiConfig: ApiConfigItem | null;
  apiConfig: ApiConfig;
  inlineTranslation: boolean;
  translationStyle: import('./core').TranslationStyle;
}

// Language pair
export interface MultilingualConfig {
  nativeLanguage: string; // the user's native language
  targetLanguage: string; // the language being learned
}

// Language option
export interface LanguageOption {
  code: string;
  name: string;
  nativeName: string;
  isPopular?: boolean;
}
