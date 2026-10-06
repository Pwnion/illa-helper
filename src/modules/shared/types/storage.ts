/**
 * Settings storage types:
 * user settings, context menu and messaging interfaces
 */

import type {
  UserLevel,
  TranslationStyle,
  TriggerMode,
  OriginalWordDisplayMode,
  TranslationPosition,
  TranslationMode,
  ContextMenuActionType,
  UrlPatternType,
  LazyLoadingConfig,
} from './core';
import type { ApiConfigItem, MultilingualConfig } from './api';
import type { TooltipHotkey, FloatingBallConfig } from './ui';

// User settings
export interface UserSettings {
  userLevel: UserLevel;
  replacementRate: number;
  isEnabled: boolean;
  useGptApi: boolean;
  // Multiple API configurations
  apiConfigs: ApiConfigItem[];
  activeApiConfigId: string;
  translationStyle: TranslationStyle;
  translationMode: TranslationMode;
  triggerMode: TriggerMode;
  maxLength?: number;
  originalWordDisplayMode: OriginalWordDisplayMode;
  enablePronunciationTooltip: boolean;
  // Native and target language
  multilingualConfig: MultilingualConfig;
  // Pronunciation tooltip hotkey
  pronunciationHotkey: TooltipHotkey;
  // Floating ball
  floatingBall: FloatingBallConfig;
  // Translation position
  translationPosition: TranslationPosition;
  // Whether to wrap translations in parentheses
  showParentheses: boolean;
  // API request timeout
  apiRequestTimeout: number; // milliseconds
  // Custom translation style CSS
  customTranslationCSS: string;
  // Lazy loading
  lazyLoading: LazyLoadingConfig;
}

// Context menu message
export interface ContextMenuMessage {
  type: ContextMenuActionType;
  url: string;
  pattern: string;
  patternType: UrlPatternType;
  description?: string;
}
