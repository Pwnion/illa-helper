/**
 * Sentence mode defaults and settings normalisation.
 */

import {
  BEGINNER_ADDED_IN_V2,
  BEGINNER_GRAMMAR,
  GRAMMAR_TAG_IDS,
  GRAMMAR_TAG_SET_VERSION,
  SPLIT_FROM_V1,
  isGrammarTagId,
  type GrammarTagId,
} from './grammar';
import type { SentenceModeConfig } from './types';

export const DEFAULT_SENTENCE_MODE_CONFIG: SentenceModeConfig = {
  maxNewWords: 1,
  coldStartLevel: 2, // A2
  unlockedGrammar: [...BEGINNER_GRAMMAR],
  grammarTagSetVersion: GRAMMAR_TAG_SET_VERSION,
  pageCap: 1,
  dwellMsPerWord: 300,
  minDwellMs: 1500,
  exposuresToKnow: 5,
  batchChars: 1500,
};

/** Bounds keep hand-edited or imported settings usable. */
export function normalizeSentenceModeConfig(
  raw: Partial<SentenceModeConfig> | undefined,
): SentenceModeConfig {
  const defaults = DEFAULT_SENTENCE_MODE_CONFIG;
  const source = raw ?? {};

  return {
    maxNewWords: clampInt(source.maxNewWords, 0, 10, defaults.maxNewWords),
    coldStartLevel: clampInt(
      source.coldStartLevel,
      0,
      6,
      defaults.coldStartLevel,
    ),
    unlockedGrammar: normalizeUnlockedGrammar(source),
    grammarTagSetVersion: GRAMMAR_TAG_SET_VERSION,
    pageCap: clampNumber(source.pageCap, 0, 1, defaults.pageCap),
    dwellMsPerWord: clampInt(
      source.dwellMsPerWord,
      0,
      5000,
      defaults.dwellMsPerWord,
    ),
    minDwellMs: clampInt(source.minDwellMs, 0, 60000, defaults.minDwellMs),
    exposuresToKnow: clampInt(
      source.exposuresToKnow,
      1,
      100,
      defaults.exposuresToKnow,
    ),
    batchChars: clampInt(source.batchChars, 200, 8000, defaults.batchChars),
  };
}

function normalizeUnlockedGrammar(
  source: Partial<SentenceModeConfig>,
): GrammarTagId[] {
  if (!Array.isArray(source.unlockedGrammar)) {
    return [...DEFAULT_SENTENCE_MODE_CONFIG.unlockedGrammar];
  }
  const unlocked = new Set(source.unlockedGrammar.filter(isGrammarTagId));

  // Settings saved before version 2 predate the split and added tags
  if ((source.grammarTagSetVersion ?? 1) < 2) {
    for (const [oldTag, newTag] of Object.entries(SPLIT_FROM_V1)) {
      if (unlocked.has(oldTag as GrammarTagId) && newTag) unlocked.add(newTag);
    }
    for (const tag of BEGINNER_ADDED_IN_V2) unlocked.add(tag);
  }

  return GRAMMAR_TAG_IDS.filter((id) => unlocked.has(id));
}

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function clampInt(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  return Math.round(clampNumber(value, min, max, fallback));
}

/**
 * A copy of the settings with sentenceMode normalised, for saving. Never
 * mutates its input: writing the normalised object back into reactive
 * settings re-triggers a deep watcher on them, forever.
 */
export function withNormalizedSentenceMode<
  T extends { sentenceMode?: Partial<SentenceModeConfig> },
>(settings: T): T & { sentenceMode: SentenceModeConfig } {
  return {
    ...settings,
    sentenceMode: normalizeSentenceModeConfig(settings.sentenceMode),
  };
}
