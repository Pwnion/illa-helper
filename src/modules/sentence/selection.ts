/**
 * Decides which analysed sentences to show. Pure code over cached analyses,
 * so results change as the learner's vocabulary does without new model calls.
 */

import type { GrammarTagId } from './grammar';
import type {
  LemmaRecord,
  SentenceAnalysis,
  SentenceModeConfig,
} from './types';

export interface LemmaEntry {
  lemma: string;
  /** Highest CEFR estimate across the lemma's tokens (conservative) */
  cefr: number;
  /** Proper nouns, cognates and numbers never count as new words */
  free: boolean;
}

export interface SentenceEvaluation {
  eligible: boolean;
  /** Lemmas the learner is not considered to know */
  newLemmas: string[];
  /** Grammar tags on the sentence that are still locked */
  blockedTags: GrammarTagId[];
}

export type VocabularyLookup = (lemma: string) => LemmaRecord | undefined;

export function normalizeLemma(lemma: string): string {
  return lemma.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Groups a sentence's tokens by lemma. */
export function lemmaEntries(analysis: SentenceAnalysis): LemmaEntry[] {
  const entries = new Map<string, LemmaEntry>();

  for (const token of analysis.tokens) {
    const lemma = normalizeLemma(token.lemma);
    if (!lemma) continue;
    const free =
      token.proper || token.cognate || /^[\p{N}\p{P}\p{S}]+$/u.test(lemma);
    const existing = entries.get(lemma);
    if (existing) {
      existing.cefr = Math.max(existing.cefr, token.cefr);
      existing.free = existing.free && free;
    } else {
      entries.set(lemma, { lemma, cefr: token.cefr, free });
    }
  }

  return [...entries.values()];
}

/**
 * A lemma is known when it is marked known, when it is a proper noun or
 * cognate, or when it has never been judged and its CEFR estimate is at or
 * below the cold-start level.
 */
export function isLemmaKnown(
  entry: LemmaEntry,
  record: LemmaRecord | undefined,
  coldStartLevel: number,
): boolean {
  if (entry.free) return true;
  if (record?.status === 'known') return true;
  const unjudged = !record || record.status === 'seen';
  return unjudged && entry.cefr <= coldStartLevel;
}

export function evaluateSentence(
  analysis: SentenceAnalysis,
  vocabulary: VocabularyLookup,
  config: Pick<SentenceModeConfig, 'maxNewWords' | 'coldStartLevel'> & {
    unlockedGrammar: readonly GrammarTagId[];
  },
): SentenceEvaluation {
  const newLemmas = lemmaEntries(analysis)
    .filter(
      (entry) =>
        !isLemmaKnown(entry, vocabulary(entry.lemma), config.coldStartLevel),
    )
    .map((entry) => entry.lemma);

  const unlocked = new Set(config.unlockedGrammar);
  const blockedTags = analysis.tags.filter((tag) => !unlocked.has(tag));

  return {
    eligible:
      newLemmas.length <= config.maxNewWords && blockedTags.length === 0,
    newLemmas,
    blockedTags,
  };
}

/** Limits how many of a page's sentences may be replaced. */
export class PageCap {
  private remaining: number;

  constructor(totalSentences: number, fraction: number) {
    this.remaining =
      fraction >= 1
        ? Number.POSITIVE_INFINITY
        : Math.floor(Math.max(0, totalSentences) * Math.max(0, fraction));
  }

  /** Raises the cap when more sentences appear, e.g. from dynamic content. */
  addSentences(count: number, fraction: number): void {
    if (Number.isFinite(this.remaining)) {
      this.remaining += Math.floor(Math.max(0, count) * Math.max(0, fraction));
    }
  }

  tryConsume(): boolean {
    if (this.remaining <= 0) return false;
    this.remaining -= 1;
    return true;
  }
}
