import { describe, expect, it } from 'vitest';
import {
  applyVocabOp,
  countByStatus,
  parseVocabularyImport,
  vocabularyToCsv,
  vocabularyToJson,
} from '@/src/modules/sentence/vocabulary';
import type { LemmaRecord, VocabOp } from '@/src/modules/sentence/types';

const op = (kind: VocabOp['kind'], at = 1): VocabOp => ({
  lemma: 'Katt',
  kind,
  at,
});

function run(kinds: VocabOp['kind'][], threshold = 3): LemmaRecord {
  let record: LemmaRecord | undefined;
  kinds.forEach((kind, i) => {
    record = applyVocabOp(record, op(kind, i + 1), 'sv', threshold);
  });
  return record!;
}

describe('applyVocabOp', () => {
  it('creates a seen record on first exposure', () => {
    expect(run(['exposure'])).toEqual({
      lang: 'sv',
      lemma: 'katt',
      status: 'seen',
      exposures: 1,
      lookups: 0,
      lastSeen: 1,
    });
  });

  it('marks a lemma known after the exposure threshold', () => {
    expect(run(['exposure', 'exposure']).status).toBe('seen');
    expect(run(['exposure', 'exposure', 'exposure']).status).toBe('known');
  });

  it('a lookup marks learning and restarts the exposure count', () => {
    const record = run(['exposure', 'exposure', 'lookup']);
    expect(record).toMatchObject({
      status: 'learning',
      exposures: 0,
      lookups: 1,
    });
    expect(
      run(['exposure', 'exposure', 'lookup', 'exposure', 'exposure']).status,
    ).toBe('learning');
    expect(run(['lookup', 'exposure', 'exposure', 'exposure']).status).toBe(
      'known',
    );
  });

  it('a lookup demotes a known lemma', () => {
    expect(run(['mark-known', 'lookup']).status).toBe('learning');
  });

  it('reveal marks learning but leaves known lemmas known', () => {
    expect(run(['exposure', 'reveal'])).toMatchObject({
      status: 'learning',
      exposures: 0,
    });
    expect(run(['mark-known', 'reveal']).status).toBe('known');
  });

  it('reset-exposure only clears the exposure count', () => {
    expect(run(['exposure', 'exposure', 'reset-exposure'])).toMatchObject({
      status: 'seen',
      exposures: 0,
    });
  });

  it('applies manual marks', () => {
    expect(run(['mark-known']).status).toBe('known');
    expect(run(['exposure', 'mark-unknown'])).toMatchObject({
      status: 'unknown',
      exposures: 0,
    });
    expect(
      run(['mark-unknown', 'exposure', 'exposure', 'exposure']).status,
    ).toBe('known');
  });
});

describe('parseVocabularyImport', () => {
  it('parses one lemma per line with an optional tab-separated status', () => {
    expect(
      parseVocabularyImport(
        '# my words\nkatt\nHund\tlearning\ntycka om\tunknown\n\nfisk\tbogus\nkatt\tknown',
      ),
    ).toEqual([
      { lemma: 'katt', status: 'known' },
      { lemma: 'hund', status: 'learning' },
      { lemma: 'tycka om', status: 'unknown' },
      { lemma: 'fisk', status: 'known' },
    ]);
  });

  it('round-trips the CSV and JSON exports', () => {
    const records: LemmaRecord[] = [
      {
        lang: 'sv',
        lemma: 'katt',
        status: 'known',
        exposures: 5,
        lookups: 0,
        lastSeen: 0,
      },
      {
        lang: 'sv',
        lemma: 'säga "hej", ja',
        status: 'learning',
        exposures: 0,
        lookups: 2,
        lastSeen: 0,
      },
    ];
    const expected = [
      { lemma: 'katt', status: 'known' },
      { lemma: 'säga "hej", ja', status: 'learning' },
    ];
    expect(parseVocabularyImport(vocabularyToCsv(records))).toEqual(expected);
    expect(parseVocabularyImport(vocabularyToJson(records))).toEqual(expected);
  });

  it('returns nothing for empty or invalid input', () => {
    expect(parseVocabularyImport('   ')).toEqual([]);
    expect(parseVocabularyImport('[not json')).toEqual([]);
  });
});

describe('countByStatus', () => {
  it('counts each status', () => {
    const base = { lang: 'sv', exposures: 0, lookups: 0, lastSeen: 0 };
    expect(
      countByStatus([
        { ...base, lemma: 'a', status: 'known' },
        { ...base, lemma: 'b', status: 'known' },
        { ...base, lemma: 'c', status: 'seen' },
      ]),
    ).toEqual({ seen: 1, unknown: 0, learning: 0, known: 2 });
  });
});
