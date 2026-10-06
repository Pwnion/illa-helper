import { describe, expect, it } from 'vitest';
import {
  adaptForOpenAIReasoningModel,
  isOpenAIReasoningModel,
} from '@/src/modules/api/utils/openaiReasoning';

const OPENAI = 'https://api.openai.com/v1/chat/completions';

describe('isOpenAIReasoningModel', () => {
  it('matches GPT-5 and later and the o-series on OpenAI only', () => {
    expect(isOpenAIReasoningModel(OPENAI, 'gpt-6-luna')).toBe(true);
    expect(isOpenAIReasoningModel(OPENAI, 'gpt-5-mini')).toBe(true);
    expect(isOpenAIReasoningModel(OPENAI, 'o4-mini')).toBe(true);
    expect(isOpenAIReasoningModel(OPENAI, 'gpt-4o-mini')).toBe(false);
    expect(isOpenAIReasoningModel(OPENAI, 'gpt-4.1')).toBe(false);
    expect(
      isOpenAIReasoningModel(
        'https://openrouter.ai/api/v1/chat/completions',
        'gpt-6-luna',
      ),
    ).toBe(false);
    expect(isOpenAIReasoningModel('not a url', 'gpt-6-luna')).toBe(false);
  });
});

describe('adaptForOpenAIReasoningModel', () => {
  const base = { model: 'gpt-6-luna', messages: [], temperature: 0.7 };

  it('drops temperature and renames the cap with no headroom at effort none', () => {
    const body = { ...base, max_tokens: 1000, reasoning_effort: 'none' };
    expect(adaptForOpenAIReasoningModel(body, OPENAI)).toEqual({
      model: 'gpt-6-luna',
      messages: [],
      reasoning_effort: 'none',
      max_completion_tokens: 1000,
    });
  });

  it('adds reasoning headroom for low and the API default (medium)', () => {
    const low = adaptForOpenAIReasoningModel(
      { ...base, max_tokens: 1000, reasoning_effort: 'low' },
      OPENAI,
    );
    const unset = adaptForOpenAIReasoningModel(
      { ...base, max_tokens: 1000 },
      OPENAI,
    );
    expect(low.max_completion_tokens).toBe(1000 + 4096);
    expect(unset.max_completion_tokens).toBe(1000 + 16384);
  });

  it('removes the cap at high effort and keeps an explicit max_completion_tokens', () => {
    const high = adaptForOpenAIReasoningModel(
      { ...base, max_tokens: 1000, reasoning_effort: 'high' },
      OPENAI,
    );
    expect(high).not.toHaveProperty('max_tokens');
    expect(high).not.toHaveProperty('max_completion_tokens');

    const explicit = adaptForOpenAIReasoningModel(
      { ...base, max_tokens: 1000, max_completion_tokens: 50 },
      OPENAI,
    );
    expect(explicit.max_completion_tokens).toBe(50);
  });

  it('leaves other models and endpoints untouched', () => {
    const body = { ...base, model: 'gpt-4o-mini', max_tokens: 10 };
    expect(adaptForOpenAIReasoningModel(body, OPENAI)).toBe(body);
    const local = { ...base, max_tokens: 10 };
    expect(
      adaptForOpenAIReasoningModel(
        local,
        'http://localhost:11434/v1/chat/completions',
      ),
    ).toBe(local);
  });
});
