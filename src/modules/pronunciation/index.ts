/**
 * Pronunciation module entry point,
 * exposing a single API surface
 */

// Core service
export { PronunciationService } from './services/PronunciationService';

// Configuration
export * from './config';

// Types
export * from './types';

// Providers, grouped by feature
export * from './phonetic';
export * from './tts';
export * from './translation';

// Utilities
export * from './utils';

// UI
export * from './ui';

// Default export: the main service
export { PronunciationService as default } from './services/PronunciationService';
