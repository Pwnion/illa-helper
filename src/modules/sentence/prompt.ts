/**
 * Sentence analysis prompt.
 *
 * The model translates numbered sentences and analyses each translation:
 * per-word lemma, gloss, CEFR estimate and flags, plus grammar tags. The
 * analysis is level-independent so it can be cached; selection happens in code.
 *
 * Bump PROMPT_VERSION whenever the prompt or output format changes, so cached
 * analyses from the old prompt are not reused.
 */

import { GRAMMAR_TAGS } from './grammar';

export const PROMPT_VERSION = 3;

export interface PromptLanguages {
  /** Display names, e.g. "English", "Swedish" */
  sourceName: string;
  targetName: string;
  nativeName: string;
  /** Target language code, used to choose the worked example */
  targetCode: string;
}

export interface PromptSentence {
  id: number;
  text: string;
}

const SWEDISH_EXAMPLE = `Example input:
1|I didn't like the film we saw yesterday.
Example output:
[[1,"Jag tyckte inte om filmen vi såg igår.",[["Jag","jag","I",1,0],["tyckte","tycka om","liked",1,0],["inte","inte","not",1,0],["om","tycka om","liked",1,0],["filmen","film","film",1,2],["vi","vi","we",1,0],["såg","se","saw",1,0],["igår","igår","yesterday",1,0]],["past","particle","def","relative"]]]`;

const GENERIC_EXAMPLE = `Example output shape for two sentences (values are placeholders):
[[1,"<translation>",[["<word>","<lemma>","<gloss>",1,0],["<word>","<lemma>","<gloss>",3,2]],["pres"]],[2,"<translation>",[["<Name>","<Name>","<Name>",1,1]],[]]]`;

export function buildAnalysisSystemPrompt(languages: PromptLanguages): string {
  const { sourceName, targetName, nativeName } = languages;
  const tagLines = GRAMMAR_TAGS.map(
    (tag) => `  ${tag.id}: ${tag.definition}`,
  ).join('\n');
  const example = languages.targetCode.toLowerCase().startsWith('sv')
    ? SWEDISH_EXAMPLE
    : GENERIC_EXAMPLE;

  return `You are a precise linguistic analyser for a language-learning tool. The learner's native language is ${nativeName} and they are learning ${targetName}.

You receive numbered ${sourceName} sentences, one per line, as "id|sentence". For each one, write the ${targetName} a native speaker would naturally say, not a word-for-word rendering: change word order, phrasing and idioms freely when ${targetName} says it differently. Then analyse that translation.

Return ONLY a JSON array with one element per input sentence. No prose, no markdown, no code fences.
Element format: [id, "translation", tokens, tags]
- id: the input number.
- translation: the full ${targetName} sentence. Keep names, numbers and URLs as they are.
- tokens: every word of the translation in order, excluding punctuation. Do not skip or merge words. Each token is [surface, lemma, gloss, cefr, flags]:
  - surface: the word exactly as written in the translation.
  - lemma: the dictionary form, lowercase unless it is a proper noun. For particle or phrasal verbs, give every part the full multi-word lemma (e.g. "tycker" and "om" both get "tycka om").
  - gloss: a 1-3 word meaning in ${nativeName}, for this context.
  - cefr: the CEFR level of the lemma as a number, 1=A1, 2=A2, 3=B1, 4=B2, 5=C1, 6=C2.
  - flags: 0 = none, 1 = proper noun, 2 = transparent cognate of the ${sourceName} word (same meaning, nearly identical spelling), 3 = both.
- tags: the grammar features the translation uses, chosen only from this list (use only tags that apply to ${targetName}; [] if none):
${tagLines}

${example}`;
}

export function buildAnalysisUserMessage(
  sentences: readonly PromptSentence[],
): string {
  return sentences.map((s) => `${s.id}|${s.text}`).join('\n');
}

/**
 * Output budget for a batch. Each token costs roughly a dozen output tokens,
 * so the cap scales with the word count.
 */
export function estimateMaxOutputTokens(
  sentences: readonly PromptSentence[],
): number {
  const words = sentences.reduce(
    (sum, s) => sum + s.text.split(/\s+/).filter(Boolean).length,
    0,
  );
  return Math.min(8192, 256 + words * 24);
}
