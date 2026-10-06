import {
  UserSettings,
  ReplacementConfig,
  TranslationStyle,
} from '@/src/modules/shared/types';
import { StorageService } from '@/src/modules/core/storage';
import { StyleManager } from '@/src/modules/styles';
import { TextReplacerService } from '@/src/modules/core/translation/TextReplacerService';
import { languageService } from '@/src/modules/core/translation/LanguageService';
import { IConfigurationService } from '../types';

/**
 * Configuration service: user settings and API configuration
 */
export class ConfigurationService implements IConfigurationService {
  private storageService: StorageService;

  constructor() {
    this.storageService = StorageService.getInstance();
  }

  /**
   * Loads the user settings
   */
  async getUserSettings(): Promise<UserSettings> {
    return await this.storageService.getUserSettings();
  }

  /**
   * Builds the replacement configuration
   */
  createReplacementConfig(
    settings: UserSettings,
    pageLanguage?: string,
  ): ReplacementConfig {
    const effectiveSettings = this.resolveSettingsForPage(
      settings,
      pageLanguage,
    );

    // The currently active API configuration
    const activeConfig = effectiveSettings.apiConfigs.find(
      (config) => config.id === effectiveSettings.activeApiConfigId,
    );

    return {
      userLevel: effectiveSettings.userLevel,
      replacementRate: effectiveSettings.replacementRate,
      useGptApi: effectiveSettings.useGptApi,
      userSettings: effectiveSettings,
      activeApiConfig: activeConfig || null,
      apiConfig: activeConfig?.config || {
        apiKey: '',
        apiEndpoint: '',
        model: '',
        temperature: 0,
        enable_thinking: false,
        phraseEnabled: true,
      },
      inlineTranslation: true,
      translationStyle: effectiveSettings.translationStyle,
    };
  }

  /**
   * Pushes the latest settings to every module that depends on them
   */
  updateConfiguration(
    settings: UserSettings,
    styleManager: StyleManager,
    textReplacer: TextReplacerService,
    pageLanguage?: string,
  ): void {
    styleManager.setTranslationStyle(settings.translationStyle);

    // Apply custom CSS when the custom style is selected
    if (settings.translationStyle === TranslationStyle.CUSTOM) {
      styleManager.setCustomCSS(settings.customTranslationCSS);
    }

    textReplacer.updateConfig(
      this.createReplacementConfig(settings, pageLanguage),
    );
  }

  /**
   * Returns the active API configuration
   */
  getActiveApiConfig(settings: UserSettings) {
    return settings.apiConfigs.find(
      (config) => config.id === settings.activeApiConfigId,
    );
  }

  private resolveSettingsForPage(
    settings: UserSettings,
    pageLanguage?: string,
  ): UserSettings {
    if (!pageLanguage) {
      return settings;
    }

    return {
      ...settings,
      multilingualConfig: {
        ...settings.multilingualConfig,
        targetLanguage: languageService.resolveTargetLanguage(
          settings.multilingualConfig,
          pageLanguage,
        ),
      },
    };
  }
}
