/**
 * Paragraph translation API.
 *
 * Reuses UniversalApiService for full paragraph translations.
 * Unlike the word replacement API it uses a plain translation prompt.
 */

import { callAI } from '../../api/services/UniversalApiService';
import { StorageService } from '../storage';
import { languageService } from './LanguageService';
import { cleanParagraphTranslationResult } from './ParagraphTranslationResult';

/**
 * Paragraph translation prompt template
 */
const PARAGRAPH_TRANSLATION_PROMPT = `You are a professional translator. Translate the following text to {{targetLang}}. 

Requirements:
- Output ONLY the translation, no explanations
- Maintain the original meaning and tone
- If the text is already in the target language or doesn't need translation, return the original text
- Keep proper nouns, technical terms, and formatting as appropriate

Text to translate:
{{input}}`;

/**
 * Paragraph translation API
 */
export class ParagraphTranslationApi {
  private static instance: ParagraphTranslationApi | null = null;
  private storageService: StorageService;

  private constructor() {
    this.storageService = StorageService.getInstance();
  }

  /**
   * Returns the singleton instance
   */
  public static getInstance(): ParagraphTranslationApi {
    if (!ParagraphTranslationApi.instance) {
      ParagraphTranslationApi.instance = new ParagraphTranslationApi();
    }
    return ParagraphTranslationApi.instance;
  }

  /**
   * Translates a paragraph
   * @param sourceText source text
   * @param targetLanguage target language (defaults to the user setting)
   * @returns the translated text
   */
  public async translateParagraph(
    sourceText: string,
    targetLanguage?: string,
  ): Promise<string> {
    if (!sourceText || !sourceText.trim()) {
      return '';
    }

    // Clean the text (remove zero-width spaces and similar)
    const cleanSourceText = sourceText.replace(/\u200B/g, '').trim();

    try {
      // Load user settings
      const settings = await this.storageService.getUserSettings();

      const detectedPageLanguage = await languageService.detectPageLanguage();
      const finalTargetLanguage =
        targetLanguage ||
        languageService.resolveTargetLanguage(
          settings.multilingualConfig,
          detectedPageLanguage,
        );

      // Build the prompt
      const prompt = this.buildParagraphTranslationPrompt(
        cleanSourceText,
        finalTargetLanguage,
      );

      console.log(`[ParagraphTranslationApi] Calling the API...`);
      const result = await callAI(prompt);
      console.log(`[ParagraphTranslationApi] Raw API result:`, result);

      if (!result.success) {
        throw new Error(result.error || 'Translation API call failed');
      }

      // Post-process the result
      const processedResult = cleanParagraphTranslationResult(
        result.content,
        cleanSourceText,
      );

      return processedResult;
    } catch (error) {
      console.error('Paragraph translation API call failed:', error);
      throw error;
    }
  }

  /**
   * Builds the paragraph translation prompt
   */
  private buildParagraphTranslationPrompt(
    sourceText: string,
    targetLanguage: string,
  ): string {
    // Map language codes to unambiguous language names
    const languageNames: { [key: string]: string } = {
      zh: 'Chinese',
      'zh-cn': 'Chinese',
      chinese: 'Chinese',
      en: 'English',
      'en-us': 'English',
      english: 'English',
      ja: 'Japanese',
      japanese: 'Japanese',
      ko: 'Korean',
      korean: 'Korean',
      fr: 'French',
      french: 'French',
      de: 'German',
      german: 'German',
      es: 'Spanish',
      spanish: 'Spanish',
      ru: 'Russian',
      russian: 'Russian',
    };

    const finalLanguageName =
      languageNames[targetLanguage.toLowerCase()] || targetLanguage;

    return PARAGRAPH_TRANSLATION_PROMPT.replace(
      '{{targetLang}}',
      finalLanguageName,
    ).replace('{{input}}', sourceText);
  }

  /**
   * Translates several paragraphs
   * @param paragraphs paragraphs
   * @param targetLanguage target language (optional)
   * @param concurrency concurrency (default 3, to stay under rate limits)
   * @returns translations
   */
  public async translateMultipleParagraphs(
    paragraphs: string[],
    targetLanguage?: string,
    concurrency: number = 3,
  ): Promise<string[]> {
    if (paragraphs.length === 0) {
      return [];
    }

    const results: string[] = new Array(paragraphs.length).fill('');

    // Process in batches to stay under rate limits
    for (let i = 0; i < paragraphs.length; i += concurrency) {
      const batch = paragraphs.slice(i, i + concurrency);
      const batchPromises = batch.map(async (paragraph, batchIndex) => {
        const actualIndex = i + batchIndex;
        try {
          const translated = await this.translateParagraph(
            paragraph,
            targetLanguage,
          );
          results[actualIndex] = translated;
        } catch (error) {
          console.warn(
            `Paragraph translation failed [index ${actualIndex}]:`,
            error,
          );
          results[actualIndex] = ''; // empty string on failure
        }
      });

      await Promise.all(batchPromises);

      // Short pause between batches to stay under rate limits
      if (i + concurrency < paragraphs.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    return results;
  }
}
