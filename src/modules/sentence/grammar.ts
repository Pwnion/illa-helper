/**
 * Fixed grammar tag set for sentence mode.
 *
 * The model tags each translated sentence with the features it uses, and a
 * sentence is only shown once the learner has unlocked every tag on it. The
 * set is language-generic; the examples are Swedish because that is the
 * default target, and the model is told to use only tags that apply to the
 * target language.
 *
 * Changing the set means bumping GRAMMAR_TAG_SET_VERSION (with a migration
 * in config.ts if tags are split) and PROMPT_VERSION, so cached analyses are
 * re-tagged.
 */

export const GRAMMAR_TAG_IDS = [
  // Verbs
  'pres',
  'past',
  'perf',
  'pluperf',
  'fut',
  'cond',
  'imp',
  'modal',
  'inf',
  'pass',
  'blipass',
  'deponent',
  'refl',
  'particle',
  'prespart',
  // Word order and sentence structure
  'v2',
  'question',
  'subclause',
  'relative',
  'indirectq',
  'formalsubj',
  'cleft',
  // Nouns, adjectives and adverbs
  'def',
  'dbldef',
  'adjagr',
  'poss',
  'reflposs',
  'sgen',
  'comparison',
  'adverb',
  'participle',
] as const;

export type GrammarTagId = (typeof GRAMMAR_TAG_IDS)[number];

/** Bump when tags are added, removed or split */
export const GRAMMAR_TAG_SET_VERSION = 2;

export interface GrammarTagDefinition {
  id: GrammarTagId;
  label: string;
  /** Sent to the model, so it must be unambiguous */
  definition: string;
  example: string;
}

export const GRAMMAR_TAGS: readonly GrammarTagDefinition[] = [
  {
    id: 'pres',
    label: 'Present tense',
    definition: 'a finite verb in the present tense',
    example: 'hon skriver',
  },
  {
    id: 'past',
    label: 'Past tense',
    definition: 'a finite verb in the simple past (preterite)',
    example: 'hon skrev',
  },
  {
    id: 'perf',
    label: 'Perfect',
    definition: 'present perfect: have + supine/past participle',
    example: 'hon har skrivit',
  },
  {
    id: 'pluperf',
    label: 'Pluperfect',
    definition: 'past perfect: had + supine/past participle',
    example: 'hon hade skrivit',
  },
  {
    id: 'fut',
    label: 'Future',
    definition: 'future with an auxiliary (e.g. ska, kommer att, will)',
    example: 'hon ska skriva',
  },
  {
    id: 'cond',
    label: 'Conditional',
    definition: 'conditional or hypothetical (e.g. skulle, would)',
    example: 'hon skulle skriva',
  },
  {
    id: 'imp',
    label: 'Imperative',
    definition: 'a verb in the imperative',
    example: 'skriv!',
  },
  {
    id: 'modal',
    label: 'Modal verbs',
    definition: 'a modal verb + infinitive (e.g. kan, vill, måste, får, bör)',
    example: 'hon kan skriva',
  },
  {
    id: 'inf',
    label: 'Infinitive with marker',
    definition: 'an infinitive with its marker (e.g. att + verb)',
    example: 'att skriva',
  },
  {
    id: 'pass',
    label: 'Passive (-s)',
    definition:
      'passive voice formed with the -s ending (not deponent verbs, which have active meaning)',
    example: 'boken skrivs',
  },
  {
    id: 'blipass',
    label: 'Passive (bli/vara)',
    definition:
      'passive formed with bli or vara + past participle (e.g. blev skriven, är stängd)',
    example: 'boken blev skriven',
  },
  {
    id: 'deponent',
    label: 'Deponent (-s) verbs',
    definition:
      'a verb with passive form but active or reciprocal meaning (e.g. hoppas, finnas, ses)',
    example: 'det finns',
  },
  {
    id: 'refl',
    label: 'Reflexive verbs',
    definition:
      'a reflexive verb or reflexive object pronoun (e.g. sig, mig, dig as in sätta sig, känna sig); not sin/sitt/sina',
    example: 'hon sätter sig',
  },
  {
    id: 'particle',
    label: 'Particle verbs',
    definition: 'a particle or phrasal verb (e.g. tycka om, ge upp)',
    example: 'hon tycker om det',
  },
  {
    id: 'prespart',
    label: 'Present participles (-ande)',
    definition:
      'a present participle ending in -ande/-ende, used as an adjective, adverb or noun',
    example: 'en leende flicka',
  },
  {
    id: 'v2',
    label: 'Verb-second inversion',
    definition:
      'verb-second word order with the subject after the verb because another element comes first',
    example: 'idag skriver hon',
  },
  {
    id: 'question',
    label: 'Question word order',
    definition: 'a direct question (inverted or with a question word)',
    example: 'skriver hon?',
  },
  {
    id: 'subclause',
    label: 'Subordinate clause order',
    definition:
      'a subordinate clause with its own word order (e.g. adverb before the finite verb)',
    example: 'att hon inte skriver',
  },
  {
    id: 'relative',
    label: 'Relative clauses',
    definition: 'a relative clause (e.g. som, with or without the pronoun)',
    example: 'boken som hon skrev',
  },
  {
    id: 'indirectq',
    label: 'Indirect questions',
    definition:
      'an indirect question inside a sentence, introduced by om (whether) or a question word',
    example: 'jag undrar om hon kommer',
  },
  {
    id: 'formalsubj',
    label: 'Dummy subject det',
    definition:
      'det as an empty subject with no real referent (weather, time, det finns, or a subject moved later: det är svårt att …); not cleft sentences',
    example: 'det regnar',
  },
  {
    id: 'cleft',
    label: 'Cleft sentences',
    definition:
      'a cleft sentence that highlights one part: det är/var + X + som/där + clause',
    example: 'det var Anna som ringde',
  },
  {
    id: 'def',
    label: 'Definite suffix',
    definition: 'a noun with a definite suffix (e.g. -en, -et, -na)',
    example: 'boken',
  },
  {
    id: 'dbldef',
    label: 'Double definiteness',
    definition: 'a definite article plus adjective plus definite noun',
    example: 'den stora boken',
  },
  {
    id: 'adjagr',
    label: 'Adjective agreement',
    definition:
      'an adjective agreeing with an indefinite noun or as a predicate: base form for en-words, -t for ett-words, -a in the plural (e.g. en stor bil, ett stort hus, huset är stort); not after a definite article or possessive',
    example: 'ett stort hus',
  },
  {
    id: 'poss',
    label: 'Possessive pronouns',
    definition:
      'a possessive pronoun other than sin/sitt/sina (e.g. min/mitt/mina, din, vår, hans, hennes, deras)',
    example: 'mitt hus',
  },
  {
    id: 'reflposs',
    label: 'Reflexive possessive (sin)',
    definition:
      'the reflexive possessive sin/sitt/sina, referring back to a third-person subject',
    example: 'han tog sin bil',
  },
  {
    id: 'sgen',
    label: 's-genitive',
    definition: 'a possessive -s genitive',
    example: 'Annas bok',
  },
  {
    id: 'comparison',
    label: 'Comparatives and superlatives',
    definition: 'a comparative or superlative adjective or adverb',
    example: 'större, störst',
  },
  {
    id: 'adverb',
    label: 'Adverbs in -t',
    definition:
      'an adverb formed from an adjective with -t (e.g. snabbt, tydligt)',
    example: 'hon springer snabbt',
  },
  {
    id: 'participle',
    label: 'Past participles as adjectives',
    definition:
      'a past participle used as an adjective before a noun (e.g. en skriven bok, de stängda dörrarna); after bli/vara it is a passive',
    example: 'en skriven bok',
  },
];

/** Tags a beginner can handle; everything else starts locked. */
export const BEGINNER_GRAMMAR: readonly GrammarTagId[] = [
  'pres',
  'imp',
  'modal',
  'inf',
  'def',
  'question',
  'v2',
  'formalsubj',
  'adjagr',
  'poss',
  'adverb',
];

/**
 * Tags split out of a version-1 tag. Unlocking the old tag covered both
 * halves, so migrated settings unlock the new half too.
 */
export const SPLIT_FROM_V1: Readonly<
  Partial<Record<GrammarTagId, GrammarTagId>>
> = {
  refl: 'reflposs',
  pass: 'blipass',
  participle: 'prespart',
};

/** Version-2 tags for features beginners meet first; migrated settings get them unlocked. */
export const BEGINNER_ADDED_IN_V2: readonly GrammarTagId[] = [
  'formalsubj',
  'adjagr',
  'poss',
  'adverb',
];

const TAG_ID_SET = new Set<string>(GRAMMAR_TAG_IDS);

export function isGrammarTagId(value: unknown): value is GrammarTagId {
  return typeof value === 'string' && TAG_ID_SET.has(value);
}
