import type {
  AnalysedToken,
  SentenceAnalysis,
} from '@/src/modules/sentence/types';
import type { GrammarTagId } from '@/src/modules/sentence/grammar';

/** Builds a token: [surface, lemma, cefr] plus optional flags. */
export function token(
  surface: string,
  lemma = surface.toLowerCase(),
  cefr = 1,
  extra: Partial<AnalysedToken> = {},
): AnalysedToken {
  return {
    surface,
    lemma,
    gloss: `${lemma}-gloss`,
    cefr,
    proper: false,
    cognate: false,
    ...extra,
  };
}

export function analysis(
  translation: string,
  tokens: AnalysedToken[],
  tags: GrammarTagId[] = ['pres'],
): SentenceAnalysis {
  return { translation, tokens, tags };
}

export function setBody(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body;
}
