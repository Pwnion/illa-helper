import { describe, expect, it } from 'vitest';
import {
  PageCap,
  evaluateSentence,
  isLemmaKnown,
  lemmaEntries,
  normalizeLemma,
} from '@/src/modules/sentence/selection';
import type { LemmaRecord, LemmaStatus } from '@/src/modules/sentence/types';
import { analysis, token } from './fixtures';

function record(lemma: string, status: LemmaStatus): LemmaRecord {
  return { lang: 'sv', lemma, status, exposures: 0, lookups: 0, lastSeen: 0 };
}

const config = {
  maxNewWords: 1,
  coldStartLevel: 2,
  unlockedGrammar: ['pres', 'def'] as const,
};

describe('lemmaEntries', () => {
  it('groups particle verb parts and keeps the highest CEFR', () => {
    const entries = lemmaEntries(
      analysis('Jag tycker om det', [
        token('Jag', 'jag', 1),
        token('tycker', 'tycka om', 2),
        token('om', 'Tycka  om', 3),
        token('det', 'det', 1),
      ]),
    );
    expect(entries.map((e) => [e.lemma, e.cefr])).toEqual([
      ['jag', 1],
      ['tycka om', 3],
      ['det', 1],
    ]);
  });

  it('marks proper nouns, cognates and numbers as free', () => {
    const entries = lemmaEntries(
      analysis('Anna har 3 problem', [
        token('Anna', 'Anna', 6, { proper: true }),
        token('har', 'ha', 1),
        token('3', '3', 6),
        token('problem', 'problem', 5, { cognate: true }),
      ]),
    );
    expect(entries.filter((e) => e.free).map((e) => e.lemma)).toEqual([
      'anna',
      '3',
      'problem',
    ]);
  });
});

describe('isLemmaKnown', () => {
  const entry = (cefr: number) => ({ lemma: 'ord', cefr, free: false });

  it('applies the cold-start level only to unjudged lemmas', () => {
    expect(isLemmaKnown(entry(2), undefined, 2)).toBe(true);
    expect(isLemmaKnown(entry(3), undefined, 2)).toBe(false);
    expect(isLemmaKnown(entry(2), record('ord', 'seen'), 2)).toBe(true);
    expect(isLemmaKnown(entry(1), record('ord', 'unknown'), 2)).toBe(false);
    expect(isLemmaKnown(entry(1), record('ord', 'learning'), 2)).toBe(false);
  });

  it('treats marked-known lemmas as known at any level', () => {
    expect(isLemmaKnown(entry(6), record('ord', 'known'), 0)).toBe(true);
  });
});

describe('evaluateSentence', () => {
  const sentence = analysis(
    'Katten sover på mattan',
    [
      token('Katten', 'katt', 1),
      token('sover', 'sova', 2),
      token('på', 'på', 1),
      token('mattan', 'matta', 4),
    ],
    ['pres', 'def'],
  );

  it('allows up to maxNewWords unknown lemmas', () => {
    const result = evaluateSentence(sentence, () => undefined, config);
    expect(result).toEqual({
      eligible: true,
      newLemmas: ['matta'],
      blockedTags: [],
    });
  });

  it('rejects sentences with too many new words', () => {
    const vocab = new Map([['sova', record('sova', 'learning')]]);
    const result = evaluateSentence(sentence, (l) => vocab.get(l), config);
    expect(result.eligible).toBe(false);
    expect(result.newLemmas).toEqual(['sova', 'matta']);
  });

  it('counts marked-known lemmas as known', () => {
    const vocab = new Map([['matta', record('matta', 'known')]]);
    const result = evaluateSentence(sentence, (l) => vocab.get(l), {
      ...config,
      maxNewWords: 0,
    });
    expect(result.eligible).toBe(true);
  });

  it('rejects sentences using locked grammar', () => {
    const result = evaluateSentence(sentence, () => undefined, {
      ...config,
      unlockedGrammar: ['pres'],
    });
    expect(result.eligible).toBe(false);
    expect(result.blockedTags).toEqual(['def']);
  });

  it('never counts proper nouns or cognates as new', () => {
    const named = analysis('Anna gillar Stockholm', [
      token('Anna', 'Anna', 6, { proper: true }),
      token('gillar', 'gilla', 1),
      token('Stockholm', 'Stockholm', 6, { proper: true, cognate: true }),
    ]);
    expect(
      evaluateSentence(named, () => undefined, { ...config, maxNewWords: 0 })
        .eligible,
    ).toBe(true);
  });
});

describe('PageCap', () => {
  it('is unlimited at 1 and floors fractions', () => {
    const unlimited = new PageCap(3, 1);
    for (let i = 0; i < 10; i++) expect(unlimited.tryConsume()).toBe(true);

    const half = new PageCap(5, 0.5);
    expect([half.tryConsume(), half.tryConsume(), half.tryConsume()]).toEqual([
      true,
      true,
      false,
    ]);

    half.addSentences(4, 0.5);
    expect([half.tryConsume(), half.tryConsume(), half.tryConsume()]).toEqual([
      true,
      true,
      false,
    ]);
  });
});

describe('normalizeLemma', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalizeLemma('  Tycka   Om ')).toBe('tycka om');
  });
});
