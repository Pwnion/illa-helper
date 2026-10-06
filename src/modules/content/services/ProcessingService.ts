import { UserSettings } from '@/src/modules/shared/types';
import { TextProcessorService } from '@/src/modules/core/translation/TextProcessorService';
import { TextReplacerService } from '@/src/modules/core/translation/TextReplacerService';
import { LazyLoadingService } from './LazyLoadingService';
import { IProcessingService, ProcessingParams } from '../types';
import { ContentSegment } from '../../processing/ProcessingStateManager';
import { ProcessingCoordinator } from '../../processing/ProcessingCoordinator';
import { ReplacementBudget } from '../../processing/ReplacementBudget';

/**
 * Page processing service:
 * drives word-mode translation of the page
 */
export class ProcessingService implements IProcessingService {
  private textProcessor: TextProcessorService;
  private textReplacer: TextReplacerService;
  private lazyLoadingService?: LazyLoadingService;
  private processingParams!: ProcessingParams;
  private pageReplacementBudget?: ReplacementBudget;

  constructor(
    textProcessor: TextProcessorService,
    textReplacer: TextReplacerService,
    settings: UserSettings,
    lazyLoadingService?: LazyLoadingService,
  ) {
    this.textProcessor = textProcessor;
    this.textReplacer = textReplacer;
    this.lazyLoadingService = lazyLoadingService;
    this.updateProcessingParams(settings);

    // Register the lazy loading callback
    if (this.lazyLoadingService) {
      this.lazyLoadingService.setProcessingCallback(
        this.processSegmentsLazy.bind(this),
      );
    }
  }

  /**
   * Processes the page
   */
  async processPage(): Promise<void> {
    try {
      if (this.lazyLoadingService?.isEnabled()) {
        await this.processPageWithLazyLoading();
      } else {
        await this.processPageImmediate();
      }
    } catch (error) {
      console.error('[ProcessingService] Page processing failed:', error);
    }
  }

  /**
   * Processes the whole page immediately
   */
  private async processPageImmediate(): Promise<void> {
    const segments = await this.getSegments(document.body);
    if (segments.length === 0) return;

    this.pageReplacementBudget = ReplacementBudget.fromSegments(
      segments,
      this.textReplacer.getConfig().replacementRate,
    );

    await this.processSegments(segments, false);
  }

  /**
   * Processes the page with lazy loading
   */
  private async processPageWithLazyLoading(): Promise<void> {
    const segments = await this.getSegments(document.body);
    if (segments.length === 0) return;

    this.pageReplacementBudget = ReplacementBudget.fromSegments(
      segments,
      this.textReplacer.getConfig().replacementRate,
    );

    this.lazyLoadingService!.setProcessingCallback(
      this.processSegmentsLazy.bind(this),
    );
    this.lazyLoadingService!.observeSegments(segments);
  }

  /**
   * Collects the page's segments
   */
  private async getSegments(root: Node): Promise<ContentSegment[]> {
    try {
      const { ContentSegmenter } = await import(
        '../../processing/ContentSegmenter'
      );
      const contentSegmenter = new ContentSegmenter({
        maxSegmentLength: this.processingParams.maxLength || 400,
        minSegmentLength: 20,
        mergeSmallSegments: true,
      });

      return contentSegmenter.segmentContent(root);
    } catch (error) {
      console.error(
        '[ProcessingService] Failed to collect content segments:',
        error,
      );
      return [];
    }
  }

  /**
   * Processes segments that became visible
   */
  async processSegmentsLazy(segments: ContentSegment[]): Promise<void> {
    try {
      await this.processSegments(segments, true);
    } catch (error) {
      console.error(
        '[ProcessingService] Lazy segment processing failed:',
        error,
      );
      throw error;
    }
  }

  /**
   * Processes a list of segments. Whole-page runs, lazy batches and dynamic nodes all draw on the same page budget.
   */
  private async processSegments(
    segments: ContentSegment[],
    isLazyLoading: boolean,
  ): Promise<void> {
    // Batches must share the page budget and must not fall back to per-segment processRoot on failure,
    // otherwise each entry point claims its own quota and low replacement rates stop working.
    const pronunciationService = this.textProcessor.getPronunciationService();
    const coordinator = new ProcessingCoordinator(pronunciationService);

    await coordinator.processSegments(
      segments,
      this.textReplacer,
      this.processingParams.originalWordDisplayMode,
      this.processingParams.translationPosition,
      this.processingParams.showParentheses,
      isLazyLoading,
      this.pageReplacementBudget,
    );
  }

  /**
   * Processes a specific node
   */
  async processNode(node: Node): Promise<void> {
    try {
      const segments = await this.getSegments(node);
      if (segments.length === 0) return;

      const replacementRate = this.textReplacer.getConfig().replacementRate;
      if (this.pageReplacementBudget) {
        this.pageReplacementBudget.addSegments(segments, replacementRate);
      } else {
        this.pageReplacementBudget = ReplacementBudget.fromSegments(
          segments,
          replacementRate,
        );
      }

      if (this.lazyLoadingService?.isEnabled()) {
        this.lazyLoadingService.observeSegments(segments);
        return;
      }

      await this.processSegments(segments, false);
    } catch (error) {
      console.error('[ProcessingService] Node processing failed:', error);
    }
  }

  /**
   * Applies new settings
   */
  updateSettings(settings: UserSettings): void {
    this.updateProcessingParams(settings);

    const activeConfig = settings.apiConfigs.find(
      (config) => config.id === settings.activeApiConfigId,
    );
    this.textProcessor.updateApiConfig(activeConfig ?? null);

    if (this.lazyLoadingService) {
      this.lazyLoadingService.updateConfig(settings.lazyLoading);
    }
  }

  private updateProcessingParams(settings: UserSettings): void {
    this.processingParams = {
      originalWordDisplayMode: settings.originalWordDisplayMode,
      maxLength: settings.maxLength,
      translationPosition: settings.translationPosition,
      showParentheses: settings.showParentheses,
    };
  }

  // State queries
  getProcessingParams(): ProcessingParams {
    return { ...this.processingParams };
  }

  getLazyLoadingService(): LazyLoadingService | undefined {
    return this.lazyLoadingService;
  }

  isLazyLoadingEnabled(): boolean {
    return this.lazyLoadingService?.isEnabled() || false;
  }

  destroy(): void {
    if (this.lazyLoadingService) {
      this.lazyLoadingService.destroy();
    }
  }
}
