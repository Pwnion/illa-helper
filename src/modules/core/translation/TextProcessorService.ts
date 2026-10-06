/**
 * Text processing service:
 * walks the DOM, extracts text nodes and processes them
 */

import {
  OriginalWordDisplayMode,
  TranslationPosition,
} from '../../shared/types/core';
import { ApiConfigItem } from '../../shared/types/api';
import { PronunciationService } from '../../pronunciation/services/PronunciationService';
import { DEFAULT_PRONUNCIATION_CONFIG } from '../../pronunciation/config';
import { getSpeechLocale, supportsPhonetics } from '../../shared/speechLocale';
import { ContentSegmenter } from '../../processing/ContentSegmenter';
import { ProcessingCoordinator } from '../../processing/ProcessingCoordinator';
import { globalProcessingState } from '../../processing/ProcessingStateManager';
import { ReplacementBudget } from '../../processing/ReplacementBudget';
import type { TextReplacementEngine } from '../../processing/ProcessingContracts';

// Content segmentation configuration
export interface SegmentConfig {
  maxSegmentLength: number;
  minSegmentLength: number;
  mergeSmallSegments: boolean;
}

// Processing statistics
export interface ProcessingStats {
  coordinator: any; // coordinator statistics
  global: any; // global statistics
}

// Text processing service configuration
export interface TextProcessorConfig {
  enablePronunciationTooltip?: boolean;
  apiConfigItem?: ApiConfigItem | null;
  segmentConfig?: Partial<SegmentConfig>;
  /** Learner's native language; dictionary glosses are written in it */
  nativeLanguage?: string;
  /** Language translations are written in; drives speech voice and phonetics */
  targetLanguage?: string;
}

/**
 * Text processing service
 * (singleton) for word-mode DOM text processing
 */
export class TextProcessorService {
  // Singleton instance
  private static instance: TextProcessorService | null = null;

  // Components
  private pronunciationService!: PronunciationService;
  private contentSegmenter!: ContentSegmenter;
  private processingCoordinator!: ProcessingCoordinator;
  private config: TextProcessorConfig;

  /**
   * Private constructor (singleton)
   */
  private constructor(config: TextProcessorConfig = {}) {
    this.config = {
      enablePronunciationTooltip: true,
      ...config,
    };

    this.initializeServices();
    this.injectGlowStyle();
  }

  /**
   * Returns the singleton instance
   */
  public static getInstance(
    config?: TextProcessorConfig,
  ): TextProcessorService {
    if (!TextProcessorService.instance) {
      TextProcessorService.instance = new TextProcessorService(config);
    }
    return TextProcessorService.instance;
  }

  /**
   * Resets the instance (mainly for tests)
   */
  public static resetInstance(): void {
    TextProcessorService.instance = null;
  }

  /**
   * Creates the service components
   */
  private initializeServices(): void {
    // Pronunciation configuration
    const targetLanguage = this.config.targetLanguage || 'sv';
    const pronunciationConfig = {
      ...DEFAULT_PRONUNCIATION_CONFIG,
      ttsConfig: {
        ...DEFAULT_PRONUNCIATION_CONFIG.ttsConfig,
        lang: getSpeechLocale(targetLanguage),
      },
      uiConfig: {
        ...DEFAULT_PRONUNCIATION_CONFIG.uiConfig,
        tooltipEnabled: this.config.enablePronunciationTooltip ?? true,
        showPhonetic: supportsPhonetics(targetLanguage),
      },
    };

    // Create the components
    this.pronunciationService = new PronunciationService(
      pronunciationConfig,
      this.config.apiConfigItem ?? null,
    );
    this.pronunciationService.setLanguages(
      this.config.nativeLanguage || 'en',
      targetLanguage,
    );
    this.contentSegmenter = new ContentSegmenter();
    this.processingCoordinator = new ProcessingCoordinator(
      this.pronunciationService,
    );
  }

  /**
   * Injects the styles
   * text processing needs
   */
  private injectGlowStyle(): void {
    if ((window as any).wxtGlowStyleInjected) return;

    const style = document.createElement('style');
    style.textContent = `
      @keyframes wxt-glow-animation {
        from {
          background-color: rgba(106, 136, 224, 0.3);
          box-shadow: 0 0 8px rgba(106, 136, 224, 0.5);
        }
        to {
          background-color: transparent;
          box-shadow: 0 0 0 transparent;
        }
      }
      .wxt-glow {
        animation: wxt-glow-animation 0.8s ease-out;
        border-radius: 3px;
      }
      .wxt-original-word--learning {
        filter: blur(5px);
        cursor: pointer;
        transition: filter 0.2s ease-in-out;
      }

      .wxt-original-word--learning:hover {
        filter: blur(0) !important;
      }

      /* Hover support for learning mode inside links */
      a .wxt-original-word--learning:hover,
      a:hover .wxt-original-word--learning {
        filter: blur(0) !important;
      }

      /* Phonetic error */
      .wxt-phonetic-error {
        font-family: 'SF Mono', 'Monaco', 'Consolas', 'Roboto Mono', monospace;
        font-size: 13px;
        color: #ff9999;
        font-style: italic;
        font-weight: 500;
        background: linear-gradient(135deg, rgba(255, 153, 153, 0.1) 0%, rgba(255, 153, 153, 0.05) 100%);
        padding: 4px 8px;
        border-radius: 6px;
        display: inline-block;
        border: 1px solid rgba(255, 153, 153, 0.3);
        letter-spacing: 0.02em;
        opacity: 0.8;
      }

      /* Nested word tooltip title row */
      .wxt-word-title-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 8px;
      }

      .wxt-word-title-row .wxt-word-main {
        flex: 1;
      }

      .wxt-word-title-row .wxt-accent-buttons {
        flex-shrink: 0;
      }
      @keyframes wxt-processing-animation {
        0% {
          background-color: rgba(106, 136, 224, 0.1);
        }
        50% {
          background-color: rgba(106, 136, 224, 0.3);
        }
        100% {
          background-color: rgba(106, 136, 224, 0.1);
        }
      }
      .wxt-processing {
        animation: wxt-processing-animation 2s infinite ease-in-out;
        border-radius: 3px;
        transition: background-color 0.3s ease-out;
        pointer-events: none !important;
      }
      
      /* Links stay clickable while processing */
      a.wxt-processing,
      a.wxt-processing *,
      .wxt-processing a,
      .wxt-processing a * {
        pointer-events: auto !important;
        cursor: pointer !important;
      }
      
      /* Buttons stay clickable while processing */
      button.wxt-processing,
      button.wxt-processing *,
      .wxt-processing button,
      .wxt-processing button * {
        pointer-events: auto !important;
        cursor: pointer !important;
      }
      
      /* Clickable elements stay clickable while processing */
      [onclick].wxt-processing,
      [onclick].wxt-processing *,
      .wxt-processing [onclick],
      .wxt-processing [onclick] * {
        pointer-events: auto !important;
        cursor: pointer !important;
      }
    `;

    document.head.appendChild(style);
    (window as any).wxtGlowStyleInjected = true;
  }

  // =================================================================
  // Core processing flow
  // =================================================================

  /**
   * Processes a root node.
   * Main text processing entry point, with segmentation and unified processing.
   * @param root root node
   * @param textReplacer text replacer
   * @param originalWordDisplayMode original word display mode
   * @param maxLength maximum segment length
   * @param translationPosition translation position
   * @param showParentheses whether to show parentheses
   */
  public async processRoot(
    root: Node,
    textReplacer: TextReplacementEngine,
    originalWordDisplayMode: OriginalWordDisplayMode,
    maxLength: number = 400,
    translationPosition: TranslationPosition,
    showParentheses: boolean,
    replacementBudget?: ReplacementBudget,
  ): Promise<void> {
    try {
      // Update the segmenter configuration
      this.updateSegmentConfig({
        maxSegmentLength: maxLength,
        minSegmentLength: 20,
        mergeSmallSegments: true,
      });

      // Split the root node into content segments
      const segments = this.contentSegmenter.segmentContent(root);
      if (segments.length === 0) {
        return;
      }

      const activeBudget =
        replacementBudget ??
        ReplacementBudget.fromSegments(
          segments,
          textReplacer.getConfig().replacementRate,
        );

      // Process through the coordinator
      await this.processingCoordinator.processSegments(
        segments,
        textReplacer,
        originalWordDisplayMode,
        translationPosition,
        showParentheses,
        false, // isLazyLoading
        activeBudget,
      );
    } catch (error) {
      console.warn('Error during text processing:', error);
      // Swallow errors so the page keeps working
    }
  }

  // =================================================================
  // Configuration management
  // =================================================================

  /**
   * Updates the service configuration
   * @param config partial configuration
   */
  public updateConfig(config: Partial<TextProcessorConfig>): void {
    this.config = { ...this.config, ...config };

    // An API config change must reach the pronunciation service
    if ('apiConfigItem' in config) {
      this.updateApiConfig(config.apiConfigItem ?? null);
    }
  }

  /**
   * Current configuration
   */
  public getConfig(): TextProcessorConfig {
    return { ...this.config };
  }

  /**
   * Updates the segmentation configuration
   * @param segmentConfig segmentation configuration
   */
  public updateSegmentConfig(segmentConfig: Partial<SegmentConfig>): void {
    this.contentSegmenter.updateConfig(segmentConfig);
  }

  /**
   * Updates the API configuration.
   * Takes effect immediately at runtime.
   * @param apiConfigItem API configuration item
   */
  public updateApiConfig(apiConfigItem: ApiConfigItem | null): void {
    try {
      if (this.pronunciationService) {
        this.pronunciationService.updateApiConfig(apiConfigItem);
      }

      // Update the internal configuration
      this.config.apiConfigItem = apiConfigItem;
    } catch (error) {
      console.warn('Error while updating the API configuration:', error);
    }
  }

  // =================================================================
  // Statistics and monitoring
  // =================================================================

  /**
   * Processing statistics
   * @returns statistics
   */
  public getProcessingStats(): ProcessingStats {
    return {
      coordinator: this.processingCoordinator.getStats(),
      global: globalProcessingState.getProcessingStats(),
    };
  }

  /**
   * Resets processing statistics
   */
  public resetStats(): void {
    this.processingCoordinator.resetStats();
    globalProcessingState.reset();
  }

  // =================================================================
  // Service lifecycle
  // =================================================================

  /**
   * Initialises the service
   */
  public async initialize(): Promise<void> {
    // Async initialisation can go here
    console.log('TextProcessorService initialised');
  }

  /**
   * Releases resources
   */
  public dispose(): void {
    this.resetStats();
    // Release other resources
    console.log('TextProcessorService resources released');
  }

  // =================================================================
  // Utility methods
  // =================================================================

  /**
   * Whether the service is ready
   */
  public isReady(): boolean {
    return !!(
      this.pronunciationService &&
      this.contentSegmenter &&
      this.processingCoordinator
    );
  }

  /**
   * Service status
   */
  public getStatus(): {
    isReady: boolean;
    stats: ProcessingStats;
    config: TextProcessorConfig;
  } {
    return {
      isReady: this.isReady(),
      stats: this.getProcessingStats(),
      config: this.getConfig(),
    };
  }

  /**
   * Returns the pronunciation service
   * @returns pronunciation service
   */
  public getPronunciationService(): PronunciationService | undefined {
    return this.pronunciationService;
  }
}

// Convenience accessor
export const getTextProcessorService = (config?: TextProcessorConfig) => {
  return TextProcessorService.getInstance(config);
};
