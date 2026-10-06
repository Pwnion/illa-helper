/**
 * Pronunciation type exports
 */

export * from './phonetic.types';
export * from './tts.types';
export * from './ui.types';

// Phonetics
export type {
  PhoneticInfo,
  PhoneticEntry,
  MeaningEntry,
  DefinitionEntry,
  PhoneticResult,
  CacheEntry,
} from './phonetic.types';

// TTS
export type {
  TTSResult,
  TTSProviderType,
  TTSProviderStatus,
} from './tts.types';

// UI
export type {
  PronunciationElementData,
  TooltipType,
  TooltipState,
  InteractionEventType,
  InteractionEventHandler,
} from './ui.types';
