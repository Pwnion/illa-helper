/**
 * Sentence mode types.
 */

import type { GrammarTagId } from './grammar';

/** One word of a translated sentence, as analysed by the model. */
export interface AnalysedToken {
  /** The word exactly as it appears in the translation */
  surface: string;
  /** Dictionary form; particle verbs share a multi-word lemma such as "tycka om" */
  lemma: string;
  /** Short meaning in the learner's native language */
  gloss: string;
  /** Estimated CEFR level of the lemma, 1 (A1) to 6 (C2) */
  cefr: number;
  proper: boolean;
  /** Transparent cognate of the source word (same meaning, near-identical form) */
  cognate: boolean;
}

/**
 * Level-independent analysis of one sentence. It is cached and re-evaluated
 * against the learner's current vocabulary, so it must not encode a level.
 */
export interface SentenceAnalysis {
  translation: string;
  tokens: AnalysedToken[];
  tags: GrammarTagId[];
}

/**
 * - seen: tracked through exposures but never judged; cold-start rules apply
 * - unknown: explicitly marked unknown by the learner
 * - learning: looked up or revealed; counts as a new word
 * - known: marked known, or reached the exposure threshold
 */
export type LemmaStatus = 'seen' | 'unknown' | 'learning' | 'known';

export const LEMMA_STATUSES: readonly LemmaStatus[] = [
  'seen',
  'unknown',
  'learning',
  'known',
];

export interface LemmaRecord {
  lang: string;
  lemma: string;
  status: LemmaStatus;
  exposures: number;
  lookups: number;
  lastSeen: number;
}

export type VocabOpKind =
  | 'exposure'
  | 'lookup'
  | 'reveal'
  | 'reset-exposure'
  | 'mark-known'
  | 'mark-unknown';

export interface VocabOp {
  lemma: string;
  kind: VocabOpKind;
  at: number;
}

export interface SentenceModeConfig {
  /** Maximum lemmas a sentence may contain that the learner does not know */
  maxNewWords: number;
  /** Unseen lemmas at or below this CEFR level (1-6) count as known */
  coldStartLevel: number;
  /** A sentence is only shown when every grammar tag on it is unlocked */
  unlockedGrammar: GrammarTagId[];
  /** Fraction of a page's sentences that may be replaced; 1 means no cap */
  pageCap: number;
  /** Reading time credited per word before a view counts as an exposure */
  dwellMsPerWord: number;
  minDwellMs: number;
  /** Exposures without a lookup before a lemma becomes known */
  exposuresToKnow: number;
  /** Source characters packed into one model request */
  batchChars: number;
}
