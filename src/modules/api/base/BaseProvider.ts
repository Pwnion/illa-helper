/**
 * Base translation provider
 */

import { ApiConfig, FullTextAnalysisResponse } from '../../shared/types/api';
import { UserSettings } from '../../shared/types/storage';
import { ITranslationProvider } from '../types';
import { validateInputs, createErrorResponse } from '../utils/apiUtils';

/**
 * Abstract base provider
 * with shared behaviour and error handling
 */
export abstract class BaseProvider implements ITranslationProvider {
  protected config: ApiConfig;

  constructor(config: ApiConfig) {
    this.config = config;
  }

  /**
   * Analyses the full text (template method)
   */
  async analyzeFullText(
    text: string,
    settings: UserSettings,
  ): Promise<FullTextAnalysisResponse> {
    const originalText = text || '';

    // Validate input
    if (!validateInputs(originalText, this.config.apiKey)) {
      return createErrorResponse(originalText);
    }

    try {
      return await this.doAnalyzeFullText(originalText, settings);
    } catch (error: any) {
      console.error(`${this.getProviderName()} API request failed:`, error);
      return createErrorResponse(originalText);
    }
  }

  /**
   * Provider-specific analysis implemented by subclasses
   */
  protected abstract doAnalyzeFullText(
    text: string,
    settings: UserSettings,
  ): Promise<FullTextAnalysisResponse>;

  /**
   * Provider name, used in logs
   */
  protected abstract getProviderName(): string;

  /**
   * Returns the configuration
   */
  protected getConfig(): ApiConfig {
    return this.config;
  }
}
