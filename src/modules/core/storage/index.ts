/**
 * Storage service entry point.
 * Exports everything related to settings storage.
 */

// Services
export { default as StorageService, storageService } from './StorageService';

// Types
export type {
  StorageOperationResult,
  ConfigurationStats,
  ValidationResult,
  StorageServiceConfig,
  StorageEventData,
  StorageEventListener,
  UserSettings,
  ApiConfig,
  ApiConfigItem,
} from './types';

export { StorageEventType } from './types';

// Default export
export { storageService as default } from './StorageService';
