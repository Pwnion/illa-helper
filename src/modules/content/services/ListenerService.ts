import { UserSettings, TriggerMode, TranslationMode } from '../../shared/types';
import { ProcessingService } from './ProcessingService';
import { ConfigurationService } from './ConfigurationService';
import { StyleManager } from '../../styles';
import { TextReplacerService } from '../../core/translation/TextReplacerService';
import { ParagraphTranslationService } from '../../core/translation/ParagraphTranslationService';
import { SentenceTranslationService } from '../../sentence/SentenceTranslationService';
import { FloatingBallManager } from '../../floatingBall';
import { IListenerService } from '../types';
import { isProcessingResultNode, isDescendant } from '../utils/domUtils';
import { TranslationStateManager } from '../ContentManager';
import { isTranslationCandidateNode } from '../../processing/DomTranslationPolicy';

/**
 * Listener service: runtime messages and DOM observation
 */
export class ListenerService implements IListenerService {
  private settings: UserSettings;
  private processingService: ProcessingService;
  private configurationService: ConfigurationService;
  private styleManager: StyleManager;
  private textReplacer: TextReplacerService;
  private paragraphService: ParagraphTranslationService;
  private sentenceService: SentenceTranslationService;
  private floatingBallManager: FloatingBallManager;
  private translationStateManager: TranslationStateManager;
  private pageLanguage?: string;
  private domObserver?: MutationObserver;
  private debounceTimer?: number;

  constructor(
    settings: UserSettings,
    processingService: ProcessingService,
    configurationService: ConfigurationService,
    styleManager: StyleManager,
    textReplacer: TextReplacerService,
    paragraphService: ParagraphTranslationService,
    sentenceService: SentenceTranslationService,
    floatingBallManager: FloatingBallManager,
    translationStateManager: TranslationStateManager,
    pageLanguage?: string,
  ) {
    this.settings = settings;
    this.processingService = processingService;
    this.configurationService = configurationService;
    this.styleManager = styleManager;
    this.textReplacer = textReplacer;
    this.paragraphService = paragraphService;
    this.sentenceService = sentenceService;
    this.floatingBallManager = floatingBallManager;
    this.translationStateManager = translationStateManager;
    this.pageLanguage = pageLanguage;
  }

  /**
   * Registers the runtime message listener
   */
  setupMessageListeners(): void {
    browser.runtime.onMessage.addListener(async (message) => {
      try {
        await this.handleMessage(message);
      } catch (error) {
        console.error('[ListenerService] Message handling failed:', error);
      }
    });
  }

  /**
   * Registers the DOM observer.
   * Manual mode observes too: once the user has triggered translation, content loaded later should go through the same pipeline.
   */
  setupDomObserver(): void {
    if (!this.settings.isEnabled) return;
    if (this.settings.triggerMode !== TriggerMode.AUTOMATIC) return;
    this.createDomObserver();
  }

  /**
   * Destroys the service and releases resources
   */
  destroy(): void {
    if (this.domObserver) {
      this.domObserver.disconnect();
      this.domObserver = undefined;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
  }

  /**
   * Handles a runtime message
   */
  private async handleMessage(message: any): Promise<void> {
    if (
      message.type === 'settings_updated' ||
      message.type === 'api_config_updated'
    ) {
      await this.handleSettingsUpdate(message.settings);
    } else if (message.type === 'translate-page-command') {
      // Toggle translation state instead of translating directly
      await this.toggleTranslationState();
    } else if (message.type === 'MANUAL_TRANSLATE') {
      if (this.settings.triggerMode === TriggerMode.MANUAL) {
        const isConfigValid = await browser.runtime.sendMessage({
          type: 'validate-configuration',
          source: 'user_action',
        });
        if (isConfigValid) {
          await this.startConfiguredTranslation();
          this.translationStateManager.showTranslations();
          this.ensureDomObserver();
        }
      }
    } else if (message.type === 'PARAGRAPH_TRANSLATE') {
      const isConfigValid = await browser.runtime.sendMessage({
        type: 'validate-configuration',
        source: 'user_action',
      });
      if (isConfigValid) {
        await this.paragraphService.start();
        this.translationStateManager.showTranslations();
        this.ensureDomObserver();
      }
    } else if (message.type === 'RESTORE_PAGE') {
      this.translationStateManager.clearAllTranslations();
    }
  }

  /**
   * Toggles the translation state
   */
  private async toggleTranslationState(): Promise<void> {
    const isConfigValid = await browser.runtime.sendMessage({
      type: 'validate-configuration',
      source: 'user_action',
    });

    if (isConfigValid) {
      await this.translationStateManager.toggleTranslationState();
      this.ensureDomObserver();
    }
  }

  private ensureDomObserver(): void {
    if (!this.domObserver && this.settings.isEnabled) {
      this.createDomObserver();
    }
  }

  private async startConfiguredTranslation(): Promise<void> {
    if (this.settings.translationMode === TranslationMode.PARAGRAPH) {
      await this.paragraphService.start();
      return;
    }

    if (this.settings.translationMode === TranslationMode.SENTENCE) {
      await this.sentenceService.start();
      return;
    }

    await this.processingService.processPage();
  }

  /**
   * Applies a settings update
   */
  private async handleSettingsUpdate(newSettings: UserSettings): Promise<void> {
    const needsPageReload =
      this.settings.triggerMode !== newSettings.triggerMode ||
      this.settings.isEnabled !== newSettings.isEnabled ||
      this.settings.enablePronunciationTooltip !==
        newSettings.enablePronunciationTooltip ||
      this.settings.userLevel !== newSettings.userLevel ||
      this.settings.useGptApi !== newSettings.useGptApi ||
      this.settings.multilingualConfig.targetLanguage !==
        newSettings.multilingualConfig.targetLanguage ||
      this.settings.multilingualConfig.nativeLanguage !==
        newSettings.multilingualConfig.nativeLanguage;

    if (needsPageReload) {
      window.location.reload();
      return;
    }

    Object.assign(this.settings, newSettings);
    this.configurationService.updateConfiguration(
      this.settings,
      this.styleManager,
      this.textReplacer,
      this.pageLanguage,
    );
    this.processingService.updateSettings(this.settings);
    this.sentenceService.updateSettings(this.settings);
    this.floatingBallManager.updateConfig(this.settings.floatingBall);
  }

  /**
   * Creates the DOM observer
   */
  private createDomObserver(): void {
    const nodesToProcess = new Set<Node>();

    this.domObserver = new MutationObserver((mutations) => {
      let hasValidChanges = false;

      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (isProcessingResultNode(node) || isSentenceModeNode(node)) {
              return;
            }

            if (isTranslationCandidateNode(node, 16)) {
              nodesToProcess.add(node);
              hasValidChanges = true;
            }
          });
        } else if (
          mutation.type === 'characterData' &&
          mutation.target.parentElement
        ) {
          if (isTranslationCandidateNode(mutation.target.parentElement, 16)) {
            nodesToProcess.add(mutation.target.parentElement);
            hasValidChanges = true;
          }
        }
      });

      if (hasValidChanges) {
        this.debouncedProcessNodes(nodesToProcess);
      }
    });

    this.domObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  /**
   * Debounces processing of added nodes
   */
  private debouncedProcessNodes(nodesToProcess: Set<Node>): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = window.setTimeout(async () => {
      if (nodesToProcess.size === 0) return;

      const topLevelNodes = new Set<Node>();
      nodesToProcess.forEach((node) => {
        if (
          document.body.contains(node) &&
          !isDescendant(node, nodesToProcess)
        ) {
          topLevelNodes.add(node);
        }
      });

      if (this.domObserver) {
        this.domObserver.disconnect();
      }

      try {
        for (const node of topLevelNodes) {
          await this.processDynamicNode(node);
        }
      } catch (error) {
        console.error('[ListenerService] DOM node processing failed:', error);
      }

      nodesToProcess.clear();

      if (this.domObserver) {
        this.domObserver.observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true,
        });
      }
    }, 150);
  }

  private async processDynamicNode(node: Node): Promise<void> {
    if (this.settings.translationMode === TranslationMode.PARAGRAPH) {
      await this.paragraphService.start();
      return;
    }

    if (this.settings.translationMode === TranslationMode.SENTENCE) {
      await this.sentenceService.processNode(node);
      return;
    }

    await this.processingService.processNode(node);
  }
}

/**
 * Nodes created by sentence mode's own rendering: wrapped originals, and text
 * nodes split off inside them or next to them.
 */
function isSentenceModeNode(node: Node): boolean {
  const element =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : node.parentElement;
  if (!element) return false;
  if (element.closest('.illa-st, .illa-so, .illa-sentence-tooltip')) {
    return true;
  }
  // Split text nodes are siblings of a wrapped original
  return (
    node.nodeType === Node.TEXT_NODE &&
    (isSentenceWrapper(node.previousSibling) ||
      isSentenceWrapper(node.nextSibling))
  );
}

function isSentenceWrapper(node: Node | null): boolean {
  return (
    !!node &&
    node.nodeType === Node.ELEMENT_NODE &&
    (node as Element).matches('.illa-st, .illa-so')
  );
}
