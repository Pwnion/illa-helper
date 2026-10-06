import { describe, expect, it, vi } from 'vitest';
import {
  SentenceAnalyzer,
  type ModelCaller,
} from '@/src/modules/sentence/SentenceAnalyzer';

const languages = {
  sourceName: 'English',
  targetName: 'Swedish',
  nativeName: 'English',
  targetCode: 'sv',
};

/** Answers with a valid analysis for every id in the user message. */
function answer(userMessage: string): string {
  const ids = userMessage.split('\n').map((line) => Number(line.split('|')[0]));
  return JSON.stringify(
    ids.map((id) => [
      id,
      `Mening ${id}.`,
      [['Mening', 'mening', 'sentence', 1, 0]],
      ['pres'],
    ]),
  );
}

const sentences = [1, 2, 3, 4].map((id) => ({
  id,
  text: `Sentence number ${id}.`,
}));

describe('SentenceAnalyzer', () => {
  it('analyses a batch in one request', async () => {
    const callModel = vi.fn<ModelCaller>(async ({ userMessage }) => ({
      success: true,
      content: answer(userMessage),
    }));
    const result = await new SentenceAnalyzer(callModel).analyze(
      sentences,
      languages,
    );

    expect(callModel).toHaveBeenCalledTimes(1);
    expect([...result.keys()]).toEqual([1, 2, 3, 4]);
    expect(callModel.mock.calls[0][0].systemPrompt).toContain(
      'learning Swedish',
    );
  });

  it('retries once with smaller batches after a parse failure', async () => {
    const callModel = vi.fn<ModelCaller>(async ({ userMessage }) =>
      userMessage.split('\n').length === 4
        ? { success: true, content: 'not json at all' }
        : { success: true, content: answer(userMessage) },
    );
    const result = await new SentenceAnalyzer(callModel).analyze(
      sentences,
      languages,
    );

    expect(callModel).toHaveBeenCalledTimes(3);
    expect([...result.keys()].sort()).toEqual([1, 2, 3, 4]);
  });

  it('skips sentences when the retry also fails', async () => {
    const callModel = vi.fn<ModelCaller>(async () => ({
      success: true,
      content: '???',
    }));
    const result = await new SentenceAnalyzer(callModel).analyze(
      sentences,
      languages,
    );
    expect(result.size).toBe(0);
    expect(callModel).toHaveBeenCalledTimes(3);
  });

  it('does not retry failed requests', async () => {
    const callModel = vi.fn<ModelCaller>(async () => ({
      success: false,
      content: '',
      error: '401',
    }));
    expect(
      (await new SentenceAnalyzer(callModel).analyze(sentences, languages))
        .size,
    ).toBe(0);
    expect(callModel).toHaveBeenCalledTimes(1);
  });

  it('tolerates missing ids without retrying', async () => {
    const callModel = vi.fn<ModelCaller>(async () => ({
      success: true,
      content: answer('2|x\n4|y'),
    }));
    const result = await new SentenceAnalyzer(callModel).analyze(
      sentences,
      languages,
    );
    expect([...result.keys()]).toEqual([2, 4]);
    expect(callModel).toHaveBeenCalledTimes(1);
  });
});
