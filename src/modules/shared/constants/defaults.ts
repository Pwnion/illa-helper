/**
 * Default configuration constants
 * used throughout the project
 */

import type {
  ApiConfig,
  ApiConfigItem,
  ApiProtocolFamily,
  MultilingualConfig,
} from '../types/api';
import type { FloatingBallConfig, TooltipHotkey } from '../types/ui';
import type { UserSettings } from '../types/storage';
import type { LazyLoadingConfig } from '../types/core';
import { createEmptyApiConfig } from '../ApiConfigHelpers';
import {
  UserLevel,
  TranslationStyle,
  TriggerMode,
  OriginalWordDisplayMode,
  TranslationPosition,
  TranslationMode,
} from '../types/core';

// Default API configuration
export const DEFAULT_API_CONFIG: ApiConfig = {
  ...createEmptyApiConfig(),
  apiKey: import.meta.env.VITE_WXT_DEFAULT_API_KEY || '',
  apiEndpoint:
    import.meta.env.VITE_WXT_DEFAULT_API_ENDPOINT ||
    'https://api.openai.com/v1/chat/completions',
  model: import.meta.env.VITE_WXT_DEFAULT_MODEL || 'gpt-4o-mini',
  temperature: parseFloat(import.meta.env.VITE_WXT_DEFAULT_TEMPERATURE) || 0,
};

// Default language pair
export const DEFAULT_MULTILINGUAL_CONFIG: MultilingualConfig = {
  nativeLanguage: 'en',
  targetLanguage: 'sv',
};

// Default pronunciation hotkey
export const DEFAULT_PRONUNCIATION_HOTKEY: TooltipHotkey = {
  enabled: true,
  modifierKeys: [],
  description: 'Hotkey',
};

// Default floating ball configuration
export const DEFAULT_FLOATING_BALL_CONFIG: FloatingBallConfig = {
  enabled: true,
  position: 50, // centred
  opacity: 0.8, // 80% opacity
};

// Default lazy loading configuration
export const DEFAULT_LAZY_LOADING_CONFIG: LazyLoadingConfig = {
  enabled: true,
  preloadDistance: 0.5, // preload half a screen ahead
};

// Builds the default API configuration item
function createDefaultApiConfigItem(): ApiConfigItem {
  return {
    id: 'default-config',
    name: 'OpenAI',
    protocolFamily: 'openai-compatible' as ApiProtocolFamily,
    config: DEFAULT_API_CONFIG,
  };
}

// Default user settings
export const DEFAULT_SETTINGS: UserSettings = {
  userLevel: UserLevel.B1,
  replacementRate: 0.3,
  isEnabled: true,
  useGptApi: true,
  apiConfigs: [createDefaultApiConfigItem()],
  activeApiConfigId: 'default-config',
  translationStyle: TranslationStyle.DEFAULT,
  translationMode: TranslationMode.WORD,
  triggerMode: TriggerMode.MANUAL,
  maxLength: 400,
  originalWordDisplayMode: OriginalWordDisplayMode.VISIBLE,
  enablePronunciationTooltip: true,
  multilingualConfig: DEFAULT_MULTILINGUAL_CONFIG,
  pronunciationHotkey: DEFAULT_PRONUNCIATION_HOTKEY,
  floatingBall: DEFAULT_FLOATING_BALL_CONFIG,
  translationPosition: TranslationPosition.AFTER,
  showParentheses: true,
  apiRequestTimeout: 0, // no timeout
  customTranslationCSS: '',
  lazyLoading: DEFAULT_LAZY_LOADING_CONFIG,
};
