import {
  UserSettings,
  OriginalWordDisplayMode,
  TranslationPosition,
  ReplacementConfig,
} from '@/src/modules/shared/types';
import { StyleManager } from '@/src/modules/styles';
import { TextProcessorService } from '@/src/modules/core/translation/TextProcessorService';
import { TextReplacerService } from '@/src/modules/core/translation/TextReplacerService';
import { ParagraphTranslationService } from '@/src/modules/core/translation/ParagraphTranslationService';
import type { SentenceTranslationService } from '../sentence/SentenceTranslationService';
import { FloatingBallManager } from '@/src/modules/floatingBall';
import { LazyLoadingService } from './services/LazyLoadingService';

/**
 * Main content script service
 */
export interface IContentManager {
  init(): Promise<void>;
  destroy(): void;
}

/**
 * Configuration service
 */
export interface IConfigurationService {
  getUserSettings(): Promise<UserSettings>;
  createReplacementConfig(
    settings: UserSettings,
    pageLanguage?: string,
  ): ReplacementConfig;
  updateConfiguration(
    settings: UserSettings,
    styleManager: StyleManager,
    textReplacer: TextReplacerService,
    pageLanguage?: string,
  ): void;
}

/**
 * Processing service
 */
export interface IProcessingService {
  processPage(): Promise<void>;
  updateSettings(settings: UserSettings): void;
}

/**
 * Listener service
 */
export interface IListenerService {
  setupMessageListeners(): void;
  setupDomObserver(): void;
  destroy(): void;
}

/**
 * Service container
 */
export interface ServiceContainer {
  styleManager: StyleManager;
  textProcessor: TextProcessorService;
  textReplacer: TextReplacerService;
  floatingBallManager: FloatingBallManager;
  lazyLoadingService?: LazyLoadingService;
  paragraphTranslationService: ParagraphTranslationService;
  sentenceTranslationService: SentenceTranslationService;
}

/**
 * Processing parameters
 */
export interface ProcessingParams {
  originalWordDisplayMode: OriginalWordDisplayMode;
  maxLength: number | undefined;
  translationPosition: TranslationPosition;
  showParentheses: boolean;
}
