/**
 * Paragraph translation service.
 *
 * Design:
 * 1. DomWalker walks the DOM and identifies paragraphs from computed styles
 * 2. the paragraphs found are translated directly
 * 3. the DOM collection logic is shared with the other translation modes
 */

import { StorageService } from '../storage';
import { StyleManager } from '../../styles/core/StyleManager';
import { ParagraphTranslationApi } from './ParagraphTranslationApi';
import { PARAGRAPH_TRANSLATION } from '../../shared/constants';
import type { LazyLoadingService } from '../../content/services/LazyLoadingService';
import type { ContentSegment } from '../../processing/ProcessingStateManager';
import { globalProcessingState } from '../../processing/ProcessingStateManager';
import {
  walkAndCollectParagraphs,
  collectTextNodes,
} from '../../processing/DomWalker';
import { languageService } from './LanguageService';
import { selectParagraphTranslationElements } from './ParagraphTranslationSelection';
import { renderParagraphTranslation } from './ParagraphTranslationRenderer';

/**
 * Paragraph translation service
 */
export class ParagraphTranslationService {
  private static instance: ParagraphTranslationService | null = null;
  private storageService: StorageService;
  private styleManager: StyleManager;
  private paragraphApi: ParagraphTranslationApi;
  private lazyLoadingService?: LazyLoadingService;

  // Translation state
  private isStarting: boolean = false;
  private translatedElements = new WeakSet<HTMLElement>();
  private translatingElements = new WeakSet<HTMLElement>(); // elements being translated
  private targetLanguage?: string;

  // Concurrency
  private readonly BATCH_SIZE = 5; // elements per batch
  private readonly BATCH_DELAY = 200; // delay between batches (ms)

  // Loading indicator
  private readonly LOADING_CLASS = 'illa-paragraph-loading';
  private readonly LOADING_ICON = `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="7" stroke="#666" stroke-width="2" stroke-linecap="round" stroke-dasharray="11 11" stroke-dashoffset="0">
        <animateTransform attributeName="transform" type="rotate" values="0 8 8;360 8 8" dur="1s" repeatCount="indefinite"/>
      </circle>
    </svg>
  `;

  private constructor(lazyLoadingService?: LazyLoadingService) {
    this.storageService = StorageService.getInstance();
    this.styleManager = new StyleManager();
    this.paragraphApi = ParagraphTranslationApi.getInstance();
    this.lazyLoadingService = lazyLoadingService;

    // Apply the translation style
    this.storageService.getUserSettings().then((settings) => {
      if (settings && settings.translationStyle) {
        this.styleManager.setTranslationStyle(settings.translationStyle);
      }
    });
  }

  /**
   * Returns the singleton instance
   */
  public static getInstance(
    lazyLoadingService?: LazyLoadingService,
  ): ParagraphTranslationService {
    if (!ParagraphTranslationService.instance) {
      ParagraphTranslationService.instance = new ParagraphTranslationService(
        lazyLoadingService,
      );
    } else if (
      lazyLoadingService &&
      !ParagraphTranslationService.instance.lazyLoadingService
    ) {
      // Attach the lazy loading service if the existing instance has none
      ParagraphTranslationService.instance.lazyLoadingService =
        lazyLoadingService;
    }
    return ParagraphTranslationService.instance;
  }

  /**
   * Starts paragraph translation
   */
  public async start(): Promise<number> {
    console.log('[Paragraph translation] Starting...');

    if (this.isStarting) {
      console.warn('[Paragraph translation] Already running');
      return 0;
    }

    this.isStarting = true;

    try {
      // Re-read the page and settings on every manual trigger; SPA route changes do not recreate the content script.
      const settings = await this.storageService.getUserSettings();
      const pageLanguage = await languageService.detectPageLanguage();
      this.targetLanguage = languageService.resolveTargetLanguage(
        settings.multilingualConfig,
        pageLanguage,
      );

      const isLazyLoadingEnabled =
        settings?.lazyLoading?.enabled && this.lazyLoadingService?.isEnabled();

      if (isLazyLoadingEnabled) {
        // Lazy mode only registers the current DOM; LazyLoadingService triggers visible elements later.
        console.log('[Paragraph translation] Using lazy loading');
        return this.startLazyLoading();
      }

      console.log('[Paragraph translation] Translating the whole page');
      return this.startFullTranslation();
    } finally {
      this.isStarting = false;
    }
  }

  /**
   * Stops paragraph translation
   */
  public stop(): void {
    this.isStarting = false;
    this.translatedElements = new WeakSet();
    this.translatingElements = new WeakSet();
    this.targetLanguage = undefined;
    this.clearAllLoadingIndicators();

    // Stop lazy observation
    if (this.lazyLoadingService) {
      this.lazyLoadingService.unobserveSegments([]);
    }

    console.log('[Paragraph translation] Stopped');
  }

  /**
   * Clears every translation
   */
  public clearAllTranslations(): void {
    document
      .querySelectorAll(`.${PARAGRAPH_TRANSLATION.WRAPPER_CLASS}`)
      .forEach((el) => el.remove());
    this.translatedElements = new WeakSet();
    this.translatingElements = new WeakSet();
    this.targetLanguage = undefined;
    this.clearAllLoadingIndicators();

    // Stop lazy observation
    if (this.lazyLoadingService) {
      this.lazyLoadingService.unobserveSegments([]);
    }

    console.log('[Paragraph translation] All translations cleared');
  }

  /**
   * Finds paragraph elements using DomWalker
   */
  private findParagraphElements(): HTMLElement[] {
    const paragraphs = walkAndCollectParagraphs(document.body);
    const paragraphElements = selectParagraphTranslationElements(paragraphs);

    // Skip elements already translated, in progress or too short
    const elements = paragraphElements.filter((element) => {
      if (this.translatedElements.has(element)) return false;
      if (this.translatingElements.has(element)) return false;

      const text = element.textContent?.trim();
      if (!text || text.length < 3) return false;
      if (text.length > 3000) return false;

      // Skip numbers and symbols only
      if (/^[\d\s.,!?\-+=()[\]{}]*$/.test(text)) return false;

      return true;
    });

    console.log('[Paragraph translation] Paragraphs found:', elements.length);
    return elements;
  }

  /**
   * Translates a list of elements
   */
  private async translateElements(elements: HTMLElement[]): Promise<number> {
    if (elements.length === 0) {
      return 0;
    }

    console.log(
      '[Paragraph translation] Translating concurrently, elements:',
      elements.length,
    );

    // Batch to stay under rate limits
    const batchSize = this.BATCH_SIZE;
    let successCount = 0;

    for (let i = 0; i < elements.length; i += batchSize) {
      const batch = elements.slice(i, i + batchSize);
      console.log(
        `[Paragraph translation] Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(elements.length / batchSize)}, elements: ${batch.length}`,
      );

      // Translate this batch concurrently
      const batchPromises = batch.map(async (element) => {
        try {
          const success = await this.translateElement(element);
          return success ? 1 : 0;
        } catch (error) {
          console.error(
            '[Paragraph translation] Element translation failed:',
            error,
          );
          return 0;
        }
      });

      // Wait for the batch
      const batchResults = await Promise.all(batchPromises);
      const batchSuccessCount = batchResults.reduce(
        (sum: number, result: number) => sum + result,
        0,
      );
      successCount += batchSuccessCount;

      // Short pause between batches to stay under rate limits
      if (i + batchSize < elements.length) {
        await new Promise((resolve) => setTimeout(resolve, this.BATCH_DELAY));
      }
    }

    console.log('[Paragraph translation] Done, succeeded:', successCount);
    return successCount;
  }

  /**
   * Translates one element
   */
  private async translateElement(element: HTMLElement): Promise<boolean> {
    if (
      this.translatedElements.has(element) ||
      this.translatingElements.has(element)
    ) {
      return false;
    }

    const textContent = element.textContent?.trim();
    if (!textContent || textContent.length < 5) {
      return false;
    }

    // Mark as in progress
    this.translatingElements.add(element);
    this.showLoadingIndicator(element);

    try {
      console.log(
        '[Paragraph translation] Translating element:',
        element.tagName,
        textContent.substring(0, 50),
      );

      const translatedText = await this.paragraphApi.translateParagraph(
        textContent,
        this.targetLanguage,
      );

      if (translatedText && translatedText.trim()) {
        // Remove the loading indicator before showing the translation
        this.removeLoadingIndicator(element);
        this.translatingElements.delete(element);

        this.showTranslation(element, translatedText);
        this.translatedElements.add(element);
        console.log('[Paragraph translation] Translated:', element.tagName);
        return true;
      } else {
        // Remove the loading indicator
        this.removeLoadingIndicator(element);
        this.translatingElements.delete(element);

        console.log(
          '[Paragraph translation] Empty result, skipping:',
          element.tagName,
        );
        return false;
      }
    } catch (error) {
      // Remove the loading indicator
      this.removeLoadingIndicator(element);
      this.translatingElements.delete(element);

      console.error(
        '[Paragraph translation] Translation failed:',
        error,
        'element:',
        element.tagName,
      );
      return false;
    }
  }

  /**
   * Shows the translation
   */
  private showTranslation(element: HTMLElement, translatedText: string): void {
    // A paragraph can be triggered repeatedly; remove old results first so the DOM stays idempotent.
    this.removeAdjacentTranslation(element);
    element
      .querySelectorAll(`.${PARAGRAPH_TRANSLATION.WRAPPER_CLASS}`)
      .forEach((el) => el.remove());

    const styleClass = this.styleManager.getCurrentStyleClass();
    renderParagraphTranslation(element, translatedText, styleClass);
  }

  private removeAdjacentTranslation(element: HTMLElement): void {
    const nextSibling = element.nextSibling;
    if (nextSibling?.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const nextElement = nextSibling as HTMLElement;
    if (nextElement.classList.contains(PARAGRAPH_TRANSLATION.WRAPPER_CLASS)) {
      nextElement.remove();
    }
  }

  /**
   * Shows the loading indicator
   */
  private showLoadingIndicator(element: HTMLElement): void {
    this.removeLoadingIndicator(element);

    // Add the global style only once
    if (!document.getElementById('illa-paragraph-loading-style')) {
      const style = document.createElement('style');
      style.id = 'illa-paragraph-loading-style';
      style.textContent = `
        .illa-paragraph-loading svg {
          animation: illa-spin 1s linear infinite;
        }
        @keyframes illa-spin {
          100% { transform: rotate(360deg); }
        }
        /* The loading indicator never blocks clicks */
        .illa-paragraph-loading {
          pointer-events: none !important;
          user-select: none;
        }
        /* Loading indicator after links */
        a + .illa-paragraph-loading {
          position: relative;
          z-index: 1;
          margin-left: 2px;
        }
      `;
      document.head.appendChild(style);
    }

    const loadingSpan = document.createElement('span');
    loadingSpan.classList.add(this.LOADING_CLASS);
    loadingSpan.innerHTML = this.LOADING_ICON;

    // Shared indicator style; CSS controls pointer-events
    loadingSpan.style.cssText = `
      display: inline-block;
      margin-left: 8px;
      vertical-align: middle;
      opacity: 0.8;
    `;

    // Links get a smaller gap
    if (element.tagName.toLowerCase() === 'a') {
      loadingSpan.style.marginLeft = '4px';
    }

    element.parentNode?.insertBefore(loadingSpan, element.nextSibling);
  }

  /**
   * Removes the loading indicator
   */
  private removeLoadingIndicator(element: HTMLElement): void {
    // Remove the indicator right after the element
    const nextSibling = element.nextSibling;
    if (nextSibling && nextSibling.nodeType === Node.ELEMENT_NODE) {
      const nextElement = nextSibling as HTMLElement;
      if (nextElement.classList.contains(this.LOADING_CLASS)) {
        nextElement.remove();
      }
    }
  }

  /**
   * Removes every loading indicator
   */
  private clearAllLoadingIndicators(): void {
    document
      .querySelectorAll(`.${this.LOADING_CLASS}`)
      .forEach((el) => el.remove());
  }

  /**
   * Translates the whole page
   */
  private async startFullTranslation(): Promise<number> {
    // Find every paragraph
    const paragraphElements = this.findParagraphElements();
    console.log(
      '[Paragraph translation] Whole page: paragraphs found:',
      paragraphElements.length,
    );

    // Translate them
    const result = await this.translateElements(paragraphElements);
    console.log('[Paragraph translation] Done, result:', result);
    return result;
  }

  /**
   * Starts lazy translation
   */
  private async startLazyLoading(): Promise<number> {
    if (!this.lazyLoadingService) {
      console.warn(
        '[Paragraph translation] Lazy loading service missing, translating the whole page',
      );
      return this.startFullTranslation();
    }

    // Find paragraphs and convert them to ContentSegments
    const paragraphElements = this.findParagraphElements();
    const segments = this.convertToContentSegments(paragraphElements);

    console.log(
      '[Paragraph translation] Lazy mode: paragraphs found:',
      paragraphElements.length,
    );

    // Lazy loading callback
    this.lazyLoadingService.setProcessingCallback(
      async (visibleSegments: ContentSegment[]) => {
        const elementsToTranslate = visibleSegments.map(
          (segment) => segment.element as HTMLElement,
        );
        await this.translateElements(elementsToTranslate);
      },
    );

    // Start observing
    this.lazyLoadingService.observeSegments(segments);

    return segments.length;
  }

  /**
   * Converts paragraph elements to ContentSegments
   */
  private convertToContentSegments(elements: HTMLElement[]): ContentSegment[] {
    return elements.map((element, index) => {
      const textContent = element.textContent?.trim() || '';
      const domPath = globalProcessingState.generateDomPath(element);
      const fingerprint = globalProcessingState.generateContentFingerprint(
        textContent,
        domPath,
      );

      const textNodes: Text[] = collectTextNodes(element);

      return {
        id: `${element.tagName.toLowerCase()}-${fingerprint}-${index}`,
        textContent,
        element,
        elements: [element],
        textNodes,
        fingerprint,
        domPath,
      };
    });
  }

  /**
   * Statistics
   */
  public getStats(): { total: number; translated: number } {
    const total = document.querySelectorAll(
      'p, h1, h2, h3, h4, h5, h6, div, blockquote, section, article, li, td, th',
    ).length;
    const translated = document.querySelectorAll(
      `.${PARAGRAPH_TRANSLATION.WRAPPER_CLASS}`,
    ).length;
    return { total, translated };
  }
}
