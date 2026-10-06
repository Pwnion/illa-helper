/**
 * Pronunciation service facade.
 *
 * Registers elements, looks up phonetics, speaks text and applies API/TTS/UI
 * configuration updates. Tooltip DOM lifecycle and mouse interaction live in
 * TooltipInteractionController.
 */

import { IPhoneticProvider, PhoneticProviderFactory } from '../phonetic';
import { ITTSProvider, TTSProviderFactory } from '../tts';
import { AITranslationProvider } from '../translation';
import { TooltipRenderer, TooltipInteractionController } from '../ui';
import { PhoneticResult, TTSResult } from '../types';
import { PronunciationConfig, DEFAULT_PRONUNCIATION_CONFIG } from '../config';
import { ApiConfigItem } from '../../shared/types/api';
import { StorageService } from '../../core/storage';
import { OriginalWordDisplayMode } from '../../shared/types/core';

export class PronunciationService {
  private config: PronunciationConfig;
  private phoneticProvider: IPhoneticProvider;
  private ttsProvider: ITTSProvider;
  private aiTranslationProvider: AITranslationProvider;
  private tooltipRenderer: TooltipRenderer;
  private tooltipController: TooltipInteractionController;
  private storageService: StorageService;

  constructor(
    config?: Partial<PronunciationConfig>,
    apiConfigItem?: ApiConfigItem | null,
  ) {
    this.config = { ...DEFAULT_PRONUNCIATION_CONFIG, ...config };
    this.phoneticProvider = PhoneticProviderFactory.getDefaultProvider();
    this.ttsProvider = TTSProviderFactory.createProvider(
      this.config.ttsConfig.provider,
      this.config.ttsConfig,
    );
    this.aiTranslationProvider = new AITranslationProvider(
      apiConfigItem ?? null,
    );
    this.tooltipRenderer = new TooltipRenderer(
      this.config.uiConfig,
      OriginalWordDisplayMode.HIDDEN,
    );
    this.storageService = StorageService.getInstance();
    this.tooltipController = new TooltipInteractionController({
      getConfig: () => this.config,
      phoneticProvider: this.phoneticProvider,
      translationProvider: this.aiTranslationProvider,
      renderer: this.tooltipRenderer,
      storageService: this.storageService,
      speakText: (text) => this.speakText(text),
    });

    void this.updateOriginalWordDisplayMode();
  }

  async addPronunciationToElement(
    element: HTMLElement,
    word: string,
    isPhrase?: boolean,
  ): Promise<boolean> {
    return this.tooltipController.register(element, word, isPhrase);
  }

  removePronunciationFromElement(element: HTMLElement): void {
    this.tooltipController.unregister(element);
  }

  async getPhonetic(word: string): Promise<PhoneticResult> {
    return this.phoneticProvider.getPhonetic(word);
  }

  /**
   * Speaks text with a voice for the configured target language.
   */
  async speakText(text: string): Promise<TTSResult> {
    try {
      this.stopSpeaking();
      return await this.ttsProvider.speak(text);
    } catch (error) {
      console.error('Unexpected error while speaking:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Speech unavailable',
      };
    }
  }

  stopSpeaking(): void {
    try {
      this.ttsProvider.stop();
    } catch (error) {
      console.error('Failed to stop the TTS provider:', error);
    }
  }

  updateConfig(config: Partial<PronunciationConfig>): void {
    this.config = { ...this.config, ...config };

    if (config.ttsConfig) {
      this.ttsProvider.updateConfig(config.ttsConfig);
    }

    if (config.uiConfig) {
      this.tooltipRenderer.updateConfig(config.uiConfig);
      void this.updateOriginalWordDisplayMode();
    }
  }

  /**
   * Applies a new API configuration; AI definitions use it immediately.
   */
  async updateApiConfig(apiConfigItem?: ApiConfigItem | null): Promise<void> {
    try {
      const configToUse =
        apiConfigItem ?? (await this.storageService.getActiveApiConfigItem());
      this.aiTranslationProvider.updateApiConfig(configToUse ?? null);
      if (!configToUse) {
        console.warn('No active API configuration found');
      }
    } catch (error) {
      console.error('Failed to update API configuration:', error);
    }
  }

  /**
   * Sets the language pair used for AI dictionary lookups.
   */
  setLanguages(nativeLanguage: string, targetLanguage: string): void {
    this.aiTranslationProvider.setLanguages(nativeLanguage, targetLanguage);
  }

  getConfig(): PronunciationConfig {
    return { ...this.config };
  }

  getTTSProviderStatus(): {
    name: string;
    available: boolean;
    speaking: boolean;
  } {
    return {
      name: this.ttsProvider.name,
      available: this.ttsProvider.isAvailable(),
      speaking: this.ttsProvider.isSpeaking(),
    };
  }

  destroy(): void {
    this.tooltipController.destroy();
    this.stopSpeaking();
  }

  private async updateOriginalWordDisplayMode(): Promise<void> {
    try {
      const userSettings = await this.storageService.getUserSettings();
      const mode =
        userSettings.originalWordDisplayMode || OriginalWordDisplayMode.VISIBLE;
      this.tooltipRenderer.updateOriginalWordDisplayMode(mode);
    } catch (error) {
      console.error('Failed to update the original-word display mode:', error);
      this.tooltipRenderer.updateOriginalWordDisplayMode(
        OriginalWordDisplayMode.VISIBLE,
      );
    }
  }
}
