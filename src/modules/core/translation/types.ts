/**
 * Core translation types:
 * text replacement, processing, prompts and languages
 */

import {
  ReplacementConfig,
  FullTextAnalysisResponse,
  ApiConfig,
  LanguageOption,
  MultilingualConfig,
} from '../../shared/types/api';
import { UserSettings } from '../../shared/types/storage';
import {
  UserLevel,
  OriginalWordDisplayMode,
  TranslationPosition,
  TranslationStyle,
} from '../../shared/types/core';

// ==================== Text replacement ====================

/**
 * Replacement result
 */
export interface ReplacementResult {
  original: string; // source text
  replaced: string; // text after replacement
  replacedWords: Array<{
    chinese: string;
    english: string;
    position: {
      start: number;
      end: number;
    };
    isNew: boolean; // whether the word is new to the learner
  }>;
}

/**
 * Cache key
 */
export interface CacheKey {
  text: string;
  sourceLanguage?: string;
  targetLanguage: string;
  userLevel: number;
  replacementRate: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  cacheSize: number;
}

// ==================== Text processing ====================

/**
 * Content segmentation configuration
 */
export interface SegmentConfig {
  maxSegmentLength: number;
  minSegmentLength: number;
  mergeSmallSegments: boolean;
}

/**
 * Processing statistics
 */
export interface ProcessingStats {
  coordinator: any; // coordinator statistics
  global: any; // global statistics
}

// ==================== Prompts ====================

/**
 * Prompt configuration
 */
export interface PromptConfig {
  targetLanguage: string;
  userLevel: UserLevel;
  replacementRate: number;
}

/**
 * Prompt generation options
 */
export interface PromptOptions {
  isTraditional?: boolean;
  includeExamples?: boolean;
  customInstructions?: string;
}

// ==================== Languages ====================

/**
 * Language information
 */
export interface Language {
  code: string; // e.g., 'en', 'zh', 'ja'
  name: string; // e.g., 'English', 'Chinese', 'Japanese'
  nativeName: string; // e.g. 'English', 'Svenska'
  isPopular?: boolean; // listed among popular languages
}

// ==================== Service base ====================

/**
 * Service base configuration
 */
export interface ServiceConfig {
  enableLogging?: boolean;
  cacheEnabled?: boolean;
  maxRetries?: number;
}

/**
 * Service initialisation options
 */
export interface ServiceInitOptions {
  apiConfig?: ApiConfig;
  userSettings?: UserSettings;
  customConfig?: Record<string, any>;
}

// ==================== Translation flow ====================

/**
 * Translation processing context
 */
export interface TranslationContext {
  text: string;
  settings: UserSettings;
  config: ReplacementConfig;
  originalWordDisplayMode: OriginalWordDisplayMode;
  translationPosition: TranslationPosition;
  showParentheses: boolean;
  maxLength?: number;
}

/**
 * Translation processing result
 */
export interface TranslationProcessResult {
  success: boolean;
  result?: FullTextAnalysisResponse;
  error?: string;
  fromCache?: boolean;
}

// ==================== Exports ====================

export type {
  UserSettings,
  ReplacementConfig,
  FullTextAnalysisResponse,
  ApiConfig,
  LanguageOption,
  MultilingualConfig,
  UserLevel,
  OriginalWordDisplayMode,
  TranslationPosition,
  TranslationStyle,
};
