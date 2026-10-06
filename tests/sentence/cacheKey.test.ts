import { describe, expect, it } from 'vitest';
import { analysisCacheKey } from '@/src/modules/sentence/cacheKey';

const base = {
  promptVersion: 1,
  model: 'openai-compatible:gpt-4o-mini',
  sourceLanguage: 'en',
  targetLanguage: 'sv',
  nativeLanguage: 'en',
  text: 'The cat sleeps.',
};

describe('analysisCacheKey', () => {
  it('is deterministic and 28 hex characters long', () => {
    const key = analysisCacheKey(base);
    expect(key).toBe(analysisCacheKey({ ...base }));
    expect(key).toMatch(/^[0-9a-f]{28}$/);
  });

  it('changes with every component', () => {
    const key = analysisCacheKey(base);
    for (const change of [
      { promptVersion: 2 },
      { model: 'gemini:gemini-2.5-flash' },
      { sourceLanguage: 'de' },
      { targetLanguage: 'no' },
      { nativeLanguage: 'de' },
      { text: 'The cat sleeps!' },
    ]) {
      expect(analysisCacheKey({ ...base, ...change })).not.toBe(key);
    }
  });

  it('ignores language code case', () => {
    expect(analysisCacheKey({ ...base, targetLanguage: 'SV' })).toBe(
      analysisCacheKey(base),
    );
  });
});
