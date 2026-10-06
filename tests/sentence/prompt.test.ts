import { describe, expect, it } from 'vitest';
import {
  buildAnalysisSystemPrompt,
  buildAnalysisUserMessage,
  estimateMaxOutputTokens,
} from '@/src/modules/sentence/prompt';
import { GRAMMAR_TAGS } from '@/src/modules/sentence/grammar';

const languages = {
  sourceName: 'English',
  targetName: 'Swedish',
  nativeName: 'English',
  targetCode: 'sv',
};

describe('analysis prompt', () => {
  it('lists every grammar tag and uses the Swedish example for Swedish', () => {
    const prompt = buildAnalysisSystemPrompt(languages);
    for (const tag of GRAMMAR_TAGS) expect(prompt).toContain(`${tag.id}: `);
    expect(prompt).toContain('tycka om');
    expect(prompt).toContain('learning Swedish');
  });

  it('uses a neutral example for other target languages', () => {
    const prompt = buildAnalysisSystemPrompt({
      ...languages,
      targetName: 'German',
      targetCode: 'de',
    });
    expect(prompt).not.toContain('Jag tyckte');
    expect(prompt).toContain('<translation>');
  });

  it('numbers sentences one per line', () => {
    expect(
      buildAnalysisUserMessage([
        { id: 1, text: 'One two three.' },
        { id: 2, text: 'Four | five six.' },
      ]),
    ).toBe('1|One two three.\n2|Four | five six.');
  });

  it('scales the output budget with word count and caps it', () => {
    expect(
      estimateMaxOutputTokens([{ id: 1, text: 'one two three four' }]),
    ).toBe(256 + 4 * 24);
    expect(estimateMaxOutputTokens([{ id: 1, text: 'w '.repeat(5000) }])).toBe(
      8192,
    );
  });
});
