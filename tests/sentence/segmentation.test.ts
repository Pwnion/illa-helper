import { describe, expect, it } from 'vitest';
import {
  GAP,
  countWords,
  flattenBlock,
  normalizeWhitespace,
  piecesForRange,
  splitSentences,
} from '@/src/modules/sentence/segmentation';
import { setBody } from './fixtures';

describe('flattenBlock', () => {
  it('maps text across inline elements to their text nodes', () => {
    setBody(
      '<p id="p">Read the <a href="#">full <b>guide</b></a> today. It helps.</p>',
    );
    const block = document.getElementById('p')!;
    const flat = flattenBlock(block);

    expect(flat.text).toBe('Read the full guide today. It helps.');
    expect(flat.spans.map((s) => s.node.data)).toEqual([
      'Read the ',
      'full ',
      'guide',
      ' today. It helps.',
    ]);
    expect(flat.spans.map((s) => [s.start, s.end])).toEqual([
      [0, 9],
      [9, 14],
      [14, 19],
      [19, 36],
    ]);
  });

  it('marks untranslatable inline content with a gap and skips hidden text', () => {
    setBody(
      '<p id="p">Run <code>npm test</code> now.<span hidden>secret</span> <span style="display:none">gone</span>Done here today.</p>',
    );
    const flat = flattenBlock(document.getElementById('p')!);
    expect(flat.text).toBe(`Run ${GAP} now. Done here today.`);
  });

  it('ignores media and extension UI, and turns <br> into a line break', () => {
    setBody(
      '<p id="p">One two three<img src="x.png"><br>four five six<span class="illa-st">nej</span></p>',
    );
    expect(flattenBlock(document.getElementById('p')!).text).toBe(
      'One two three\nfour five six',
    );
  });

  it('keeps wrapped originals even though they are hidden', () => {
    setBody(
      '<p id="p"><span class="illa-so" style="display:none">Hidden but page text.</span></p>',
    );
    expect(flattenBlock(document.getElementById('p')!).text).toBe(
      'Hidden but page text.',
    );
  });
});

describe('splitSentences', () => {
  it('splits with Intl.Segmenter, trims, and drops fragments under three words', () => {
    const text = '  The cat sat down. Yes! Then it slept all day.  ';
    const slices = splitSentences(text, 'en');

    expect(slices.map((s) => s.text)).toEqual([
      'The cat sat down.',
      'Then it slept all day.',
    ]);
    for (const slice of slices) {
      expect(text.slice(slice.start, slice.end)).toBe(slice.text);
    }
  });

  it('drops sentences containing untranslatable content', () => {
    const slices = splitSentences(
      `Run ${GAP} before you push. Then open a pull request.`,
      'en',
    );
    expect(slices.map((s) => s.text)).toEqual(['Then open a pull request.']);
  });

  it('does not break sentences at source line breaks inside text nodes', () => {
    setBody('<p id="p">\n  The  quick brown\n  fox jumps.\n</p>');
    const flat = flattenBlock(document.getElementById('p')!);
    const [slice, ...rest] = splitSentences(flat.text, 'en');

    expect(rest).toEqual([]);
    expect(slice.text).toBe('The quick brown fox jumps.');
    expect(flat.text.length).toBe(flat.spans[0].node.data.length);
  });

  it('treats a line break as a sentence boundary', () => {
    const slices = splitSentences('First line here\nSecond line here', 'en');
    expect(slices.map((s) => s.text)).toEqual([
      'First line here',
      'Second line here',
    ]);
  });

  it('skips text without letters', () => {
    expect(splitSentences('12 34 56 78.', 'en')).toEqual([]);
  });
});

describe('piecesForRange', () => {
  it('returns the node pieces a sentence covers', () => {
    setBody(
      '<p id="p">Read the <a href="#">full <b>guide</b></a> today. It helps.</p>',
    );
    const flat = flattenBlock(document.getElementById('p')!);
    const [first] = splitSentences(flat.text, 'en');
    const pieces = piecesForRange(flat.spans, first.start, first.end);

    expect(pieces.map((p) => p.node.data.slice(p.from, p.to))).toEqual([
      'Read the ',
      'full ',
      'guide',
      ' today.',
    ]);
  });
});

describe('helpers', () => {
  it('counts words and normalises whitespace', () => {
    expect(countWords('Hello, big world!', 'en')).toBe(3);
    expect(normalizeWhitespace('  a \n b  ')).toBe('a b');
  });
});
