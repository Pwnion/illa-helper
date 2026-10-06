/**
 * Settings storage service:
 * persists user settings, with multiple API configurations, events and validation
 *
 * Features:
 * - serialised settings storage
 * - multiple API configurations
 * - validation and automatic repair
 * - change events
 * - configuration statistics
 */

import { browser } from 'wxt/browser';
import { UserSettings } from '../../shared/types/storage';
import {
  ApiConfig,
  ApiConfigItem,
  ApiProtocolFamily,
} from '../../shared/types/api';
import { DEFAULT_SETTINGS } from '../../shared/constants/defaults';
import {
  normalizeApiProtocolFamily,
  sanitizeApiConfig,
} from '../../shared/ApiConfigHelpers';
import {
  StorageServiceConfig,
  StorageOperationResult,
  ConfigurationStats,
  StorageEventType,
  StorageEventData,
  StorageEventListener,
} from './types';

// ==================== Storage service ====================

/**
 * Storage service
 * (singleton)
 */
export class StorageService {
  private static instance: StorageService;
  private static readonly STORAGE_KEY = 'user_settings';

  // Configuration and state
  private readonly config: StorageServiceConfig;
  private readonly storageKey: string;
  private eventListeners: Map<StorageEventType, StorageEventListener[]> =
    new Map();

  /**
   * Private constructor (singleton)
   */
  private constructor(config: StorageServiceConfig = {}) {
    this.config = {
      enableAutoBackup: true,
      enableValidation: true,
      maxRetries: 3,
      storageKey: 'user_settings',
      ...config,
    };
    this.storageKey = this.config.storageKey!;
  }

  /**
   * Returns the singleton instance
   * @param config optional service configuration
   * @returns StorageService instance
   */
  public static getInstance(config?: StorageServiceConfig): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService(config);
    }
    return StorageService.instance;
  }

  // ==================== Events ====================

  /**
   * Adds an event listener
   * @param eventType event type
   * @param listener listener
   */
  public addEventListener(
    eventType: StorageEventType,
    listener: StorageEventListener,
  ): void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, []);
    }
    this.eventListeners.get(eventType)!.push(listener);
  }

  /**
   * Removes an event listener
   * @param eventType event type
   * @param listener listener
   */
  public removeEventListener(
    eventType: StorageEventType,
    listener: StorageEventListener,
  ): void {
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Emits an event
   * @param eventType event type
   * @param data event data
   * @param error error message
   */
  private emitEvent(
    eventType: StorageEventType,
    data?: any,
    error?: string,
  ): void {
    const event: StorageEventData = {
      type: eventType,
      timestamp: Date.now(),
      data,
      error,
    };

    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          listener(event);
        } catch (e) {
          console.error('Storage event listener error:', e);
        }
      });
    }
  }

  // ==================== Core storage ====================

  /**
   * Loads the user settings
   * @returns user settings
   */
  public async getUserSettings(): Promise<UserSettings> {
    try {
      const result = await browser.storage.sync.get(StorageService.STORAGE_KEY);
      const serializedData = result[StorageService.STORAGE_KEY];

      if (!serializedData) {
        this.emitEvent(StorageEventType.SETTINGS_LOADED, DEFAULT_SETTINGS);
        return DEFAULT_SETTINGS;
      }

      const userSettings: UserSettings = JSON.parse(serializedData);
      const validatedSettings = this.validateAndFixSettings(userSettings);

      if (this.hasConfigurationChanged(userSettings, validatedSettings)) {
        await this.saveUserSettings(validatedSettings);
      }

      this.emitEvent(StorageEventType.SETTINGS_LOADED, validatedSettings);
      return validatedSettings;
    } catch (error) {
      const errorMessage = `Failed to load user settings: ${error}`;
      console.error(errorMessage);
      this.emitEvent(
        StorageEventType.SETTINGS_LOADED,
        DEFAULT_SETTINGS,
        errorMessage,
      );
      return DEFAULT_SETTINGS;
    }
  }

  /**
   * Saves the user settings
   * @param settings settings to save
   */
  public async saveUserSettings(
    settings: UserSettings,
  ): Promise<StorageOperationResult> {
    try {
      // Validate
      if (this.config.enableValidation) {
        settings = this.validateAndFixSettings(settings);
      }

      // Serialise
      const serializedData = JSON.stringify(settings);

      await browser.storage.sync.set({
        [this.storageKey]: serializedData,
      });

      this.emitEvent(StorageEventType.SETTINGS_SAVED, settings);
      return { success: true, data: settings };
    } catch (error) {
      const errorMessage = `Failed to save user settings: ${error}`;
      console.error(errorMessage);
      this.emitEvent(StorageEventType.SETTINGS_SAVED, null, errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  // ==================== API configurations ====================

  /**
   * Returns the active API configuration item, keeping its id and protocol family so callers never lose its identity.
   */
  public async getActiveApiConfigItem(): Promise<ApiConfigItem | null> {
    try {
      const settings = await this.getUserSettings();
      return (
        settings.apiConfigs.find(
          (config) => config.id === settings.activeApiConfigId,
        ) || null
      );
    } catch (error) {
      console.error('Failed to get the active API configuration item:', error);
      return null;
    }
  }

  /**
   * Returns the active API configuration
   */
  public async getActiveApiConfig(): Promise<ApiConfig | null> {
    try {
      const activeConfig = await this.getActiveApiConfigItem();
      return activeConfig?.config || null;
    } catch (error) {
      console.error('Failed to get the active API configuration:', error);
      return null;
    }
  }

  /**
   * Sets the active API configuration
   */
  public async setActiveApiConfig(
    configId: string,
  ): Promise<StorageOperationResult> {
    try {
      const settings = await this.getUserSettings();
      const configExists = settings.apiConfigs.some(
        (config) => config.id === configId,
      );

      if (!configExists) {
        const errorMessage = `API configuration ${configId} does not exist`;
        console.error(errorMessage);
        return { success: false, error: errorMessage };
      }

      settings.activeApiConfigId = configId;
      const saveResult = await this.saveUserSettings(settings);

      if (saveResult.success) {
        this.emitEvent(StorageEventType.ACTIVE_CONFIG_CHANGED, { configId });
      }

      return saveResult;
    } catch (error) {
      const errorMessage = `Failed to set the active API configuration: ${error}`;
      console.error(errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Adds an API configuration
   */
  public async addApiConfig(
    name: string,
    protocolFamily: ApiProtocolFamily,
    config: ApiConfig,
  ): Promise<StorageOperationResult> {
    try {
      const settings = await this.getUserSettings();
      const newConfig: ApiConfigItem = {
        id: `config-${Date.now()}`,
        name,
        protocolFamily,
        config: sanitizeApiConfig(config),
      };

      settings.apiConfigs.push(newConfig);
      const saveResult = await this.saveUserSettings(settings);

      if (saveResult.success) {
        this.emitEvent(StorageEventType.API_CONFIG_ADDED, newConfig);
        return { success: true, data: newConfig.id };
      }

      return saveResult;
    } catch (error) {
      const errorMessage = `Failed to add the API configuration: ${error}`;
      console.error(errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Updates an API configuration
   */
  public async updateApiConfig(
    configId: string,
    name: string,
    protocolFamily: ApiProtocolFamily,
    config: ApiConfig,
  ): Promise<StorageOperationResult> {
    try {
      const settings = await this.getUserSettings();
      const configIndex = settings.apiConfigs.findIndex(
        (c) => c.id === configId,
      );

      if (configIndex === -1) {
        const errorMessage = `API configuration ${configId} does not exist`;
        console.error(errorMessage);
        return { success: false, error: errorMessage };
      }

      const updatedConfig = {
        ...settings.apiConfigs[configIndex],
        name,
        protocolFamily,
        config: sanitizeApiConfig(config),
      };

      settings.apiConfigs[configIndex] = updatedConfig;

      const saveResult = await this.saveUserSettings(settings);

      if (saveResult.success) {
        this.emitEvent(StorageEventType.API_CONFIG_UPDATED, updatedConfig);
      }

      return saveResult;
    } catch (error) {
      const errorMessage = `Failed to update the API configuration: ${error}`;
      console.error(errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Removes an API configuration
   */
  public async removeApiConfig(
    configId: string,
  ): Promise<StorageOperationResult> {
    try {
      const settings = await this.getUserSettings();

      if (settings.apiConfigs.length <= 1) {
        const errorMessage = 'At least one API configuration must remain';
        console.error(errorMessage);
        return { success: false, error: errorMessage };
      }

      // When removing the active configuration, switch to the first remaining one
      if (settings.activeApiConfigId === configId) {
        const firstConfig = settings.apiConfigs.find((c) => c.id !== configId);
        if (firstConfig) {
          settings.activeApiConfigId = firstConfig.id;
        }
      }

      settings.apiConfigs = settings.apiConfigs.filter(
        (c) => c.id !== configId,
      );

      const saveResult = await this.saveUserSettings(settings);

      if (saveResult.success) {
        this.emitEvent(StorageEventType.API_CONFIG_REMOVED, { configId });
      }

      return saveResult;
    } catch (error) {
      const errorMessage = `Failed to remove the API configuration: ${error}`;
      console.error(errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  // ==================== Data management ====================

  /**
   * Clears all data
   */
  public async clearAllData(): Promise<StorageOperationResult> {
    try {
      await browser.storage.sync.remove(this.storageKey);
      this.emitEvent(StorageEventType.DATA_CLEARED);
      return { success: true };
    } catch (error) {
      const errorMessage = `Failed to clear data: ${error}`;
      console.error(errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Configuration statistics
   */
  public async getConfigStats(): Promise<ConfigurationStats> {
    try {
      const settings = await this.getUserSettings();

      return {
        intelligentModeEnabled: true,
        targetLanguage: settings.multilingualConfig.targetLanguage,
        totalKeys: Object.keys(settings).length,
        apiConfigsCount: settings.apiConfigs.length,
      };
    } catch (error) {
      console.error('Failed to get configuration statistics:', error);
      return {
        intelligentModeEnabled: true,
        targetLanguage: 'en',
        totalKeys: 0,
        apiConfigsCount: 0,
      };
    }
  }

  // ==================== Validation ====================

  /**
   * Validates and repairs settings
   * @param settings raw settings
   * @returns repaired settings
   */
  private validateAndFixSettings(settings: UserSettings): UserSettings {
    const validatedSettings = { ...settings };

    try {
      // Make sure required fields exist
      if (!validatedSettings.apiConfigs) {
        validatedSettings.apiConfigs = DEFAULT_SETTINGS.apiConfigs;
      }

      validatedSettings.apiConfigs = this.normalizeApiConfigs(
        validatedSettings.apiConfigs,
      );

      if (validatedSettings.apiConfigs.length === 0) {
        validatedSettings.apiConfigs = DEFAULT_SETTINGS.apiConfigs;
      }

      if (!validatedSettings.activeApiConfigId) {
        if (validatedSettings.apiConfigs.length > 0) {
          validatedSettings.activeApiConfigId =
            validatedSettings.apiConfigs[0].id;
        }
      }

      // Make sure the active configuration exists
      if (validatedSettings.activeApiConfigId) {
        const activeConfigExists = validatedSettings.apiConfigs.some(
          (config) => config.id === validatedSettings.activeApiConfigId,
        );

        if (!activeConfigExists && validatedSettings.apiConfigs.length > 0) {
          validatedSettings.activeApiConfigId =
            validatedSettings.apiConfigs[0].id;
        }
      }

      // Other required fields
      if (!validatedSettings.multilingualConfig) {
        validatedSettings.multilingualConfig =
          DEFAULT_SETTINGS.multilingualConfig;
      }

      // Lazy loading configuration
      if (!validatedSettings.lazyLoading) {
        validatedSettings.lazyLoading = DEFAULT_SETTINGS.lazyLoading;
      }

      return validatedSettings;
    } catch (error) {
      console.error(`Settings validation failed: ${error}`);
      return DEFAULT_SETTINGS;
    }
  }

  private normalizeApiConfigs(rawConfigs: unknown[]): ApiConfigItem[] {
    return rawConfigs
      .map((rawConfig, index) => this.normalizeApiConfigItem(rawConfig, index))
      .filter((config): config is ApiConfigItem => config !== null);
  }

  private normalizeApiConfigItem(
    rawConfig: unknown,
    index: number,
  ): ApiConfigItem | null {
    if (!rawConfig || typeof rawConfig !== 'object') {
      return null;
    }

    const candidate = rawConfig as Partial<ApiConfigItem> & {
      protocolFamily?: string;
      config?: Partial<ApiConfig>;
    };

    const protocolFamily = normalizeApiProtocolFamily(candidate.protocolFamily);
    if (!protocolFamily) {
      // Only current protocol families are accepted; old provider names and unknown configs are dropped.
      return null;
    }

    return {
      id: candidate.id?.trim() || `config-${Date.now()}-${index}`,
      name: candidate.name?.trim() || this.getDefaultConfigName(protocolFamily),
      protocolFamily,
      config: sanitizeApiConfig(candidate.config),
    };
  }

  private getDefaultConfigName(protocolFamily: ApiProtocolFamily): string {
    return protocolFamily === ApiProtocolFamily.GEMINI
      ? 'Gemini'
      : 'OpenAI Compatible';
  }

  /**
   * Whether the configuration changed
   * @param original original configuration
   * @param fixed repaired configuration
   * @returns whether it changed
   */
  private hasConfigurationChanged(
    original: UserSettings,
    fixed: UserSettings,
  ): boolean {
    try {
      return JSON.stringify(original) !== JSON.stringify(fixed);
    } catch {
      return true; // treat comparison failures as changed
    }
  }
}

// ==================== Exports ====================

// Singleton instance
export const storageService = StorageService.getInstance();

// Default export
export default StorageService;
