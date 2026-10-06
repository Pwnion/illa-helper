/**
 * Phonetics types
 */

/**
 * Phonetic information:
 * phonetics, meanings and AI definition for a word
 */
export interface PhoneticInfo {
  /** The word */
  word: string;
  /** Phonetic entries */
  phonetics: PhoneticEntry[];
  /** Meaning entries (optional) */
  meanings?: MeaningEntry[];
  /** AI definition (optional) */
  aiTranslation?: AITranslationEntry;
  /** Error state (optional) */
  error?: {
    /** Whether the phonetics lookup failed */
    hasPhoneticError: boolean;
    /** Phonetics error message */
    phoneticErrorMessage?: string;
  };
}

/**
 * Phonetic entry:
 * text, audio and source
 */
export interface PhoneticEntry {
  /** Phonetic text (e.g. /ˈhɛloʊ/) */
  text?: string;
  /** Audio URL */
  audio?: string;
  /** Source URL */
  sourceUrl?: string;
}

/**
 * Meaning entry:
 * part of speech and definitions
 */
export interface MeaningEntry {
  /** Part of speech */
  partOfSpeech: string;
  /** Definitions */
  definitions: DefinitionEntry[];
}

/**
 * Definition entry:
 * definition, example and synonyms
 */
export interface DefinitionEntry {
  /** Definition */
  definition: string;
  /** Example (optional) */
  example?: string;
  /** Synonyms (optional) */
  synonyms?: string[];
}

/**
 * Phonetics lookup result:
 * the full outcome of a lookup
 */
export interface PhoneticResult {
  /** Whether the lookup succeeded */
  success: boolean;
  /** Phonetic data on success */
  data?: PhoneticInfo;
  /** Error message on failure */
  error?: string;
  /** Whether the result came from the cache */
  cached?: boolean;
}

/**
 * Cache entry
 * for an in-memory cache with TTL
 */
export interface CacheEntry<T> {
  /** Cached data */
  data: T;
  /** Creation timestamp */
  timestamp: number;
  /** Time to live (ms) */
  ttl: number;
}

/**
 * AI dictionary entry:
 * definition text and source
 */
export interface AITranslationEntry {
  /** Definition text */
  explain: string;
  /** Source identifier */
  source: string;
}

/**
 * AI dictionary result:
 * status and data of a lookup
 */
export interface AITranslationResult {
  /** Whether the lookup succeeded */
  success: boolean;
  /** Data on success */
  data?: AITranslationEntry;
  /** Error message on failure */
  error?: string;
  /** Whether the result came from the cache */
  cached?: boolean;
}
