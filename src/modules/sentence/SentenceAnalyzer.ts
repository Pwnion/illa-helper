/**
 * Sends sentence batches to the model and parses the analyses.
 *
 * On a parse failure the batch is retried once as two smaller batches; if
 * those fail too, their sentences are skipped. Sentences missing from an
 * otherwise valid response are skipped without a retry.
 */

import { parseAnalysisResponse } from './parser';
import {
  buildAnalysisSystemPrompt,
  buildAnalysisUserMessage,
  estimateMaxOutputTokens,
  type PromptLanguages,
  type PromptSentence,
} from './prompt';
import type { SentenceAnalysis } from './types';

export interface ModelResponse {
  success: boolean;
  content: string;
  error?: string;
}

export type ModelCaller = (request: {
  systemPrompt: string;
  userMessage: string;
  maxTokens: number;
}) => Promise<ModelResponse>;

export class SentenceAnalyzer {
  constructor(private readonly callModel: ModelCaller) {}

  async analyze(
    sentences: readonly PromptSentence[],
    languages: PromptLanguages,
  ): Promise<Map<number, SentenceAnalysis>> {
    return this.analyzeBatch(sentences, languages, true);
  }

  private async analyzeBatch(
    sentences: readonly PromptSentence[],
    languages: PromptLanguages,
    allowRetry: boolean,
  ): Promise<Map<number, SentenceAnalysis>> {
    if (sentences.length === 0) return new Map();

    let response: ModelResponse;
    try {
      response = await this.callModel({
        systemPrompt: buildAnalysisSystemPrompt(languages),
        userMessage: buildAnalysisUserMessage(sentences),
        maxTokens: estimateMaxOutputTokens(sentences),
      });
    } catch (error) {
      response = {
        success: false,
        content: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }

    // A failed request is not a parse failure; retrying would just repeat it
    if (!response.success) {
      console.warn('[SentenceAnalyzer] Model request failed:', response.error);
      return new Map();
    }

    const parsed = parseAnalysisResponse(
      response.content,
      sentences.map((s) => s.id),
    );
    if (!parsed.error) return parsed.analyses;

    console.warn('[SentenceAnalyzer] Could not parse response:', parsed.error);
    if (!allowRetry) return new Map();

    if (sentences.length === 1) {
      return this.analyzeBatch(sentences, languages, false);
    }
    const middle = Math.ceil(sentences.length / 2);
    const [first, second] = await Promise.all([
      this.analyzeBatch(sentences.slice(0, middle), languages, false),
      this.analyzeBatch(sentences.slice(middle), languages, false),
    ]);
    return new Map([...first, ...second]);
  }
}
