/**
 * Storage service types:
 * storage management, configuration statistics and validation
 */

import { UserSettings } from '../../shared/types/storage';
import { ApiConfig, ApiConfigItem } from '../../shared/types/api';

// ==================== Storage operations ====================

/**
 * Result of a storage operation
 */
export interface StorageOperationResult {
  success: boolean;
  error?: string;
  data?: any;
}

/**
 * Configuration statistics
 */
export interface ConfigurationStats {
  intelligentModeEnabled: boolean;
  targetLanguage: string;
  totalKeys: number;
  apiConfigsCount: number;
}

/**
 * Storage service configuration
 */
export interface StorageServiceConfig {
  enableAutoBackup?: boolean;
  enableValidation?: boolean;
  maxRetries?: number;
  storageKey?: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
  isValid: boolean;
  hasChanges: boolean;
  validatedData: UserSettings;
  errors: string[];
}

/**
 * Storage event types
 */
export enum StorageEventType {
  SETTINGS_LOADED = 'settings_loaded',
  SETTINGS_SAVED = 'settings_saved',
  API_CONFIG_ADDED = 'api_config_added',
  API_CONFIG_UPDATED = 'api_config_updated',
  API_CONFIG_REMOVED = 'api_config_removed',
  ACTIVE_CONFIG_CHANGED = 'active_config_changed',
  DATA_CLEARED = 'data_cleared',
}

/**
 * Storage event payload
 */
export interface StorageEventData {
  type: StorageEventType;
  timestamp: number;
  data?: any;
  error?: string;
}

/**
 * Storage event listener
 */
export type StorageEventListener = (event: StorageEventData) => void;

// ==================== Exports ====================

export type { UserSettings, ApiConfig, ApiConfigItem };
