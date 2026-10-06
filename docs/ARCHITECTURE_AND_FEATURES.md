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
- `src/modules/options/website-management`: website blacklist and whitelist rules.

## Design Notes

Legacy compatibility branches are kept out of the main path. Old configs, old provider names, deprecated interfaces and sample code are not part of the runtime; if user data ever needs preserving, use a one-off migration tool rather than putting compatibility logic back into the business path.