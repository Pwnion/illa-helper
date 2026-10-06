/**
 * Dictionary API provider.
 * Fetches English phonetics from https://api.dictionaryapi.dev/api/v2/entries/en/
 */

import { IPhoneticProvider } from './IPhoneticProvider';
import {
  PhoneticResult,
  PhoneticInfo,
  PhoneticEntry,
  MeaningEntry,
  DefinitionEntry,
  CacheEntry,
} from '../types';
import { API_CONSTANTS } from '../config';

export class DictionaryApiProvider implements IPhoneticProvider {
  readonly name = 'dictionary-api';
  private readonly baseUrl = API_CONSTANTS.DICTIONARY_API_BASE_URL;
  private cache = new Map<string, CacheEntry<PhoneticInfo>>();
  private readonly cacheTTL = API_CONSTANTS.AI_TRANSLATION_CACHE_TTL;

  /**
   * Looks up phonetics for a word
   */
  async getPhonetic(word: string): Promise<PhoneticResult> {
    try {
      // Validate input
      if (!word || typeof word !== 'string') {
        return {
          success: false,
          error: 'Invalid word',
        };
      }

      const cleanWord = word.toLowerCase().trim();

      // Check the cache
      const cached = this.getFromCache(cleanWord);
      if (cached) {
        return {
          success: true,
          data: cached,
          cached: true,
        };
      }

      // Call the API
      const response = await fetch(
        `${this.baseUrl}${encodeURIComponent(cleanWord)}`,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
            Referer: location.href,
          },
        },
      );

      if (!response.ok) {
        if (response.status === 404) {
          return {
            success: false,
            error: `No phonetics found for this word`,
          };
        }
        throw new Error(
          `API request failed: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();
      const phoneticInfo = this.parseApiResponse(data, cleanWord);

      // Cache the result
      this.setCache(cleanWord, phoneticInfo);

      return {
        success: true,
        data: phoneticInfo,
        cached: false,
      };
    } catch (error) {
      console.error('Phonetics lookup failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Looks up phonetics for several words
   */
  async getBatchPhonetics(words: string[]): Promise<PhoneticResult[]> {
    // The Dictionary API has no batch endpoint, so issue single requests concurrently
    const promises = words.map((word) => this.getPhonetic(word));
    return Promise.all(promises);
  }

  /**
   * Whether the provider is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const testResponse = await fetch(`${this.baseUrl}hello`, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });
      return testResponse.ok || testResponse.status === 404; // a 404 still means the API is up
    } catch {
      return false;
    }
  }

  /**
   * Provider configuration
   */
  getConfig() {
    return {
      endpoint: this.baseUrl,
      rateLimitPerMinute: 450, // Dictionary API limit
      supportsBatch: false,
      supportsAudio: true,
    };
  }

  /**
   * Parses the API response
   */
  private parseApiResponse(data: any[], word: string): PhoneticInfo {
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('Unexpected API response format');
    }

    const entry = data[0]; // first entry
    const phonetics: PhoneticEntry[] = [];
    const meanings: MeaningEntry[] = [];

    // Phonetics
    if (entry.phonetics && Array.isArray(entry.phonetics)) {
      entry.phonetics.forEach((phonetic: any) => {
        if (phonetic.text || phonetic.audio) {
          phonetics.push({
            text: phonetic.text,
            audio: phonetic.audio,
            sourceUrl: phonetic.sourceUrl,
          });
        }
      });
    }

    // Meanings
    if (entry.meanings && Array.isArray(entry.meanings)) {
      entry.meanings.forEach((meaning: any) => {
        if (meaning.partOfSpeech && meaning.definitions) {
          const definitions: DefinitionEntry[] = meaning.definitions.map(
            (def: any) => ({
              definition: def.definition || '',
              example: def.example,
              synonyms: def.synonyms,
            }),
          );

          meanings.push({
            partOfSpeech: meaning.partOfSpeech,
            definitions,
          });
        }
      });
    }

    return {
      word,
      phonetics,
      meanings,
    };
  }

  /**
   * Reads from the cache
   */
  private getFromCache(word: string): PhoneticInfo | null {
    const entry = this.cache.get(word);
    if (entry && Date.now() - entry.timestamp < entry.ttl) {
      return entry.data;
    }

    // Drop expired entries
    if (entry) {
      this.cache.delete(word);
    }

    return null;
  }

  /**
   * Writes to the cache
   */
  private setCache(word: string, data: PhoneticInfo): void {
    this.cache.set(word, {
      data,
      timestamp: Date.now(),
      ttl: this.cacheTTL,
    });

    // Cap the cache size
    if (this.cache.size > 1000) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
  }
}
