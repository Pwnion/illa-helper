/**
 * Sentence store access for content scripts.
 *
 * The IndexedDB store lives in the extension origin, so content scripts reach
 * it through runtime messages handled by the background script.
 */

import type { LemmaRecord, SentenceAnalysis, VocabOp } from '../types';
import type { CachedAnalysisInput } from './SentenceStore';

export const SENTENCE_STORE_MESSAGE = 'sentence-store';

export type SentenceStoreRequest =
  | { action: 'getAnalyses'; keys: string[] }
  | { action: 'putAnalyses'; entries: CachedAnalysisInput[] }
  | { action: 'getLemmas'; lang: string; lemmas: string[] }
  | {
      action: 'applyVocabOps';
      lang: string;
      ops: VocabOp[];
      exposuresToKnow: number;
    };

export interface SentenceStoreResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export type SentenceStoreTransport = (
  request: SentenceStoreRequest,
) => Promise<SentenceStoreResponse>;

const runtimeTransport: SentenceStoreTransport = (request) =>
  browser.runtime.sendMessage({ type: SENTENCE_STORE_MESSAGE, ...request });

export class SentenceStoreClient {
  constructor(
    private readonly transport: SentenceStoreTransport = runtimeTransport,
  ) {}

  async getAnalyses(keys: string[]): Promise<Record<string, SentenceAnalysis>> {
    return (await this.send({ action: 'getAnalyses', keys })) ?? {};
  }

  async putAnalyses(entries: CachedAnalysisInput[]): Promise<void> {
    await this.send({ action: 'putAnalyses', entries });
  }

  async getLemmas(lang: string, lemmas: string[]): Promise<LemmaRecord[]> {
    return (await this.send({ action: 'getLemmas', lang, lemmas })) ?? [];
  }

  async applyVocabOps(
    lang: string,
    ops: VocabOp[],
    exposuresToKnow: number,
  ): Promise<LemmaRecord[]> {
    return (
      (await this.send({
        action: 'applyVocabOps',
        lang,
        ops,
        exposuresToKnow,
      })) ?? []
    );
  }

  private async send<T>(request: SentenceStoreRequest): Promise<T | undefined> {
    try {
      const response = (await this.transport(
        request,
      )) as SentenceStoreResponse<T>;
      if (!response?.success) {
        console.warn(
          `[SentenceStore] ${request.action} failed:`,
          response?.error,
        );
        return undefined;
      }
      return response.data;
    } catch (error) {
      console.warn(`[SentenceStore] ${request.action} failed:`, error);
      return undefined;
    }
  }
}

/** Background-side dispatcher for SentenceStoreClient requests. */
export async function handleSentenceStoreRequest(
  store: {
    getAnalyses(keys: string[]): Promise<Record<string, SentenceAnalysis>>;
    putAnalyses(entries: CachedAnalysisInput[]): Promise<void>;
    getLemmas(lang: string, lemmas: string[]): Promise<LemmaRecord[]>;
    applyVocabOps(
      lang: string,
      ops: VocabOp[],
      exposuresToKnow: number,
    ): Promise<LemmaRecord[]>;
  },
  request: SentenceStoreRequest,
): Promise<SentenceStoreResponse> {
  try {
    switch (request.action) {
      case 'getAnalyses':
        return { success: true, data: await store.getAnalyses(request.keys) };
      case 'putAnalyses':
        await store.putAnalyses(request.entries);
        return { success: true };
      case 'getLemmas':
        return {
          success: true,
          data: await store.getLemmas(request.lang, request.lemmas),
        };
      case 'applyVocabOps':
        return {
          success: true,
          data: await store.applyVocabOps(
            request.lang,
            request.ops,
            request.exposuresToKnow,
          ),
        };
      default:
        return { success: false, error: 'Unknown sentence store action' };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
