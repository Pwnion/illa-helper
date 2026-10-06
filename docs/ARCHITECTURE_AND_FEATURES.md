# Architecture And Features

ILLA Helper is a WXT + Vue 3 browser extension that turns web pages into language learning material. The architecture is organised around user-visible paths: API configuration, word translation, sentence translation, paragraph translation, the pronunciation tooltip and website rules.

## Current Runtime Model

- API configurations only store a protocol family; the families are `openai-compatible` and `gemini`.
- OpenAI and Anthropic are OpenAI-compatible presets in the settings page, not runtime providers.
- A custom Gemini endpoint is a capability of the Gemini family; there is no separate ProxyGemini provider.
- There are no placeholder providers: anything listed in the UI works at runtime.
- OpenAI-compatible HTTP requests are all made from the extension background to avoid mixed-content and CORS divergence.
- Import/export only accepts the current `3.0` format; older formats are not migrated.

## Main Modules

- `entrypoints/options/components/translation/TranslationSettings.vue`: API configuration and translation settings UI.
- `src/modules/shared/ApiConfigHelpers.ts`: API presets, protocol family labels and config sanitising.
- `src/modules/core/storage/StorageService.ts`: reading, writing and validating user settings.
- `src/modules/api/factory/ApiServiceFactory.ts`: creates the translation provider for a protocol family.
- `src/modules/api/providers`: OpenAI-compatible and Gemini adapters.
- `src/modules/content/ContentManager.ts`: content script lifecycle and service wiring.
- `src/modules/content/services/ConfigurationService.ts`: turns user settings into page runtime configuration.
- `src/modules/core/translation/LanguageService.ts`: page language detection and target language resolution.
- `src/modules/core/translation/TextReplacerService.ts`: word translation replacement path.
- `src/modules/core/translation/ParagraphTranslationService.ts`: paragraph translation path.
- `src/modules/sentence/SentenceTranslationService.ts`: sentence translation path (see below).
- `src/modules/options/website-management`: website blacklist and whitelist rules.

## Sentence Translation

Sentence mode replaces whole sentences the learner can read. The model never decides what to show; it produces a level-independent analysis, and code selects against the learner's own vocabulary.

1. **Blocks.** `DomWalker` finds paragraph elements; only the outermost ones are used, since inline elements with text (links) are reported as paragraphs too. Blocks are observed lazily when lazy loading is on.
2. **Segmentation** (`segmentation.ts`). A block's text nodes are flattened into one string with an offset map. Source line breaks become spaces one-for-one and `<br>` becomes a line break, so offsets match the DOM. Code, inputs and editable areas become a placeholder that excludes the sentence. `Intl.Segmenter` splits the string; fragments under three words are dropped.
3. **Cache.** Each sentence's key hashes the prompt version, model, source/target/native languages and the normalised text (`cacheKey.ts`). Hits come from IndexedDB through the background (`store/`).
4. **Analysis** (`prompt.ts`, `parser.ts`, `SentenceAnalyzer.ts`). Misses are packed into batches of whole sentences (`batching.ts`) and sent with bounded concurrency through the shared rate limiter. The response is compact JSON per sentence: `[id, translation, [[surface, lemma, gloss, cefr, flags], ...], [tags]]`. Parsing tolerates fences, prose, truncation and missing or extra ids; a batch that cannot be parsed is retried once as two halves.
5. **Selection** (`selection.ts`). A sentence is eligible when it has at most `maxNewWords` unknown lemmas and every grammar tag is unlocked. A lemma is known if marked known, if it is a proper noun, cognate or number, or if it has never been judged and its CEFR estimate is at or below the cold-start level. An optional page cap limits the share of sentences replaced.
6. **Rendering** (`SentenceRenderer.ts`). Text nodes are split at sentence boundaries and wrapped in hidden spans; a translation span with one span per word is inserted before them, hoisted out of inline elements the sentence fully covers. Splits are recorded and undone newest-first, so restoring leaves the original nodes and markup.
7. **Learning** (`ExposureTracker.ts`, `vocabulary.ts`). A sentence visible for its reading time without being hovered or revealed credits an exposure to each lemma; enough consecutive exposures make a lemma known. Word lookups and sentence reveals mark lemmas as learning and reset their exposures. Events are batched and applied atomically in the background store.

Storage lives in the extension origin: content scripts never open IndexedDB, because a content script's IndexedDB belongs to the visited website.

## Design Notes

Legacy compatibility branches are kept out of the main path. Old configs, old provider names, deprecated interfaces and sample code are not part of the runtime; if user data ever needs preserving, use a one-off migration tool rather than putting compatibility logic back into the business path.