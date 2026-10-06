/**
 * Request shaping for OpenAI's reasoning models.
 *
 * On Chat Completions, GPT-5 and later and the o-series reject max_tokens
 * (they take max_completion_tokens) and may reject non-default temperatures.
 * Reasoning tokens also count against the output cap, so a cap sized for the
 * visible answer needs headroom unless reasoning is off.
 */

const OPENAI_HOST = 'api.openai.com';
const REASONING_MODEL = /^(?:o\d|gpt-(?:[5-9]|\d{2,}))/;

// Extra output tokens to allow for reasoning, by reasoning_effort.
// null means no cap: high efforts can think for tens of thousands of tokens.
const REASONING_HEADROOM: Record<string, number | null> = {
  none: 0,
  low: 4096,
  medium: 16384,
  high: null,
  xhigh: null,
  max: null,
};

// The API default when reasoning_effort is not sent
const DEFAULT_EFFORT = 'medium';

export function isOpenAIReasoningModel(
  endpoint: string | undefined,
  model: unknown,
): boolean {
  if (typeof model !== 'string' || !endpoint) {
    return false;
  }
  try {
    if (new URL(endpoint).hostname !== OPENAI_HOST) {
      return false;
    }
  } catch {
    return false;
  }
  return REASONING_MODEL.test(model);
}

export function adaptForOpenAIReasoningModel(
  requestBody: Record<string, any>,
  endpoint: string | undefined,
): Record<string, any> {
  if (!isOpenAIReasoningModel(endpoint, requestBody.model)) {
    return requestBody;
  }

  const adapted: Record<string, any> = { ...requestBody };
  delete adapted.temperature;

  const cap = adapted.max_tokens;
  delete adapted.max_tokens;
  if (typeof cap === 'number' && adapted.max_completion_tokens == null) {
    const effort =
      typeof adapted.reasoning_effort === 'string'
        ? adapted.reasoning_effort
        : DEFAULT_EFFORT;
    const headroom =
      effort in REASONING_HEADROOM
        ? REASONING_HEADROOM[effort]
        : REASONING_HEADROOM[DEFAULT_EFFORT];
    if (headroom !== null) {
      adapted.max_completion_tokens = cap + headroom;
    }
  }

  return adapted;
}
