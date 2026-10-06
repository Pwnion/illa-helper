/**
 * Pronunciation module constants
 */

// UI
export const UI_CONSTANTS = {
  TOOLTIP_Z_INDEX: 10000,
  WORD_TOOLTIP_Z_INDEX: 10001,
  TOOLTIP_PADDING: 12,
  TOOLTIP_ARROW_SIZE: 8,
} as const;

// Timers
export const TIMER_CONSTANTS = {
  SHOW_DELAY: 300, // show delay (ms)
  HIDE_DELAY: 600, // hide delay (ms)
  WORD_SHOW_DELAY: 100, // nested word tooltip show delay (ms)
} as const;

// CSS class names
export const CSS_CLASSES = {
  PRONUNCIATION_ENABLED: 'wxt-pronunciation-enabled',
  PRONUNCIATION_LOADING: 'wxt-pronunciation-loading',
  PHONETIC_INLINE: 'wxt-phonetic-inline',
  PRONUNCIATION_TOOLTIP: 'wxt-pronunciation-tooltip',
  WORD_TOOLTIP: 'wxt-word-tooltip',
  INTERACTIVE_WORD: 'wxt-interactive-word',
  MEANING_CONTAINER: 'wxt-meaning-container',
  MEANING_TEXT: 'wxt-meaning-text',
  MEANING_LOADING: 'wxt-meaning-loading',
  PHONETIC_LOADING: 'wxt-phonetic-loading',
} as const;

// SVG icons
export const SVG_ICONS = {
  SPEAKER: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`,
  SPEAKER_SMALL: `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`,
} as const;

// API
export const API_CONSTANTS = {
  DICTIONARY_API_BASE_URL: 'https://api.dictionaryapi.dev/api/v2/entries/en/',
  AI_TRANSLATION_CACHE_TTL: 86400000, // AI dictionary cache: 24 hours
} as const;
