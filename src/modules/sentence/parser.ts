/**
 * Parses and validates the model's sentence analysis output.
 *
 * Tolerates code fences, prose around the array, missing or extra ids and
 * output truncated mid-array: each complete top-level element is parsed on its
 * own, so a cut-off final element only loses that sentence.
 */

import { isGrammarTagId, type GrammarTagId } from './grammar';
import type { AnalysedToken, SentenceAnalysis } from './types';

export interface ParseResult {
  analyses: Map<number, SentenceAnalysis>;
  /** Set when nothing usable could be parsed */
  error?: string;
}

const CEFR_LABELS: Record<string, number> = {
  A1: 1,
  A2: 2,
  B1: 3,
  B2: 4,
  C1: 5,
  C2: 6,
};

export function parseAnalysisResponse(
  raw: string,
  expectedIds: readonly number[],
): ParseResult {
  const analyses = new Map<number, SentenceAnalysis>();
  const expected = new Set(expectedIds);
  const text = stripCodeFences(raw ?? '');

  for (const element of extractTopLevelElements(text)) {
    const parsed = toAnalysis(element);
    if (!parsed) continue;
    const [id, analysis] = parsed;
    if (expected.has(id) && !analyses.has(id)) {
      analyses.set(id, analysis);
    }
  }

  if (analyses.size === 0) {
    return {
      analyses,
      error: text.trim()
        ? 'No valid sentence analyses in the response'
        : 'Empty response',
    };
  }
  return { analyses };
}

export function stripCodeFences(text: string): string {
  return text.replace(/```[a-zA-Z]*\s*/g, '').replace(/```/g, '');
}

/**
 * Returns each complete element of the outermost JSON array, parsed. Falls
 * back to scanning when the array as a whole is invalid or truncated.
 */
export function extractTopLevelElements(text: string): unknown[] {
  const start = text.indexOf('[');
  if (start === -1) return [];

  const whole = tryParse(text.slice(start, text.lastIndexOf(']') + 1));
  if (Array.isArray(whole)) {
    // A single sentence may come back unwrapped: [1, "...", [...], [...]]
    return typeof whole[0] === 'number' || typeof whole[0] === 'string'
      ? [whole]
      : whole;
  }

  const elements: unknown[] = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let elementStart = -1;

  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === '[' || char === '{') {
      depth += 1;
      if (depth === 2) elementStart = i;
    } else if (char === ']' || char === '}') {
      if (depth === 2 && elementStart !== -1) {
        const value = tryParse(text.slice(elementStart, i + 1));
        if (value !== undefined) elements.push(value);
        elementStart = -1;
      }
      depth -= 1;
      if (depth <= 0) break;
    }
  }

  return elements;
}

function toAnalysis(element: unknown): [number, SentenceAnalysis] | null {
  let id: unknown;
  let translation: unknown;
  let tokens: unknown;
  let tags: unknown;

  if (Array.isArray(element)) {
    [id, translation, tokens, tags] = element;
  } else if (element && typeof element === 'object') {
    const record = element as Record<string, unknown>;
    id = record.id;
    translation = record.translation ?? record.t;
    tokens = record.tokens ?? record.k;
    tags = record.tags ?? record.g;
  } else {
    return null;
  }

  const numericId = typeof id === 'string' ? Number(id) : id;
  if (typeof numericId !== 'number' || !Number.isInteger(numericId)) {
    return null;
  }
  if (typeof translation !== 'string' || !translation.trim()) return null;
  if (!Array.isArray(tokens)) return null;

  const parsedTokens = tokens
    .map(toToken)
    .filter((token): token is AnalysedToken => token !== null);
  if (parsedTokens.length === 0) return null;

  return [
    numericId,
    {
      translation: translation.trim(),
      tokens: parsedTokens,
      tags: toTags(tags),
    },
  ];
}

function toToken(raw: unknown): AnalysedToken | null {
  let surface: unknown;
  let lemma: unknown;
  let gloss: unknown;
  let cefr: unknown;
  let flags: unknown;

  if (Array.isArray(raw)) {
    [surface, lemma, gloss, cefr, flags] = raw;
  } else if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>;
    ({ surface, lemma, gloss, cefr, flags } = record);
  } else {
    return null;
  }

  if (typeof surface !== 'string' || !surface.trim()) return null;
  const cleanSurface = surface.trim();
  if (!/[\p{L}\p{N}]/u.test(cleanSurface)) return null;

  const flagBits = typeof flags === 'number' ? flags : Number(flags) || 0;

  return {
    surface: cleanSurface,
    lemma:
      typeof lemma === 'string' && lemma.trim()
        ? lemma.trim()
        : cleanSurface.toLowerCase(),
    gloss: typeof gloss === 'string' ? gloss.trim() : '',
    cefr: toCefr(cefr),
    proper: (flagBits & 1) === 1,
    cognate: (flagBits & 2) === 2,
  };
}

/** Unknown levels default to C2 so a bad estimate never hides a hard word. */
function toCefr(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.min(6, Math.max(1, Math.round(value)));
  }
  if (typeof value === 'string') {
    const label = CEFR_LABELS[value.trim().toUpperCase()];
    if (label) return label;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return toCefr(numeric);
  }
  return 6;
}

function toTags(raw: unknown): GrammarTagId[] {
  if (!Array.isArray(raw)) return [];
  const tags = raw
    .map((tag) => (typeof tag === 'string' ? tag.trim().toLowerCase() : tag))
    .filter(isGrammarTagId);
  return [...new Set(tags)];
}

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
