/**
 * Text replacement service:
 * replaces words in text according to the user's settings
 */

import { ApiServiceFactory } from '../../api';
import { StyleManager } from '../../styles';

// Replacement result
export interface ReplacementResult {
  original: string; // source text
  replaced: string; // text after replacement
  replacedWords: Array<{
    chinese: string;
    english: string;
    position: {
      start: number;
      end: number;
    };
    isNew: boolean; // whether the word is new to the learner
  }>;
}

// Cache key
interface CacheKey {
  text: string;
  sourceLanguage?: string;
  targetLanguage: string;
  userLevel: number;
  replacementRate: number;
}

// Cache statistics
export interface CacheStats {
  cacheSize: number;
}
import {
  ReplacementConfig,
  FullTextAnalysisResponse,
} from '../../shared/types/api';
import { UserSettings } from '../../shared/types/storage';
import { TranslationStyle } from '../../shared/types/core';

/**
 * Text replacement service
 * (singleton)
 */
export class TextReplacerService {
  // Singleton instance
  private static instance: TextReplacerService | null = null;

  // Cache settings
  private static readonly CACHE_MAX_SIZE = 100;
  private static readonly CACHE_CLEANUP_BATCH = 20;

  // Components
  public readonly styleManager: StyleManager;
  private config: ReplacementConfig;
  private cache: Map<string, FullTextAnalysisResponse>;

  /**
   * Private constructor (singleton)
   */
  private constructor(config: ReplacementConfig) {
    this.config = config;
    this.styleManager = new StyleManager();
    this.cache = new Map<string, FullTextAnalysisResponse>();
    this.initializeStyleManager();
  }

  /**
   * Returns the singleton instance
   */
  public static getInstance(config?: ReplacementConfig): TextReplacerService {
    if (!TextReplacerService.instance) {
      if (!config) {
        throw new Error(
          'A configuration is required when first creating TextReplacerService',
        );
      }
      TextReplacerService.instance = new TextReplacerService(config);
    }
    return TextReplacerService.instance;
  }

  /**
   * Resets the instance (mainly for tests)
   */
  public static resetInstance(): void {
    TextReplacerService.instance = null;
  }

  /**
   * Initialises the style manager
   */
  private initializeStyleManager(): void {
    const translationStyle =
      this.config.translationStyle || TranslationStyle.DEFAULT;
    this.styleManager.setTranslationStyle(translationStyle);
  }

  /**
   * Updates the service configuration
   * @param config partial configuration
   */
  public updateConfig(config: Partial<ReplacementConfig>): void {
    this.config = { ...this.config, ...config };

    if (config.translationStyle) {
      this.styleManager.setTranslationStyle(config.translationStyle);
    }
  }

  /**
   * Current configuration
   */
  public getConfig(): ReplacementConfig {
    return { ...this.config };
  }

  /**
   * Replaces words in the text
   * @param text source text
   * @returns replacement result
   */
  public async replaceText(text: string): Promise<FullTextAnalysisResponse> {
    try {
      // Without the API, return the text unchanged
      if (!this.config.useGptApi) {
        return this.createEmptyResult(text);
      }

      const settingsForApi = this.buildUserSettings();

      // Translate
      return await this.processTranslation(text, settingsForApi);
    } catch (error) {
      console.error('Text replacement failed:', error);
      return this.createEmptyResult(text);
    }
  }

  /**
   * Creates an empty replacement result
   */
  private createEmptyResult(text: string): FullTextAnalysisResponse {
    return {
      original: text,
      processed: text,
      replacements: [],
    };
  }

  /**
   * Builds user settings for the API call
   */
  private buildUserSettings(): UserSettings {
    return {
      ...this.config.userSettings,
      userLevel: this.config.userLevel,
      replacementRate: this.config.replacementRate,
      useGptApi: this.config.useGptApi,
      translationStyle: this.config.translationStyle,
    };
  }

  /**
   * Translation entry point
   * @param text source text
   * @param settings user settings
   * @returns translation result
   */
  private async processTranslation(
    text: string,
    settings: UserSettings,
  ): Promise<FullTextAnalysisResponse> {
    // Build the cache key
    const cacheKey = this.generateCacheKey(text, settings);

    // Check the cache
    const cachedResult = this.getCachedResult(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }

    try {
      // Fetch from the API
      const apiResult = await this.callTranslationAPI(text, settings);

      // Cache the result
      this.setCachedResult(cacheKey, apiResult);

      return apiResult;
    } catch (error) {
      console.error('Translation failed:', error);
      return await this.handleTranslationError(text, settings, error);
    }
  }

  /**
   * Calls the translation API
   */
  private async callTranslationAPI(
    text: string,
    settings: UserSettings,
  ): Promise<FullTextAnalysisResponse> {
    const activeConfig = this.config.activeApiConfig;

    if (!activeConfig) {
      throw new Error('No active API configuration found');
    }

    // Create the right provider with the factory
    const translationProvider = ApiServiceFactory.createProvider(activeConfig);

    // Call the API
    return await translationProvider.analyzeFullText(text, settings);
  }

  /**
   * Handles translation errors
   */
  private async handleTranslationError(
    text: string,
    settings: UserSettings,
    error: any,
  ): Promise<FullTextAnalysisResponse> {
    console.log('Translation failed, returning the original text:', error);

    // There is no fallback; return the original text
    return this.createEmptyResult(text);
  }

  /**
   * Builds the cache key
   * @param text text
   * @param settings settings
   * @returns cache key
   */
  private generateCacheKey(text: string, settings: UserSettings): string {
    const targetLanguage = settings.multilingualConfig.targetLanguage;

    const keyData: CacheKey = {
      text: text.trim(),
      targetLanguage: targetLanguage,
      userLevel: settings.userLevel,
      replacementRate: settings.replacementRate,
    };

    return this.hashCacheKey(keyData);
  }

  /**
   * Hashes the cache key
   */
  private hashCacheKey(keyData: CacheKey): string {
    const str = JSON.stringify(keyData);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // force a 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  // ==================== Cache management ====================

  /**
   * Reads a cached result
   */
  private getCachedResult(cacheKey: string): FullTextAnalysisResponse | null {
    return this.cache.get(cacheKey) || null;
  }

  /**
   * Writes a cached result
   */
  private setCachedResult(
    cacheKey: string,
    result: FullTextAnalysisResponse,
  ): void {
    this.cache.set(cacheKey, result);
    this.cleanupCache();
  }

  /**
   * Removes expired cache entries
   */
  private cleanupCache(): void {
    if (this.cache.size > TextReplacerService.CACHE_MAX_SIZE) {
      const keys = Array.from(this.cache.keys());
      const deleteCount =
        this.cache.size -
        TextReplacerService.CACHE_MAX_SIZE +
        TextReplacerService.CACHE_CLEANUP_BATCH;

      for (let i = 0; i < deleteCount; i++) {
        this.cache.delete(keys[i]);
      }

      console.log(`Cache cleanup: removed ${deleteCount} entries`);
    }
  }

  /**
   * Cache statistics
   * @returns statistics
   */
  public getCacheStats(): CacheStats {
    return {
      cacheSize: this.cache.size,
    };
  }

  /**
   * Clears the whole cache
   */
  public clearAllCache(): void {
    this.cache.clear();
    console.log('Cache cleared');
  }

  // ==================== Service lifecycle ====================

  /**
   * Initialises the service
   */
  public async initialize(): Promise<void> {
    // Warm the cache or other initialisation
    console.log('TextReplacerService initialised');
  }

  /**
   * Releases resources
   */
  public dispose(): void {
    this.clearAllCache();
    // Other cleanup
    console.log('TextReplacerService resources released');
  }
}

// Convenience accessor
export const getTextReplacerService = (config?: ReplacementConfig) => {
  return TextReplacerService.getInstance(config);
};
