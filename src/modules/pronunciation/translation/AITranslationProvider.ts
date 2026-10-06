/**
 * AI dictionary provider.
 *
 * Looks up a target-language word or phrase with the configured LLM and
 * returns a short gloss in the learner's native language plus the grammar a
 * learner needs (gender and inflections for nouns, principal parts for verbs).
 * Results are cached in memory for 24 hours per language pair and API config.
 */

import { AITranslationResult, AITranslationEntry, CacheEntry } from '../types';
import { ApiConfigItem } from '../../shared/types/api';
import { API_CONSTANTS } from '../config';
import { cleanMarkdownFromResponse } from '@/src/utils';
import { UniversalApiService } from '../../api/services/UniversalApiService';
import { languageService } from '../../core/translation/LanguageService';

/**
 * Per-language grammar instructions. Languages without an entry get the
 * generic guidance, which still asks for gender and principal parts where the
 * language has them.
 */
const GRAMMAR_GUIDANCE: Record<string, string> = {
  sv: `- Nouns: give the gender article (en/ett) and the four forms: indefinite singular, definite singular, indefinite plural, definite plural (e.g. "en katt, katten, katter, katterna").
- Verbs: give the infinitive, present, past (preteritum) and supine (e.g. "skriva, skriver, skrev, skrivit"). Treat particle verbs as one unit with the particle (e.g. "tycka om, tycker om, tyckte om, tyckt om") and note when the particle is stressed.
- Adjectives: give the common, neuter (-t) and plural/definite (-a) forms, plus irregular comparison if any.
- s-verbs (deponents like "hoppas", "finnas"): say so.`,
};

const GENERIC_GRAMMAR_GUIDANCE = `- Nouns: give grammatical gender or noun class and the key inflected forms (e.g. plural, definite form) where the language has them.
- Verbs: give the principal parts a learner must memorise. Treat separable, particle and reflexive verbs as one unit.
- Adjectives: give agreement forms or irregular comparison if the language has them.`;

export function buildDictionaryPrompt(
  nativeLanguage: string,
  targetLanguage: string,
): string {
  const nativeName = languageName(nativeLanguage);
  const targetName = languageName(targetLanguage);
  const baseTarget = targetLanguage.toLowerCase().split(/[-_]/)[0];
  const guidance = GRAMMAR_GUIDANCE[baseTarget] || GENERIC_GRAMMAR_GUIDANCE;

  return `You are a concise bilingual dictionary for a ${nativeName} speaker learning ${targetName}.
The user sends one ${targetName} word or short phrase as it appeared on a web page (it may be inflected).

Reply in plain text, no markdown, at most 3 short lines:
1. Dictionary form, part of speech, and meaning(s) in ${nativeName}, most common first, separated by semicolons.
2. The grammar a learner needs for this word:
${guidance}
3. Optional: one very short usage note in ${nativeName}. Omit the line if there is nothing useful to say.

If the input is not ${targetName}, give its meaning in ${nativeName} on one line and stop.`;
}

function languageName(code: string): string {
  return languageService.getLanguage(code)?.name || code;
}

export class AITranslationProvider {
  readonly name = 'ai-translation';

  /** The API config must keep its id so requests use an explicit config. */
  private apiConfigItem: ApiConfigItem | null;

  /** Request timeout in milliseconds; 0 means no limit */
  private timeout: number = 0;

  private nativeLanguage = 'en';
  private targetLanguage = 'sv';

  private cache = new Map<string, CacheEntry<AITranslationEntry>>();

  private readonly cacheTTL = API_CONSTANTS.AI_TRANSLATION_CACHE_TTL;

  private universalApi: UniversalApiService;

  constructor(apiConfigItem: ApiConfigItem | null, timeout: number = 0) {
    this.apiConfigItem = apiConfigItem;
    this.timeout = timeout;
    this.universalApi = UniversalApiService.getInstance();
  }

  setLanguages(nativeLanguage: string, targetLanguage: string): void {
    if (
      nativeLanguage === this.nativeLanguage &&
      targetLanguage === this.targetLanguage
    ) {
      return;
    }
    this.nativeLanguage = nativeLanguage;
    this.targetLanguage = targetLanguage;
    this.cache.clear();
  }

  /**
   * Returns a gloss and grammar notes for a target-language word or phrase.
   */
  async getMeaning(word: string): Promise<AITranslationResult> {
    try {
      if (!word || typeof word !== 'string') {
        return {
          success: false,
          error: 'Invalid word',
        };
      }

      const cleanWord = word.toLowerCase().trim();

      const cached = this.getFromCache(cleanWord);
      if (cached) {
        return {
          success: true,
          data: cached,
          cached: true,
        };
      }

      const apiConfig = this.apiConfigItem?.config;

      // Lookups must use an explicit config rather than silently falling back
      // to whichever config is globally active.
      if (!this.apiConfigItem || !apiConfig) {
        return {
          success: false,
          error: 'No AI API configuration available',
        };
      }

      if (!apiConfig.apiKey) {
        return {
          success: false,
          error: 'Incomplete AI API configuration: missing API key',
        };
      }

      const result = await this.universalApi.call(cleanWord, {
        systemPrompt: buildDictionaryPrompt(
          this.nativeLanguage,
          this.targetLanguage,
        ),
        configId: this.apiConfigItem.id,
        temperature: apiConfig.temperature || 0,
        maxTokens: 200,
        timeout: this.timeout,
        customParams: apiConfig.customParams,
      });

      if (!result.success) {
        return {
          success: false,
          error: result.error || 'AI dictionary request failed',
        };
      }

      const meaningInfo = this.parseAIResponse(result.content, cleanWord);

      this.setCache(cleanWord, meaningInfo);

      return {
        success: true,
        data: meaningInfo,
        cached: false,
      };
    } catch (error) {
      console.error('AI dictionary lookup failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      if (!this.apiConfigItem?.config?.apiKey) {
        return false;
      }

      return await this.universalApi.isAvailable(this.apiConfigItem.id);
    } catch {
      return false;
    }
  }

  getConfig() {
    return {
      endpoint: this.apiConfigItem?.config.apiEndpoint,
      rateLimitPerMinute: 20,
      supportsBatch: false,
      supportsAudio: false,
      supportsMeaning: true,
    };
  }

  updateApiConfig(apiConfigItem: ApiConfigItem | null, timeout?: number): void {
    const previousKey = this.getCacheScopeKey();
    this.apiConfigItem = apiConfigItem;
    if (timeout !== undefined) {
      this.timeout = timeout;
    }
    if (previousKey !== this.getCacheScopeKey()) {
      this.cache.clear();
    }
  }

  private getCacheScopeKey(): string {
    const config = this.apiConfigItem?.config;
    return this.apiConfigItem
      ? `${this.apiConfigItem.id}:${config?.apiEndpoint || ''}:${config?.model || ''}`
      : 'none';
  }

  private parseAIResponse(content: string, word: string): AITranslationEntry {
    let explain = content?.trim() || '';

    if (!explain) {
      explain = `No definition available for "${word}"`;
    } else {
      explain = cleanMarkdownFromResponse(explain);
      if (explain.length > 400) {
        explain = explain.substring(0, 400) + '...';
      }
    }

    return {
      explain,
      source: 'ai-translation',
    };
  }

  private getFromCache(word: string): AITranslationEntry | null {
    const entry = this.cache.get(word);
    if (entry && Date.now() - entry.timestamp < entry.ttl) {
      return entry.data;
    }

    if (entry) {
      this.cache.delete(word);
    }

    return null;
  }

  private setCache(word: string, data: AITranslationEntry): void {
    this.cache.set(word, {
      data,
      timestamp: Date.now(),
      ttl: this.cacheTTL,
    });

    if (this.cache.size > 500) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
  }
}
