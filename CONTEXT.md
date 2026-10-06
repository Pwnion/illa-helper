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
