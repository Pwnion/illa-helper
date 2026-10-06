/**
 * OpenAI-compatible translation provider
 */

import { FullTextAnalysisResponse } from '../../shared/types/api';
import { UserSettings } from '../../shared/types/storage';
import { BaseProvider } from '../base/BaseProvider';
import { mergeCustomParams } from '../utils/apiUtils';
import { addPositionsToReplacements } from '../utils/textUtils';
import { sendApiRequest } from '../utils/requestUtils';
import { getSystemPromptByConfig } from '../../core/translation/PromptService';
import { getApiTimeout } from '@/src/utils';
import { rateLimitManager } from '../../infrastructure/ratelimit';
import { StructuredTextParser } from '../utils/structuredTextParser';
import { languageService } from '../../core/translation/LanguageService';

/**
 * OpenAI-compatible API provider
 */
export class OpenAIProvider extends BaseProvider {
  protected getProviderName(): string {
    return 'OpenAI';
  }

  protected async doAnalyzeFullText(
    text: string,
    settings: UserSettings,
  ): Promise<FullTextAnalysisResponse> {
    const systemPrompt = getSystemPromptByConfig({
      targetLanguage: settings.multilingualConfig.targetLanguage,
      userLevel: settings.userLevel,
      replacementRate: settings.replacementRate,
    });

    let requestBody: any = {
      model: this.config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Translate to ${languageService.getTargetLanguageDisplayName(settings.multilingualConfig.targetLanguage)} (original||translation): ${text}`,
        },
      ],
      temperature: this.config.temperature,
    };

    if (this.config.includeThinkingParam) {
      requestBody.enable_thinking = this.config.enable_thinking;
    }

    requestBody = mergeCustomParams(requestBody, this.config.customParams);

    const rateLimiter = rateLimitManager.getLimiter(
      this.config.apiEndpoint,
      this.config.requestsPerSecond || 0,
      true,
    );

    const apiRequestFunction = async () => {
      const timeout = getApiTimeout(settings.apiRequestTimeout || 0);
      return sendApiRequest(requestBody, this.config, timeout);
    };

    const [response] = await rateLimiter.executeBatch([apiRequestFunction]);

    if (!response.ok) {
      console.error(
        `API request failed: ${response.status} ${response.statusText}`,
      );
      throw new Error(
        `API request failed: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();
    return this.extractReplacements(data, text, settings.replacementRate);
  }

  /**
   * Extracts replacements from the response
   */
  private extractReplacements(
    data: any,
    originalText: string,
    replacementRate: number,
  ): FullTextAnalysisResponse {
    try {
      if (!data?.choices?.[0]?.message?.content) {
        throw new Error('Unexpected API response format');
      }

      const rawContent = data.choices[0].message.content;
      // Parse with the structured text parser
      const parseResult = StructuredTextParser.parse(rawContent);

      if (!parseResult.success) {
        console.error(`[OpenAI extract] Parse failed:`, parseResult.errors);
        throw new Error(
          `Structured text parse failed: ${parseResult.errors.join(', ')}`,
        );
      }

      // Attach positions
      const replacements = addPositionsToReplacements(
        originalText,
        parseResult.replacements,
        { replacementRate },
      );

      return {
        original: originalText,
        processed: '',
        replacements,
      };
    } catch (error) {
      console.error('Failed to extract replacements:', error);
      throw error;
    }
  }
}
