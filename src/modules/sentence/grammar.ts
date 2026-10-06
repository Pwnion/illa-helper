/**
 * Fixed grammar tag set for sentence mode.
 *
 * The model tags each translated sentence with the features it uses, and a
 * sentence is only shown once the learner has unlocked every tag on it. The
 * set is language-generic; the examples are Swedish because that is the
 * default target, and the model is told to use only tags that apply to the
 * target language.
 */

export const GRAMMAR_TAG_IDS = [
  'pres',
  'past',
  'perf',
  'pluperf',
  'fut',
  'cond',
  'imp',
  'modal',
  'pass',
  'deponent',
  'refl',
  'particle',
  'inf',
  'v2',
  'question',
  'subclause',
  'relative',
  'def',
  'dbldef',
  'sgen',
  'comparison',
  'participle',
] as const;

export type GrammarTagId = (typeof GRAMMAR_TAG_IDS)[number];

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
    id: 'pass',
    label: 'Passive',
    definition: 'passive voice (s-passive or bli/vara + participle)',
    example: 'boken skrivs',
  },
  {
    id: 'deponent',
    label: 'Deponent (-s) verbs',
    definition:
      'a verb with passive form but active meaning (e.g. hoppas, finnas)',
    example: 'det finns',
  },
  {
    id: 'refl',
    label: 'Reflexives',
    definition:
      'a reflexive verb or reflexive pronoun/possessive (e.g. sig, sin)',
    example: 'hon sätter sig',
  },
  {
    id: 'particle',
    label: 'Particle verbs',
    definition: 'a particle or phrasal verb (e.g. tycka om, ge upp)',
    example: 'hon tycker om det',
  },
  {
    id: 'inf',
    label: 'Infinitive with marker',
    definition: 'an infinitive with its marker (e.g. att + verb)',
    example: 'att skriva',
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
    definition: 'a question (inverted or with a question word)',
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
    id: 'participle',
    label: 'Participles as adjectives',
    definition: 'a present or past participle used as an adjective',
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
];

const TAG_ID_SET = new Set<string>(GRAMMAR_TAG_IDS);

export function isGrammarTagId(value: unknown): value is GrammarTagId {
  return typeof value === 'string' && TAG_ID_SET.has(value);
}
