/**
 * Core types:
 * basic enums and types used across the project
 */

// Learner level (CEFR)
export enum UserLevel {
  A1 = 1, // beginner
  A2 = 2, // elementary
  B1 = 3, // intermediate
  B2 = 4, // upper intermediate
  C1 = 5, // advanced
  C2 = 6, // proficient
}

/**
 * UserLevel options (CEFR)
 */
export const USER_LEVEL_OPTIONS = [
  {
    value: UserLevel.A1,
    label: 'A1',
  },
  {
    value: UserLevel.A2,
    label: 'A2',
  },
  {
    value: UserLevel.B1,
    label: 'B1',
  },
  {
    value: UserLevel.B2,
    label: 'B2',
  },
  {
    value: UserLevel.C1,
    label: 'C1',
  },
  {
    value: UserLevel.C2,
    label: 'C2',
  },
];

// Translation style
export enum TranslationStyle {
  DEFAULT = 'default',
  SUBTLE = 'subtle',
  BOLD = 'bold',
  ITALIC = 'italic',
  UNDERLINED = 'underlined',
  HIGHLIGHTED = 'highlighted',
  DOTTED = 'dotted',
  LEARNING = 'learning',
  CUSTOM = 'custom',
}

// Trigger mode
export enum TriggerMode {
  AUTOMATIC = 'automatic',
  MANUAL = 'manual',
}

// Original word display mode
export enum OriginalWordDisplayMode {
  VISIBLE,
  LEARNING,
  HIDDEN,
}

// Translation position
export enum TranslationPosition {
  BEFORE = 'before',
  AFTER = 'after',
}

// Translation mode
export enum TranslationMode {
  WORD = 'word', // words and phrases replaced inline
  SENTENCE = 'sentence', // whole sentences at the learner's level replaced inline
  PARAGRAPH = 'paragraph', // full translation under each paragraph
}

// Context menu action
export type ContextMenuActionType =
  | 'add-to-blacklist'
  | 'add-to-whitelist'
  | 'remove-from-blacklist'
  | 'remove-from-whitelist';

// URL pattern type
export type UrlPatternType = 'domain' | 'exact';

// Lazy loading configuration
export interface LazyLoadingConfig {
  /** Whether lazy loading is enabled */
  enabled: boolean;
  /** Preload distance as a fraction of the viewport (0.5 = half a screen ahead) */
  preloadDistance: number;
}
