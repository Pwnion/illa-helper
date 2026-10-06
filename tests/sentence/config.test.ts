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
      grammarTagSetVersion: 2,
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

  describe('grammar tag set migration', () => {
    it('unlocks both halves of a split tag and the new beginner tags', () => {
      const config = normalizeSentenceModeConfig({
        unlockedGrammar: ['pres', 'refl', 'pass', 'participle'],
      });
      expect(config.grammarTagSetVersion).toBe(2);
      expect([...config.unlockedGrammar].sort()).toEqual(
        [
          'pres',
          'refl',
          'reflposs',
          'pass',
          'blipass',
          'participle',
          'prespart',
          'formalsubj',
          'adjagr',
          'poss',
          'adverb',
        ].sort(),
      );
    });

    it('leaves the other new tags locked', () => {
      const config = normalizeSentenceModeConfig({ unlockedGrammar: ['pres'] });
      expect(config.unlockedGrammar).not.toContain('cleft');
      expect(config.unlockedGrammar).not.toContain('indirectq');
      expect(config.unlockedGrammar).not.toContain('reflposs');
    });

    it('does not migrate settings already on version 2', () => {
      const config = normalizeSentenceModeConfig({
        unlockedGrammar: ['refl'],
        grammarTagSetVersion: 2,
      });
      expect(config.unlockedGrammar).toEqual(['refl']);
    });

    it('is stable when normalised again', () => {
      const once = normalizeSentenceModeConfig({ unlockedGrammar: ['pass'] });
      expect(normalizeSentenceModeConfig(once)).toEqual(once);
    });
  });
});
