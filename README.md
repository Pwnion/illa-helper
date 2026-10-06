# ILLA Helper (sentence mode fork)

<div align="center">
<img src="public/icon/128.png" width="100" height="100" alt="" />
</div>

A browser extension for learning a language while you browse, using an LLM you configure. It is a fork of [xiao-zaiyi/illa-helper](https://github.com/xiao-zaiyi/illa-helper) (MIT) with two changes:

- **Sentence mode.** Instead of swapping single words into the language you are learning, it replaces whole sentences you can actually read, so you pick up word order and grammar as well as vocabulary.
- **English-only and no China-specific services.** The Chinese UI, docs and comments are gone, text-to-speech uses the browser instead of Youdao, and the default language pair is English to Swedish.

The original word mode and paragraph mode still work.

## Sentence mode

When you translate a page in sentence mode:

1. **The page is split into sentences in code.** Each block of text is flattened (links and bold text included) and split with the browser's `Intl.Segmenter`. Sentences containing code, inputs or editable text are skipped, as are fragments under three words.
2. **The model analyses, it does not decide.** Sentences are sent in numbered batches of about 1,500 characters. For each one the model returns a natural translation and, for every word of that translation, its lemma (particle verbs such as *tycka om* stay one unit), a gloss in your native language, a CEFR estimate, and proper-noun and cognate flags. It also returns the grammar features used, chosen from a fixed list.
3. **Selection happens in code, against your vocabulary.** A sentence is shown only if:
   - it has at most *N* words you don't know yet (default 1), and
   - every grammar feature it uses is one you have unlocked.

   A word counts as known if you marked it known, if it is a name or transparent cognate, or if you have never judged it and it is at or below your cold-start level (default A2).
4. **Analyses are cached.** They are stored in IndexedDB, so revisiting a page or changing your settings re-selects sentences without calling the model again.

Because the analysis doesn't depend on your level, the same cached analysis yields more sentences as your vocabulary grows.

### Reading and learning

- **Hover a word** to see its dictionary form, gloss, CEFR level and status. From the card you can hear it, mark it known or unknown, load grammar notes, or reveal the original sentence. For Swedish, the grammar notes give en/ett gender and noun forms, verb principal parts, and particle verbs as one unit.
- **Click a sentence** to swap it back to the original, and click again to return. Links inside sentences still work.
- **Exposures happen automatically.** A replaced sentence that stays on screen long enough to read (default: the longer of 1.5 s or 300 ms per word), without being hovered or revealed, counts as one unaided read of each of its words. After 5 such reads without a lookup, a word becomes known.
- **Lookups and reveals set words back.** Opening a word's card marks it as learning and restarts its count. Revealing a sentence does the same for that sentence's new words.
- **Restore** (popup button) puts back the exact original page. The floating ball and hotkey still toggle between translation and original.

### Settings

Under **Options → Sentence Mode**:

- **Selection:** new words allowed per sentence, cold-start level, and an optional cap on the share of a page replaced.
- **Grammar:** which features are unlocked. Beginner defaults are present tense, imperative, modal verbs, infinitive with *att*, definite suffix, questions and verb-second inversion. Unlocking past tense and perfect makes far more sentences eligible.
- **Learning:** exposure threshold and reading times.
- **Requests:** batch size, and a button to clear the analysis cache.
- **Known words:** counts by status, import (one word per line, optionally followed by a tab and a status, or this extension's CSV/JSON export), export as CSV or JSON, and reset.

Your known words and the analysis cache stay on this device, in the extension's own storage.

### Cost

These are rough figures, since they depend on the model's tokenizer:

| | Input tokens | Output tokens |
|---|---|---|
| One request (~1,500 source characters, ~250 words) | ~1,250 (a ~850-token system prompt plus the sentences) | ~2,750 (about 11 per word) |
| A ~1,500-word article, first visit (~6 requests) | ~8k | ~17k |
| The same article, revisited | 0 | 0 |

Grammar notes cost one small extra request per word, and only when you ask for them.

## Install

1. Install dependencies with `npm ci`, then build for your browser:
   - **Chrome or Edge:** `npm run build`, open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and choose `.output/chrome-mv3`.
   - **Firefox (or Firefox-based browsers like Zen):** `npm run build:firefox`, open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…**, and choose `.output/firefox-mv2/manifest.json`. Temporary add-ons are removed when the browser quits, and their stored data may go with them. To install permanently, sign it as an unlisted (self-distributed) add-on with your addons.mozilla.org API key: `npx web-ext sign -s .output/firefox-mv2 --channel=unlisted --api-key=… --api-secret=…`, then open the signed `.xpi`.
2. The shortcut to translate the page is Alt+Z, or Control+Shift+Z on macOS.
3. Open the extension's options. Under **Translation Service**, add an API configuration:
   - **OpenAI**, or any OpenAI-compatible endpoint (for example OpenRouter, or a local Ollama server at `http://localhost:11434/v1/chat/completions`).
   - **Anthropic (Claude)** through its OpenAI-compatible endpoint, defaulting to `claude-haiku-4-5-20251001`. This preset matches Anthropic's documented compatibility API but has not been tested here.
   - **Google Gemini**.
4. Under **Basic Settings**, choose **Sentence Translation Mode**.
5. On a page in your native language, click **Translate** in the popup.

Translation is manual by default. Use **Website Management** to block sites (such as work tools) or to translate some sites automatically.

## Privacy

When you translate a page, its text goes to the API endpoint you configured, and nowhere else. The extension also:

- checks this fork's GitHub releases once a day for updates;
- fetches phonetics from dictionaryapi.dev, but only when the target language is English.

Speech is synthesised locally by the browser. Your API key is stored in the browser's synced extension storage.

## Development

```bash
npm ci
npm run dev           # Chrome dev build with reload
npm run build         # production build in .output/chrome-mv3
npm run compile       # type check
npm run lint
npm test              # unit tests (vitest)
npm run test:e2e      # build, then drive the unpacked extension in Playwright
                      # Chromium against a local mock model server
```

Sentence mode lives in `src/modules/sentence/`. See [docs/ARCHITECTURE_AND_FEATURES.md](docs/ARCHITECTURE_AND_FEATURES.md) and [CONTEXT.md](CONTEXT.md).

## Credits and licence

This is based on [illa-helper](https://github.com/xiao-zaiyi/illa-helper) by xiao-zaiyi, released under the MIT licence; see [LICENSE](LICENSE). The fork diverges substantially from upstream, so merging future upstream changes will conflict.
