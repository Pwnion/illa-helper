import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SENTENCE_MODE_CONFIG,
  normalizeSentenceModeConfig,
} from '@/src/modules/sentence/config';
import { BEGINNER_GRAMMAR } from '@/src/modules/sentence/grammar';

describe('normalizeSentenceModeConfig', () => {
  it('fills in defaults for missing settings', () => {
    expect(normalizeSentenceModeConfig(undefined)).toEqual(
      DEFAULT_SENTENCE_MODE_CONFIG,
    );
    expect(DEFAULT_SENTENCE_MODE_CONFIG).toMatchObject({
      maxNewWords: 1,
      coldStartLevel: 2,
      pageCap: 1,
      exposuresToKnow: 5,
      batchChars: 1500,
    });
    expect(DEFAULT_SENTENCE_MODE_CONFIG.unlockedGrammar).toEqual([
      ...BEGINNER_GRAMMAR,
    ]);
  });

  it('clamps values and drops unknown grammar tags', () => {
    const config = normalizeSentenceModeConfig({
      maxNewWords: -3,
      coldStartLevel: 9,
      pageCap: 1.5,
      exposuresToKnow: 0,
      batchChars: 50,
      dwellMsPerWord: Number.NaN,
      unlockedGrammar: ['past', 'past', 'bogus' as never],
    });
    expect(config).toMatchObject({
      maxNewWords: 0,
      coldStartLevel: 6,
      pageCap: 1,
      exposuresToKnow: 1,
      batchChars: 200,
      dwellMsPerWord: DEFAULT_SENTENCE_MODE_CONFIG.dwellMsPerWord,
      unlockedGrammar: ['past'],
    });
  });
});
