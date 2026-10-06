/**
 * Sentence mode: replaces whole sentences the learner can read with their
 * translation.
 *
 * Flow for each block of page text:
 * 1. split into sentences in code (segmentation.ts)
 * 2. look up cached analyses, send the rest to the model in batches
 * 3. select sentences against the learner's vocabulary and unlocked grammar
 * 4. render in place; hover a word for its card, click a sentence to reveal
 *    the original, and unaided reads count as exposures
 *
 * Restoring puts back the exact original DOM.
 */

import { StorageService } from '../core/storage';
import { languageService } from '../core/translation/LanguageService';
import { callAI } from '../api/services/UniversalApiService';
import { rateLimitManager } from '../infrastructure/ratelimit';
import { getApiTimeout } from '@/src/utils';
import type { LazyLoadingService } from '../content/services/LazyLoadingService';
import type { ContentSegment } from '../processing/ProcessingStateManager';
import { globalProcessingState } from '../processing/ProcessingStateManager';
import { walkAndCollectParagraphs } from '../processing/DomWalker';
import { AITranslationProvider } from '../pronunciation/translation/AITranslationProvider';
import { WebSpeechTTSProvider } from '../pronunciation/tts/WebSpeechTTSProvider';
import { getSpeechLocale } from '../shared/speechLocale';
import type { UserSettings } from '../shared/types/storage';
import type { ApiConfigItem } from '../shared/types/api';
import { analysisCacheKey } from './cacheKey';
import { packBatches, runWithConcurrency } from './batching';
import { normalizeSentenceModeConfig } from './config';
import { ExposureTracker } from './ExposureTracker';
import { PROMPT_VERSION, type PromptLanguages } from './prompt';
import { SentenceAnalyzer, type ModelCaller } from './SentenceAnalyzer';
import {
  REVEALED_CLASS,
  SentenceRenderer,
  WORD_CLASS,
  type RenderedSentence,
} from './SentenceRenderer';
import {
  flattenBlock,
  splitSentences,
  ORIGINAL_CLASS,
  TRANSLATION_CLASS,
  type SentenceSlice,
} from './segmentation';
import {
  evaluateSentence,
  isLemmaKnown,
  lemmaEntries,
  normalizeLemma,
  PageCap,
} from './selection';
import { SentenceStoreClient } from './store/SentenceStoreClient';
import { SentenceTooltip } from './SentenceTooltip';
import type {
  LemmaRecord,
  SentenceAnalysis,
  SentenceModeConfig,
  VocabOp,
} from './types';

const MODEL_CONCURRENCY = 3;
const WORD_CARD_DELAY_MS = 300;
const OPS_FLUSH_DELAY_MS = 1500;

interface PendingSentence {
  block: Element;
  slice: SentenceSlice;
  key: string;
}

interface PageContext {
  generation: number;
  config: SentenceModeConfig;
  sourceLanguage: string;
  targetLanguage: string;
  nativeLanguage: string;
  languages: PromptLanguages;
  modelId: string;
  pageCap: PageCap;
}

export interface SentenceServiceDependencies {
  storage?: Pick<StorageService, 'getUserSettings'>;
  store?: SentenceStoreClient;
  callModel?: ModelCaller;
  detectPageLanguage?: () => Promise<string>;
}

export class SentenceTranslationService {
  private static instance: SentenceTranslationService | null = null;

  private readonly storage: Pick<StorageService, 'getUserSettings'>;
  private readonly store: SentenceStoreClient;
  private readonly analyzer: SentenceAnalyzer;
  private readonly detectPageLanguage: () => Promise<string>;
  private readonly renderer = new SentenceRenderer('sv');
  private readonly tooltip = new SentenceTooltip();
  private tracker: ExposureTracker | null = null;
  private dictionary: AITranslationProvider | null = null;
  private tts: WebSpeechTTSProvider | null = null;

  private context: PageContext | null = null;
  private generation = 0;
  private processedBlocks = new WeakSet<Element>();
  private vocabulary = new Map<string, LemmaRecord | null>();
  private pendingOps: VocabOp[] = [];
  private opsTimer: number | null = null;
  private cardTimer: number | null = null;
  private listening = false;

  constructor(
    private lazyLoadingService?: LazyLoadingService,
    deps: SentenceServiceDependencies = {},
  ) {
    this.storage = deps.storage ?? StorageService.getInstance();
    this.store = deps.store ?? new SentenceStoreClient();
    this.analyzer = new SentenceAnalyzer(
      deps.callModel ?? ((request) => this.callConfiguredModel(request)),
    );
    this.detectPageLanguage =
      deps.detectPageLanguage ?? (() => languageService.detectPageLanguage());
  }

  static getInstance(
    lazyLoadingService?: LazyLoadingService,
  ): SentenceTranslationService {
    if (!SentenceTranslationService.instance) {
      SentenceTranslationService.instance = new SentenceTranslationService(
        lazyLoadingService,
      );
    } else if (
      lazyLoadingService &&
      !SentenceTranslationService.instance.lazyLoadingService
    ) {
      SentenceTranslationService.instance.lazyLoadingService =
        lazyLoadingService;
    }
    return SentenceTranslationService.instance;
  }

  /**
   * Translates the page, or any blocks not yet processed. Returns the number
   * of blocks queued.
   */
  async start(): Promise<number> {
    const settings = await this.storage.getUserSettings();
    const context = await this.createContext(settings);
    if (!context) return 0;

    const blocks = this.findBlocks(document.body);
    const total = blocks.reduce(
      (sum, block) =>
        sum +
        splitSentences(flattenBlock(block).text, context.sourceLanguage).length,
      0,
    );
    context.pageCap.addSentences(total, context.config.pageCap);

    this.attachListeners();

    if (settings.lazyLoading?.enabled && this.lazyLoadingService?.isEnabled()) {
      this.lazyLoadingService.setProcessingCallback(async (segments) => {
        await this.processBlocks(segments.map((s) => s.element));
      });
      this.lazyLoadingService.observeSegments(this.toSegments(blocks));
      return blocks.length;
    }

    await this.processBlocks(blocks);
    return blocks.length;
  }

  /** Handles content added after the page was translated. */
  async processNode(node: Node): Promise<void> {
    if (!this.context) return;
    const root =
      node.nodeType === Node.ELEMENT_NODE
        ? (node as HTMLElement)
        : node.parentElement;
    if (!root || !root.isConnected) return;

    const blocks = this.findBlocks(root);
    if (blocks.length === 0) return;

    const { context } = this;
    const added = blocks.reduce(
      (sum, block) =>
        sum +
        splitSentences(flattenBlock(block).text, context.sourceLanguage).length,
      0,
    );
    context.pageCap.addSentences(added, context.config.pageCap);

    if (this.lazyLoadingService?.isEnabled()) {
      this.lazyLoadingService.observeSegments(this.toSegments(blocks));
    } else {
      await this.processBlocks(blocks);
    }
  }

  /** Puts back the exact original DOM and stops all tracking. */
  restore(): void {
    this.generation += 1;
    this.flushOps();
    this.tooltip.destroy();
    this.tracker?.disconnect();
    this.tracker = null;
    this.renderer.restoreAll();
    this.detachListeners();
    this.processedBlocks = new WeakSet();
    this.context = null;
    this.lazyLoadingService?.reset();
  }

  hasContent(): boolean {
    return this.renderer.hasContent();
  }

  updateSettings(settings: UserSettings): void {
    if (!this.context) return;
    this.context.config = normalizeSentenceModeConfig(settings.sentenceMode);
    this.tracker?.updateOptions({
      minDwellMs: this.context.config.minDwellMs,
      dwellMsPerWord: this.context.config.dwellMsPerWord,
    });
  }

  // ==================== Pipeline ====================

  private async createContext(
    settings: UserSettings,
  ): Promise<PageContext | null> {
    if (this.context) return this.context;

    const sourceLanguage = languageService.normalizeLanguageCode(
      await this.detectPageLanguage(),
    );
    const { targetLanguage, nativeLanguage } = settings.multilingualConfig;
    if (
      sourceLanguage === languageService.normalizeLanguageCode(targetLanguage)
    ) {
      console.log(
        '[Sentence mode] The page is already in the target language; nothing to do',
      );
      return null;
    }

    const config = normalizeSentenceModeConfig(settings.sentenceMode);
    const activeConfig = settings.apiConfigs.find(
      (item) => item.id === settings.activeApiConfigId,
    );

    this.renderer.setTargetLanguage(targetLanguage);
    this.setUpLearningTools(
      activeConfig ?? null,
      settings,
      nativeLanguage,
      targetLanguage,
    );
    this.tracker = new ExposureTracker({
      minDwellMs: config.minDwellMs,
      dwellMsPerWord: config.dwellMsPerWord,
      onExposure: (id) => this.creditExposure(id),
    });

    this.context = {
      generation: this.generation,
      config,
      sourceLanguage,
      targetLanguage,
      nativeLanguage,
      languages: {
        sourceName: languageName(sourceLanguage),
        targetName: languageName(targetLanguage),
        nativeName: languageName(nativeLanguage),
        targetCode: targetLanguage,
      },
      modelId: activeConfig
        ? `${activeConfig.protocolFamily}:${activeConfig.config.model}`
        : 'none',
      pageCap: new PageCap(0, config.pageCap),
    };
    return this.context;
  }

  private async processBlocks(blocks: Element[]): Promise<void> {
    const context = this.context;
    if (!context) return;

    const pending: PendingSentence[] = [];
    for (const block of blocks) {
      if (this.processedBlocks.has(block) || !block.isConnected) continue;
      this.processedBlocks.add(block);
      const { text } = flattenBlock(block);
      for (const slice of splitSentences(text, context.sourceLanguage)) {
        pending.push({
          block,
          slice,
          key: analysisCacheKey({
            promptVersion: PROMPT_VERSION,
            model: context.modelId,
            sourceLanguage: context.sourceLanguage,
            targetLanguage: context.targetLanguage,
            nativeLanguage: context.nativeLanguage,
            text: slice.text,
          }),
        });
      }
    }
    if (pending.length === 0) return;

    const cached = await this.store.getAnalyses(pending.map((p) => p.key));
    if (!this.isCurrent(context)) return;

    const hits = pending.filter((p) => cached[p.key]);
    await this.present(
      context,
      hits.map((p) => ({ pending: p, analysis: cached[p.key] })),
    );

    const misses = pending.filter((p) => !cached[p.key]);
    const batches = packBatches(
      misses.map((p) => ({ ...p, text: p.slice.text })),
      context.config.batchChars,
    );

    await runWithConcurrency(batches, MODEL_CONCURRENCY, async (batch) => {
      if (!this.isCurrent(context)) return;
      const analyses = await this.analyzer.analyze(
        batch.map((p, index) => ({ id: index + 1, text: p.slice.text })),
        context.languages,
      );
      const results = batch.flatMap((p, index) => {
        const analysis = analyses.get(index + 1);
        return analysis ? [{ pending: p, analysis }] : [];
      });
      void this.store.putAnalyses(
        results.map((r) => ({ key: r.pending.key, analysis: r.analysis })),
      );
      if (this.isCurrent(context)) await this.present(context, results);
    });
  }

  private async present(
    context: PageContext,
    items: Array<{ pending: PendingSentence; analysis: SentenceAnalysis }>,
  ): Promise<void> {
    if (items.length === 0) return;

    await this.loadVocabulary(
      context.targetLanguage,
      items.flatMap((item) => lemmaEntries(item.analysis).map((e) => e.lemma)),
    );
    if (!this.isCurrent(context)) return;

    for (const { pending, analysis } of items) {
      const evaluation = evaluateSentence(
        analysis,
        (lemma) => this.vocabulary.get(lemma) ?? undefined,
        context.config,
      );
      if (!evaluation.eligible || !context.pageCap.tryConsume()) continue;

      const rendered = this.renderer.render(
        {
          block: pending.block,
          start: pending.slice.start,
          end: pending.slice.end,
          text: pending.slice.text,
        },
        analysis,
        evaluation.newLemmas,
      );
      if (!rendered) continue;

      this.tracker?.track({
        id: rendered.id,
        element: rendered.translation,
        wordCount: analysis.tokens.length,
      });
    }
  }

  private isCurrent(context: PageContext): boolean {
    return this.context === context && context.generation === this.generation;
  }

  /**
   * Outermost paragraphs under root that have not been processed. DomWalker
   * also reports inline elements with text (such as links) as paragraphs, but
   * a sentence must be segmented from its whole block.
   */
  private findBlocks(root: HTMLElement): Element[] {
    const elements = walkAndCollectParagraphs(root).map((p) => p.element);
    const candidates = new Set(elements);
    return elements.filter(
      (element) =>
        !hasAncestorIn(element, candidates) &&
        !hasAncestorIn(element, this.processedBlocks, true) &&
        !element.closest(`.${TRANSLATION_CLASS}, .illa-sentence-tooltip`),
    );
  }

  private toSegments(blocks: Element[]): ContentSegment[] {
    return blocks.map((element, index) => {
      const textContent = element.textContent?.trim() || '';
      const domPath = globalProcessingState.generateDomPath(element);
      const fingerprint = globalProcessingState.generateContentFingerprint(
        textContent,
        domPath,
      );
      return {
        id: `sentence-${fingerprint}-${index}`,
        textContent,
        element,
        elements: [element],
        textNodes: [],
        fingerprint,
        domPath,
      };
    });
  }

  // ==================== Vocabulary ====================

  private async loadVocabulary(lang: string, lemmas: string[]): Promise<void> {
    const missing = [...new Set(lemmas)].filter(
      (lemma) => !this.vocabulary.has(lemma),
    );
    if (missing.length === 0) return;

    const records = await this.store.getLemmas(lang, missing);
    for (const lemma of missing) this.vocabulary.set(lemma, null);
    for (const record of records) this.vocabulary.set(record.lemma, record);
  }

  private queueOps(ops: VocabOp[]): void {
    if (ops.length === 0) return;
    this.pendingOps.push(...ops);
    if (this.opsTimer === null) {
      this.opsTimer = window.setTimeout(
        () => this.flushOps(),
        OPS_FLUSH_DELAY_MS,
      );
    }
  }

  private flushOps(): void {
    if (this.opsTimer !== null) {
      clearTimeout(this.opsTimer);
      this.opsTimer = null;
    }
    const context = this.context;
    if (!context || this.pendingOps.length === 0) return;

    const ops = this.pendingOps;
    this.pendingOps = [];
    void this.store
      .applyVocabOps(
        context.targetLanguage,
        ops,
        context.config.exposuresToKnow,
      )
      .then((records) => {
        for (const record of records) this.vocabulary.set(record.lemma, record);
      });
  }

  /** Updates the local snapshot immediately so the word card reflects it. */
  private setLocalStatus(lemma: string, status: LemmaRecord['status']): void {
    const context = this.context;
    if (!context) return;
    const existing = this.vocabulary.get(lemma);
    this.vocabulary.set(lemma, {
      lang: context.targetLanguage,
      lemma,
      status,
      exposures: status === 'known' ? (existing?.exposures ?? 0) : 0,
      lookups: existing?.lookups ?? 0,
      lastSeen: Date.now(),
    });
  }

  private creditExposure(id: string): void {
    const sentence = this.renderer.get(id);
    if (!sentence || sentence.revealed) return;
    const at = Date.now();
    this.queueOps(
      lemmaEntries(sentence.analysis)
        .filter((entry) => !entry.free)
        .map((entry) => ({ lemma: entry.lemma, kind: 'exposure', at })),
    );
  }

  private reveal(sentence: RenderedSentence, revealed: boolean): void {
    this.renderer.setRevealed(sentence, revealed);
    if (!revealed) return;

    this.tracker?.void(sentence.id);
    const context = this.context;
    if (!context) return;

    const at = Date.now();
    const newWords = new Set(sentence.newLemmas);
    const ops: VocabOp[] = [];
    for (const entry of lemmaEntries(sentence.analysis)) {
      if (entry.free) continue;
      if (newWords.has(entry.lemma)) {
        ops.push({ lemma: entry.lemma, kind: 'reveal', at });
        this.setLocalStatus(entry.lemma, 'learning');
      } else {
        const record = this.vocabulary.get(entry.lemma) ?? undefined;
        if (record?.status !== 'known') {
          ops.push({ lemma: entry.lemma, kind: 'reset-exposure', at });
        }
      }
    }
    this.queueOps(ops);
  }

  // ==================== Interaction ====================

  private attachListeners(): void {
    if (this.listening) return;
    this.listening = true;
    document.addEventListener('mouseover', this.handleMouseOver, true);
    document.addEventListener('mouseout', this.handleMouseOut, true);
    document.addEventListener('click', this.handleClick, true);
    window.addEventListener('pagehide', this.handlePageHide);
  }

  private detachListeners(): void {
    if (!this.listening) return;
    this.listening = false;
    document.removeEventListener('mouseover', this.handleMouseOver, true);
    document.removeEventListener('mouseout', this.handleMouseOut, true);
    document.removeEventListener('click', this.handleClick, true);
    window.removeEventListener('pagehide', this.handlePageHide);
    this.clearCardTimer();
  }

  private readonly handlePageHide = () => this.flushOps();

  private readonly handleMouseOver = (event: Event) => {
    const target = event.target as Element | null;
    if (!target?.closest) return;
    if (this.tooltip.contains(target)) {
      this.tooltip.cancelHide();
      return;
    }

    const translation = target.closest<HTMLElement>(`.${TRANSLATION_CLASS}`);
    const sentence = this.renderer.get(translation?.dataset.illaSid);
    if (!sentence) return;
    this.tracker?.void(sentence.id);

    const word = target.closest<HTMLElement>(`.${WORD_CLASS}`);
    if (!word) return;
    this.tooltip.cancelHide();
    this.clearCardTimer();
    this.cardTimer = window.setTimeout(
      () => this.showWordCard(sentence, word),
      WORD_CARD_DELAY_MS,
    );
  };

  private readonly handleMouseOut = (event: Event) => {
    const target = event.target as Element | null;
    if (!target?.closest?.(`.${WORD_CLASS}`)) return;
    const related = (event as MouseEvent).relatedTarget as Node | null;
    if (this.tooltip.contains(related)) return;
    this.clearCardTimer();
    this.tooltip.scheduleHide();
  };

  private readonly handleClick = (event: Event) => {
    const target = event.target as Element | null;
    if (!target?.closest || this.tooltip.contains(target)) return;
    // Let links inside translated sentences keep working
    if (target.closest('a[href]')) return;

    const translation = target.closest<HTMLElement>(`.${TRANSLATION_CLASS}`);
    const original = target.closest<HTMLElement>(
      `.${ORIGINAL_CLASS}.${REVEALED_CLASS}`,
    );
    const sentence = this.renderer.get(
      translation?.dataset.illaSid ?? original?.dataset.illaSid,
    );
    if (!sentence) return;

    // The click toggles the sentence; it should not also trigger page handlers
    event.preventDefault();
    event.stopPropagation();
    this.tooltip.hide();
    this.reveal(sentence, !!translation);
  };

  private showWordCard(sentence: RenderedSentence, word: HTMLElement): void {
    const token = sentence.analysis.tokens[Number(word.dataset.illaToken)];
    const context = this.context;
    if (!token || !context || !word.isConnected) return;

    const lemma = normalizeLemma(token.lemma);
    const entry = lemmaEntries(sentence.analysis).find(
      (e) => e.lemma === lemma,
    );
    const record = this.vocabulary.get(lemma) ?? undefined;
    const status =
      record?.status ??
      (entry && isLemmaKnown(entry, undefined, context.config.coldStartLevel)
        ? 'assumed'
        : 'new');

    this.tooltip.show(
      word,
      { token, status },
      {
        speak: () => void this.tts?.speak(token.surface),
        markKnown: () => {
          this.queueOps([{ lemma, kind: 'mark-known', at: Date.now() }]);
          this.setLocalStatus(lemma, 'known');
        },
        markUnknown: () => {
          this.queueOps([{ lemma, kind: 'mark-unknown', at: Date.now() }]);
          this.setLocalStatus(lemma, 'unknown');
        },
        loadGrammar: async () => {
          const result = await this.dictionary?.getMeaning(token.lemma);
          return result?.success && result.data ? result.data.explain : null;
        },
        showOriginal: () => this.reveal(sentence, true),
      },
    );

    // Opening the card is a lookup, unless the word never counts as new
    if (entry && !entry.free) {
      this.queueOps([{ lemma, kind: 'lookup', at: Date.now() }]);
      this.setLocalStatus(lemma, 'learning');
    }
  }

  private clearCardTimer(): void {
    if (this.cardTimer !== null) {
      clearTimeout(this.cardTimer);
      this.cardTimer = null;
    }
  }

  // ==================== Model and learning tools ====================

  private setUpLearningTools(
    activeConfig: ApiConfigItem | null,
    settings: UserSettings,
    nativeLanguage: string,
    targetLanguage: string,
  ): void {
    this.dictionary = new AITranslationProvider(
      activeConfig,
      getApiTimeout(settings.apiRequestTimeout || 0) || 0,
    );
    this.dictionary.setLanguages(nativeLanguage, targetLanguage);
    this.tts = new WebSpeechTTSProvider({
      lang: getSpeechLocale(targetLanguage),
    });
  }

  private async callConfiguredModel(
    request: Parameters<ModelCaller>[0],
  ): ReturnType<ModelCaller> {
    const settings = await this.storage.getUserSettings();
    const active = settings.apiConfigs.find(
      (item) => item.id === settings.activeApiConfigId,
    );
    if (!active) {
      return { success: false, content: '', error: 'No active API config' };
    }

    const limiter = rateLimitManager.getLimiter(
      active.config.apiEndpoint || active.id,
      active.config.requestsPerSecond || 0,
      true,
    );
    const [result] = await limiter.executeBatch([
      () =>
        callAI(request.userMessage, {
          systemPrompt: request.systemPrompt,
          maxTokens: request.maxTokens,
          configId: active.id,
          timeout: getApiTimeout(settings.apiRequestTimeout || 0),
        }),
    ]);
    return {
      success: result.success,
      content: result.content,
      error: result.error,
    };
  }
}

function hasAncestorIn(
  element: Element,
  set: { has(element: Element): boolean },
  includeSelf = false,
): boolean {
  let current = includeSelf ? element : element.parentElement;
  while (current) {
    if (set.has(current)) return true;
    current = current.parentElement;
  }
  return false;
}

function languageName(code: string): string {
  return languageService.getLanguage(code)?.name ?? code;
}
