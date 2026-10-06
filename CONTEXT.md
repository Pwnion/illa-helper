# ILLA Helper

A browser extension that turns web pages into language learning input without breaking normal browsing. The core concepts here are not the underlying service classes but the learning paths and configuration objects users actually see and rely on.

## Language

**User settings**:
The extension's only persisted configuration object. It defines translation, pronunciation, website rules and API behaviour, and is the single source of truth for runtime configuration.
_Avoid_: partial settings, temporary config, legacy config

**API configuration**:
A switchable service connection in the user settings, made up of a protocol family, endpoint, model and request parameters. It is the user-level definition of how the extension calls an external LLM.
_Avoid_: channel, node, platform config

**Custom provider**:
A user-configured OpenAI-compatible endpoint, not a placeholder for arbitrary protocols. Users fill in the endpoint and model, but requests always go through the OpenAI-compatible path.
_Avoid_: arbitrary custom protocol, catch-all provider, reserved extension point

**OpenAI-compatible preset**:
A provider shortcut shown to users, such as OpenAI or Anthropic. Presets only supply a default endpoint and model; they are not separate runtime protocol types.
_Avoid_: separate provider protocol, runtime branch type

**Protocol family**:
The provider type boundary recognised by storage and the runtime, which decides how requests are adapted. Only a few explicit types exist: `openai-compatible` and `gemini`.
_Avoid_: brand-name provider, UI preset name, marketing name

**Provider adapter layer**:
The boundary that turns a unified API configuration and translation intent into each provider's actual request format. It handles the differences between OpenAI-compatible endpoints and Gemini, but owns neither user configuration nor UI logic.
_Avoid_: config model, settings page logic, storage structure

**Gemini gateway mode**:
A variant of the Gemini provider that reaches Gemini through a custom endpoint or proxy gateway. It is an internal difference of the Gemini adapter, not a separate user-level provider.
_Avoid_: ProxyGemini provider, separate provider

**Fake support**:
A state where the UI, copy or configuration claims a provider is supported but the runtime has no adapter or clear working path for it. It must be resolved into real support or explicit removal, not left to create false expectations.
_Avoid_: reserved option, leave it for now, half-supported

**Background API request**:
Every OpenAI-compatible HTTP request is made from the extension background, avoiding mixed content when HTTPS pages call HTTP endpoints and removing the CORS split in content scripts.
_Avoid_: useBackgroundProxy toggle, direct API calls from content scripts

**Word translation**:
A translation mode that replaces or inserts target-language words in the page text at a set ratio. It keeps the page structure and uses words or phrases as the smallest learning unit.
_Avoid_: full translation, paragraph translation

**Sentence translation**:
A translation mode that replaces whole sentences in place, but only sentences the learner can read: at most a set number of unknown words and only unlocked grammar. The model analyses each sentence once (translation, per-word lemma, gloss, CEFR estimate, grammar tags); selection against the learner's vocabulary happens in code, so cached analyses stay valid as the learner improves.
_Avoid_: sentence-level paragraph mode, full translation

**Sentence analysis**:
The model's level-independent output for one sentence: the translation, its tokens and its grammar tags. It is cached by prompt version, model, language pair and sentence text, and must never encode the learner's level.
_Avoid_: selected sentence, model decision

**Known words**:
The learner's per-lemma record for a target language: status (seen, unknown, learning, known), exposures, lookups and when it was last seen. Exposures come from reading a replaced sentence unaided; lookups and reveals reset them.
_Avoid_: vocabulary list, word bank

**Cold-start level**:
The CEFR level at or below which lemmas the learner has never judged are assumed known. It only applies until the learner's own record exists with a judgement.
_Avoid_: user level (that is word mode's selection hint)

**Unlocked grammar**:
The grammar features, from a fixed tag set, the learner can handle. A sentence is only shown when all of its tags are unlocked.
_Avoid_: difficulty, grammar level

**Paragraph translation**:
A translation mode that adds a translation for each paragraph. It does not replace text inline; each paragraph gets a separate translation.
_Avoid_: word translation, word-by-word replacement

**Pronunciation tooltip**:
The interactive learning panel attached to a translation, showing phonetics (English only), a meaning with learner grammar, and a speak button. It is the main entry point into pronunciation learning.
_Avoid_: hint box, tooltip component

**Website rules**:
The user's rules controlling whether the extension acts on a site, with blacklist and whitelist semantics. They decide whether the content script engages with a page.
_Avoid_: blacklist storage, legacy site config

**Protected user paths**:
The user-visible flows that must keep working during refactors: API configuration management, word translation, sentence translation, paragraph translation, the pronunciation tooltip and website rules. They are the only external constraint on whether internal implementation may be changed or removed.
_Avoid_: keep features working, try not to break things, mostly works
