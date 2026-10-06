import { describe, expect, it } from 'vitest';
import {
  extractTopLevelElements,
  parseAnalysisResponse,
} from '@/src/modules/sentence/parser';

const good = JSON.stringify([
  [
    1,
    'Jag tyckte inte om filmen.',
    [
      ['Jag', 'jag', 'I', 1, 0],
      ['tyckte', 'tycka om', 'liked', 1, 0],
      ['inte', 'inte', 'not', 1, 0],
      ['om', 'tycka om', 'liked', 1, 0],
      ['filmen', 'film', 'film', 1, 2],
    ],
    ['past', 'particle', 'def'],
  ],
  [
    2,
    'Anna bor i Stockholm.',
    [
      ['Anna', 'Anna', 'Anna', 1, 1],
      ['bor', 'bo', 'lives', 2, 0],
      ['i', 'i', 'in', 1, 0],
      ['Stockholm', 'Stockholm', 'Stockholm', 1, 3],
    ],
    ['pres'],
  ],
]);

describe('parseAnalysisResponse', () => {
  it('parses the compact array format', () => {
    const { analyses, error } = parseAnalysisResponse(good, [1, 2]);
    expect(error).toBeUndefined();
    expect(analyses.size).toBe(2);

    const first = analyses.get(1)!;
    expect(first.translation).toBe('Jag tyckte inte om filmen.');
    expect(first.tags).toEqual(['past', 'particle', 'def']);
    expect(first.tokens[1]).toEqual({
      surface: 'tyckte',
      lemma: 'tycka om',
      gloss: 'liked',
      cefr: 1,
      proper: false,
      cognate: false,
    });
    expect(first.tokens[4].cognate).toBe(true);

    const second = analyses.get(2)!;
    expect(second.tokens[0].proper).toBe(true);
    expect(second.tokens[3]).toMatchObject({ proper: true, cognate: true });
  });

  it('strips code fences and surrounding prose', () => {
    const raw = 'Here you go:\n```json\n' + good + '\n```\nHope that helps!';
    expect(parseAnalysisResponse(raw, [1, 2]).analyses.size).toBe(2);
  });

  it('keeps complete elements from truncated output', () => {
    const truncated = good.slice(0, good.indexOf('[2,') + 20);
    const { analyses, error } = parseAnalysisResponse(truncated, [1, 2]);
    expect(error).toBeUndefined();
    expect([...analyses.keys()]).toEqual([1]);
  });

  it('ignores extra ids and tolerates missing ones', () => {
    const { analyses } = parseAnalysisResponse(good, [2, 3]);
    expect([...analyses.keys()]).toEqual([2]);
  });

  it('accepts string ids, CEFR labels, object tokens and object elements', () => {
    const raw = JSON.stringify([
      {
        id: '4',
        translation: 'Hej då.',
        tokens: [
          { surface: 'Hej', lemma: 'hej', gloss: 'bye', cefr: 'A1', flags: 0 },
          ['då', '', 'then', 'B2'],
        ],
        tags: ['PRES', 'not-a-tag'],
      },
    ]);
    const result = parseAnalysisResponse(raw, [4]).analyses.get(4)!;
    expect(result.tokens.map((t) => [t.lemma, t.cefr])).toEqual([
      ['hej', 1],
      ['då', 4],
    ]);
    expect(result.tags).toEqual(['pres']);
  });

  it('treats an unknown CEFR level as C2 and drops punctuation tokens', () => {
    const raw = JSON.stringify([
      [
        1,
        'Ja!',
        [
          ['Ja', 'ja', 'yes', null, 0],
          ['!', '!', '', 1, 0],
        ],
        [],
      ],
    ]);
    const result = parseAnalysisResponse(raw, [1]).analyses.get(1)!;
    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0].cefr).toBe(6);
  });

  it('accepts a single unwrapped element', () => {
    const raw = JSON.stringify([
      7,
      'Det regnar idag.',
      [['Det', 'det', 'it', 1, 0]],
      ['pres'],
    ]);
    expect(parseAnalysisResponse(raw, [7]).analyses.has(7)).toBe(true);
  });

  it('reports an error when nothing usable is present', () => {
    expect(
      parseAnalysisResponse('Sorry, I cannot help.', [1]).error,
    ).toBeTruthy();
    expect(parseAnalysisResponse('', [1]).error).toBe('Empty response');
    expect(parseAnalysisResponse('[[1, "", []]]', [1]).error).toBeTruthy();
  });
});

describe('extractTopLevelElements', () => {
  it('handles brackets inside strings while scanning', () => {
    const raw = '[[1, "a ] tricky [ string", [], []], [2, "ok", [], []';
    expect(extractTopLevelElements(raw)).toEqual([
      [1, 'a ] tricky [ string', [], []],
    ]);
  });
});
