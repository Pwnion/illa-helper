# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**illa-helper** is a browser extension for immersive language learning based on the "i+1" comprehensible input theory. It has three translation modes: word mode replaces selected words, sentence mode replaces whole sentences the learner can read (selected in code from a cached LLM analysis against their known words and unlocked grammar), and paragraph mode adds a translation under each paragraph. This fork defaults to English → Swedish and has no Chinese UI or China-specific services.

Built with WXT (WebExtension Toolkit) + Vue 3 + TypeScript + Vite. Supports Chrome, Edge, Firefox.

## Common Commands

```bash
npm run dev              # Dev server (Chrome), hot reload
npm run dev:firefox      # Dev server (Firefox)
npm run build            # Production build (Chrome)
npm run build:firefox    # Production build (Firefox)
npm run zip              # Package for Chrome store
npm run zip:firefox      # Package for Firefox store
npm run zip:all          # Package all browsers

npm run lint             # ESLint check
npm run lint:fix         # ESLint auto-fix
npm run format           # Prettier format
npm run check            # format + lint:fix combined
npm run compile          # TypeScript type check (vue-tsc --noEmit)
npm test                 # Unit tests (vitest, jsdom, fake-indexeddb)
npm run test:regression  # DOM walker regression script
npm run test:e2e         # Build, then drive the unpacked extension in Playwright Chromium
                         #   against a local mock OpenAI-compatible server
```

Unit tests live in `tests/`. Never call a real model in tests; mock the model caller or run the e2e mock server.

## Environment Setup

Optional: copy `.env.example` to `.env` to bake a default API endpoint, key and model into the build. Variables are injected at build time via Vite. Without it, users add an API configuration in the options page.

## Architecture

### Entry Points (`entrypoints/`)

| Entry | Role |
|-------|------|
| `background.ts` | Service worker. Initializes singleton services, routes runtime messages, handles extension install/update events. |
| `content.ts` | Content script. Creates `ContentManager` which orchestrates DOM scanning, translation injection, and cleanup. |
| `popup/` | Vue 3 app. Quick toggle and status display. |
| `options/` | Vue 3 app. Full settings UI with multiple tab components. |

### Module Architecture (`src/modules/`)

The codebase follows a service-oriented architecture with clear module boundaries:

```
src/modules/
├── core/                    # Shared infrastructure
│   ├── messaging/           # MessagingService (singleton) - inter-component communication
│   ├── storage/             # StorageService (singleton) - config persistence with versioning
│   ├── translation/         # TextProcessorService, TextReplacerService, ParagraphTranslationService,
│   │                        #   LanguageService, PromptService
│   └── i18n/                # Internationalization setup
├── api/                     # AI translation backend
│   ├── factory/             # ApiServiceFactory - creates provider by config type
│   ├── providers/           # OpenAIProvider, GoogleGeminiProvider (extend BaseProvider)
│   ├── services/            # UniversalApiService - unified API with retry logic
│   └── utils/               # Request helpers, structured text parser
├── content/                 # Content script services
│   ├── ContentManager.ts    # Main coordinator - owns all content-side services
│   ├── ConfigurationService # Loads and watches user config
│   ├── ProcessingService    # Triggers translation pipeline
│   ├── ListenerService      # DOM mutation and message listeners
│   ├── LazyLoadingService   # IntersectionObserver-based lazy translation
│   └── utils/               # domUtils, SegmentObserver
├── processing/              # Translation pipeline
│   ├── ContentSegmenter     # Splits page into translatable segments
│   ├── ProcessingCoordinator # Orchestrates segment processing
│   └── ProcessingStateManager # Tracks what's been processed
├── pronunciation/           # Pronunciation ecosystem
│   ├── services/            # PronunciationService, TTSService
│   ├── phonetic/            # PhoneticProviderFactory, DictionaryApiProvider
│   ├── tts/                 # TTSProviderFactory, WebSpeechTTSProvider (voice for the target language)
│   └── translation/         # AITranslationProvider (gloss + learner grammar for a word)
├── sentence/                # Sentence mode
│   ├── segmentation.ts      # Flatten block text, Intl.Segmenter, map sentences back to text nodes
│   ├── prompt.ts / parser.ts # Analysis prompt (bump PROMPT_VERSION on change) and tolerant JSON parsing
│   ├── selection.ts         # Pure selection: new-word count, cold-start CEFR, grammar gating, page cap
│   ├── vocabulary.ts        # Known-word state transitions, import/export
│   ├── SentenceRenderer.ts  # In-place rendering with exact DOM restoration
│   ├── SentenceTranslationService.ts # Orchestrator: cache, batching, rendering, word card, exposures
│   └── store/               # IndexedDB (extension origin only) + content-script message client
├── background/services/     # ApiProxyService, NotificationService, CommandService,
│                            #   InitializationService, UpdateCheckService
│                            #   (background.ts also serves sentence-store messages)
├── floatingBall/            # FloatingBallManager - configurable floating UI widget
├── contextMenu/             # ContextMenuManager - browser right-click menu
├── infrastructure/ratelimit/ # RateLimiterService
├── shared/                  # Shared types, constants, utils
│   ├── types/               # storage.ts, core.ts, api.ts, ui.ts
│   └── constants/defaults.ts # Default configuration values
└── styles/                  # Component styles, themes, constants
```

### Data Flow

```
User Settings (Popup/Options)
  → MessagingService → Background Script → StorageService
  → MessagingService → Content Script → ContentManager
  → ProcessingCoordinator → ContentSegmenter → ApiServiceFactory → Provider
  → TextReplacerService → DOM injection
```

### Key Design Patterns

- **Singleton services**: StorageService, MessagingService, all background services. Instantiated once and shared.
- **Factory pattern**: `ApiServiceFactory` (selects OpenAI/Gemini provider), `PhoneticProviderFactory`, `TTSProviderFactory`. Adding a new provider means implementing the interface and registering in the factory.
- **Event-driven messaging**: `MessagingService` wraps `browser.runtime.sendMessage` / `browser.tabs.sendMessage`. Message types defined in `core/messaging/types.ts` (e.g., `SETTINGS_UPDATED`, `WEBSITE_MANAGEMENT_UPDATED`, `CONTEXT_MENU_ACTION`).

### Sentence mode storage

Content scripts must not open IndexedDB: their storage belongs to the visited site. The analysis cache and known-word store live in the extension origin (`SentenceStore`), opened by the background script and the options page; content scripts use `SentenceStoreClient`, which sends `sentence-store` runtime messages.

### Content Script Pipeline

`ContentManager` is the root coordinator in the content script. It initializes:
1. `ConfigurationService` - loads user settings from storage
2. `ListenerService` - watches for DOM mutations and incoming messages
3. `ProcessingService` - when triggered, uses `ContentSegmenter` to split visible text into segments, then `ProcessingCoordinator` sends them through the API for translation
4. `LazyLoadingService` - uses IntersectionObserver to translate only visible segments
5. `TextReplacerService` - uses Range API to safely replace text nodes in the DOM

### Browser-Specific Notes

- Firefox requires explicit addon ID in manifest (`browser_specific_settings.gecko.id` in `wxt.config.ts`)
- Firefox uses MV2; Chrome/Edge use MV3
- Production builds strip `console.log` and `console.warn` via `vite-plugin-remove-console`

### i18n

3 UI languages (English, Korean, Spanish); missing strings fall back to English, and new strings only need adding to `en-US.json`. Locale files in `src/i18n/locales/`. Uses `@intlify/unplugin-vue-i18n` for compile-time optimization. All user-facing strings in the Vue UI must go through Vue I18n. Keep the codebase free of Chinese text.

### UI Stack

Tailwind CSS v4 + Reka UI (headless components) + Lucide icons. Shared UI components live in `entrypoints/options/components/ui/`. Styles in `src/modules/styles/`.
