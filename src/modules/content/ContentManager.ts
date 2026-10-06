import { browser } from 'wxt/browser';
import { UserSettings, TriggerMode } from '@/src/modules/shared/types';
import { TranslationMode } from '@/src/modules/shared/types/core';
import { StyleManager } from '@/src/modules/styles';
import { TextProcessorService } from '@/src/modules/core/translation/TextProcessorService';
import { TextReplacerService } from '@/src/modules/core/translation/TextReplacerService';
import { ParagraphTranslationService } from '@/src/modules/core/translation/ParagraphTranslationService';
import { SentenceTranslationService } from '@/src/modules/sentence/SentenceTranslationService';

import { FloatingBallManager } from '@/src/modules/floatingBall';
import { WebsiteManager } from '@/src/modules/options/website-management/manager';

import { ConfigurationService } from './services/ConfigurationService';
import { ProcessingService } from './services/ProcessingService';
import { ListenerService } from './services/ListenerService';
import { IContentManager, ServiceContainer } from './types';
import { LazyLoadingService } from './services/LazyLoadingService';
import { ContentSegment } from '../processing/ProcessingStateManager';
import { languageService } from '../core/translation/LanguageService';

/**
 * Translation visibility state manager.
 *
 * Responsibilities:
 * - shows or hides page translations through a global CSS class
 * - toggles state from the hotkey and the floating ball
 * - keeps the floating ball's visual state in sync
 *
 * Design:
 * - a CSS class instead of per-element changes, for performance
 * - translations added later inherit the current visibility
 * - the floating ball updates as soon as the state changes
 */
export class TranslationStateManager {
  /** Whether translations are visible */
  private isTranslationVisible = true;

  /** Page processing service */
  private processingService?: ProcessingService;

  /** Paragraph translation service */
  private paragraphTranslationService?: ParagraphTranslationService;

  /** Sentence translation service */
  private sentenceTranslationService?: SentenceTranslationService;

  /** Floating ball manager */
  private floatingBallManager?: any;

  /** CSS class that hides translations */
  private readonly HIDDEN_CLASS = 'wxt-translation-hidden';

  /** Translation selector */
  private readonly TRANSLATION_SELECTOR = '.wxt-translation-term';

  constructor(
    processingService?: ProcessingService,
    floatingBallManager?: any,
    paragraphTranslationService?: ParagraphTranslationService,
    sentenceTranslationService?: SentenceTranslationService,
  ) {
    this.processingService = processingService;
    this.floatingBallManager = floatingBallManager;
    this.paragraphTranslationService = paragraphTranslationService;
    this.sentenceTranslationService = sentenceTranslationService;
  }

  /**
   * Toggles translation visibility.
   *
   * Logic:
   * 1. if the page has no translations yet, translate it
   * 2. otherwise toggle visibility
   * 3. update the floating ball
   */
  async toggleTranslationState(): Promise<void> {
    const hasTranslatedContent = this.hasTranslatedContent();

    if (!hasTranslatedContent) {
      // No translations yet: translate
      await this.executeTranslation();
    } else {
      // Translations exist: toggle visibility
      this.toggleVisibilityState();
    }

    // Sync the floating ball
    this.syncFloatingBallState();
  }

  /**
   * Translates the page
   * @private
   */
  private async executeTranslation(): Promise<void> {
    // Read settings to pick the translation mode
    const storageService = (
      await import('../core/storage/StorageService')
    ).StorageService.getInstance();
    const settings = await storageService.getUserSettings();

    if (settings.translationMode === TranslationMode.PARAGRAPH) {
      // Paragraph mode
      if (this.paragraphTranslationService) {
        await this.paragraphTranslationService.start();
      }
    } else if (settings.translationMode === TranslationMode.SENTENCE) {
      await this.sentenceTranslationService?.start();
    } else {
      // Word mode
      if (this.processingService) {
        await this.processingService.processPage();
      }
    }

    this.isTranslationVisible = true;
    document.body.classList.remove(this.HIDDEN_CLASS);
  }

  /**
   * Toggles visibility
   * @private
   */
  private toggleVisibilityState(): void {
    this.isTranslationVisible = !this.isTranslationVisible;

    if (this.isTranslationVisible) {
      document.body.classList.remove(this.HIDDEN_CLASS);
    } else {
      document.body.classList.add(this.HIDDEN_CLASS);
    }
  }

  /**
   * After an explicit user trigger, results must be visible.
   * Dynamic content processing must not call this, or async content would force the page back into translation mode after the user switched to the original.
   */
  public showTranslations(): void {
    this.isTranslationVisible = true;
    document.body.classList.remove(this.HIDDEN_CLASS);
    this.syncFloatingBallState();
  }

  /**
   * Syncs the floating ball state
   * @private
   */
  private syncFloatingBallState(): void {
    if (this.floatingBallManager?.updateTranslationStateIndicator) {
      this.floatingBallManager.updateTranslationStateIndicator();
    }
  }

  /**
   * Whether the page has translations
   * @private
   */
  private hasTranslatedContent(): boolean {
    // Word translations
    const hasWordTranslation =
      document.querySelector(this.TRANSLATION_SELECTOR) !== null;

    // Paragraph translations
    const hasParagraphTranslation =
      document.querySelector('.illa-paragraph-translation') !== null;

    // Sentence translations
    const hasSentenceTranslation = document.querySelector('.illa-st') !== null;

    return (
      hasWordTranslation || hasParagraphTranslation || hasSentenceTranslation
    );
  }

  /**
   * Current visibility
   */
  getTranslationVisibility(): boolean {
    return this.isTranslationVisible;
  }

  /**
   * Clears paragraph translations and restores the original DOM for sentence
   * translations
   */
  public clearAllTranslations(): void {
    try {
      this.paragraphTranslationService?.clearAllTranslations();
      this.sentenceTranslationService?.restore();
      this.isTranslationVisible = true;
      document.body.classList.remove(this.HIDDEN_CLASS);
      this.syncFloatingBallState();
    } catch (error) {
      console.error('[ContentManager] Failed to clear translations:', error);
    }
  }

  /**
   * Updates the processing service reference
   */
  updateProcessingService(processingService: ProcessingService): void {
    this.processingService = processingService;
  }

  /**
   * Updates the floating ball manager reference
   */
  updateFloatingBallManager(floatingBallManager: any): void {
    this.floatingBallManager = floatingBallManager;
  }
}

/**
 * Main content script manager.
 * Coordinates every sub-service and manages their lifecycle.
 */
export class ContentManager implements IContentManager {
  private configurationService: ConfigurationService;
  private processingService?: ProcessingService;
  private listenerService?: ListenerService;
  private services?: ServiceContainer;
  private settings?: UserSettings;
  private translationStateManager?: TranslationStateManager;
  private detectedPageLanguage?: string;
  constructor() {
    this.configurationService = new ConfigurationService();
  }

  /**
   * Initialises the content script
   */
  async init(): Promise<void> {
    try {
      // Check website rules
      const websiteStatus = await this.checkWebsiteStatus();
      if (websiteStatus === 'blacklisted') {
        console.log(
          '[ContentManager] Site is blacklisted, skipping initialisation',
        );
        return;
      }

      // Validate the configuration
      await this.validateConfiguration();

      // Load user settings
      this.settings = await this.configurationService.getUserSettings();
      if (!this.settings.isEnabled) {
        console.log(
          '[ContentManager] Extension disabled, skipping initialisation',
        );
        return;
      }

      // Detect the page language
      await this.handleLanguageDetection();

      // Initialise every service
      await this.initializeServices();

      // Apply the initial configuration
      this.applyInitialConfiguration();

      // Initialise the floating ball
      await this.initializeFloatingBall();

      // Register listeners
      this.setupListeners();

      // Initial processing according to the trigger mode
      await this.handleInitialProcessing(websiteStatus);
    } catch (error) {
      console.error('[ContentManager] Initialisation failed:', error);
      throw error;
    }
  }

  /**
   * Destroys services and releases resources
   */
  destroy(): void {
    try {
      this.listenerService?.destroy();
      this.services?.lazyLoadingService?.destroy();
      console.log('[ContentManager] Services destroyed');
    } catch (error) {
      console.error('[ContentManager] Error while destroying services:', error);
    }
  }

  /**
   * Applies new settings
   */
  updateSettings(newSettings: UserSettings): void {
    this.settings = newSettings;

    // Update ProcessingService
    this.processingService?.updateSettings(newSettings);

    // Update the configuration service
    if (this.services) {
      this.configurationService.updateConfiguration(
        newSettings,
        this.services.styleManager,
        this.services.textReplacer,
        this.detectedPageLanguage,
      );
    }
  }

  /**
   * Returns the website's rule status
   */
  private async checkWebsiteStatus(): Promise<string> {
    const websiteManager = new WebsiteManager();
    return await websiteManager.getWebsiteStatus(window.location.href);
  }

  /**
   * Validates the configuration
   */
  private async validateConfiguration(): Promise<void> {
    await browser.runtime.sendMessage({
      type: 'validate-configuration',
      source: 'page_load',
    });
  }

  /**
   * Detects the page language
   * and resolves the translation direction once
   */
  private async handleLanguageDetection(): Promise<void> {
    if (!this.settings) return;

    // Detect the page language
    this.detectedPageLanguage = await languageService.detectPageLanguage();
    const targetLanguage = languageService.resolveTargetLanguage(
      this.settings.multilingualConfig,
      this.detectedPageLanguage,
    );

    console.log(
      `[ContentManager] Page language: ${this.detectedPageLanguage}, target language: ${targetLanguage}`,
    );
  }

  /**
   * Initialises every core service
   */
  private async initializeServices(): Promise<void> {
    if (!this.settings) {
      throw new Error('Settings not loaded');
    }

    // Create service instances
    const styleManager = new StyleManager();

    const activeConfig = this.configurationService.getActiveApiConfig(
      this.settings,
    );
    const textProcessor = TextProcessorService.getInstance({
      enablePronunciationTooltip: this.settings.enablePronunciationTooltip,
      apiConfigItem: activeConfig ?? null,
      nativeLanguage: this.settings.multilingualConfig.nativeLanguage,
      targetLanguage: languageService.resolveTargetLanguage(
        this.settings.multilingualConfig,
        this.detectedPageLanguage,
      ),
    });

    const textReplacer = TextReplacerService.getInstance(
      this.configurationService.createReplacementConfig(
        this.settings,
        this.detectedPageLanguage,
      ),
    );

    // Lazy loading service
    const lazyLoadingService = this.initializeLazyLoading(this.settings);

    // Paragraph translation service, with the lazy loading service
    const paragraphTranslationService =
      ParagraphTranslationService.getInstance(lazyLoadingService);

    const sentenceTranslationService =
      SentenceTranslationService.getInstance(lazyLoadingService);

    const floatingBallManager = new FloatingBallManager(
      this.settings.floatingBall,
    );

    // Service container
    this.services = {
      styleManager,
      textProcessor,
      textReplacer,
      floatingBallManager,
      lazyLoadingService,
      paragraphTranslationService,
      sentenceTranslationService,
    };

    // Business services
    this.processingService = new ProcessingService(
      textProcessor,
      textReplacer,
      this.settings,
      lazyLoadingService,
    );

    // Translation visibility state manager
    this.translationStateManager = new TranslationStateManager(
      this.processingService,
      this.services.floatingBallManager,
      this.services.paragraphTranslationService,
      this.services.sentenceTranslationService,
    );

    this.listenerService = new ListenerService(
      this.settings,
      this.processingService,
      this.configurationService,
      styleManager,
      textReplacer,
      paragraphTranslationService,
      sentenceTranslationService,
      floatingBallManager,
      this.translationStateManager,
      this.detectedPageLanguage,
    );
  }

  /**
   * Applies the initial configuration
   */
  private applyInitialConfiguration(): void {
    if (!this.settings || !this.services) return;

    this.configurationService.updateConfiguration(
      this.settings,
      this.services.styleManager,
      this.services.textReplacer,
      this.detectedPageLanguage,
    );
  }

  /**
   * Initialises the floating ball
   */
  private async initializeFloatingBall(): Promise<void> {
    if (!this.services?.floatingBallManager || !this.translationStateManager)
      return;

    await this.services.floatingBallManager.init(async () => {
      // Floating ball click toggles translation state
      const isConfigValid = await browser.runtime.sendMessage({
        type: 'validate-configuration',
        source: 'user_action',
      });

      if (isConfigValid && this.translationStateManager) {
        await this.translationStateManager.toggleTranslationState();
      }
    });
  }

  /**
   * Registers listeners
   */
  private setupListeners(): void {
    this.listenerService?.setupMessageListeners();
    this.listenerService?.setupDomObserver();
  }

  /**
   * Initial page processing
   */
  private async handleInitialProcessing(websiteStatus: string): Promise<void> {
    if (!this.settings || !this.processingService) return;

    // Run when whitelisted or in automatic mode
    if (
      websiteStatus === 'whitelisted' ||
      this.settings.triggerMode === TriggerMode.AUTOMATIC
    ) {
      try {
        if (this.settings.translationMode === TranslationMode.PARAGRAPH) {
          const paragraphTranslationService =
            this.services?.paragraphTranslationService;
          if (!paragraphTranslationService) {
            return;
          }

          // Paragraph mode
          await paragraphTranslationService.start();
        } else if (this.settings.translationMode === TranslationMode.SENTENCE) {
          await this.services?.sentenceTranslationService?.start();
        } else {
          // Word mode
          await this.processingService.processPage();
        }
      } catch (error) {
        console.error(
          '[ContentManager] Initial page processing failed:',
          error,
        );
      }
    }
  }

  /**
   * Initialises the lazy loading service
   */
  private initializeLazyLoading(
    settings: UserSettings,
  ): LazyLoadingService | undefined {
    if (!settings.lazyLoading || !settings.lazyLoading.enabled) {
      return undefined;
    }

    const lazyLoadingService = new LazyLoadingService(settings.lazyLoading);
    lazyLoadingService.initialize();

    // Processing callback
    lazyLoadingService.setProcessingCallback(
      async (segments: ContentSegment[]) => {
        if (this.processingService) {
          await this.processingService.processSegmentsLazy(segments);
        }
      },
    );

    return lazyLoadingService;
  }
}
