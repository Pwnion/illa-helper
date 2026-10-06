/**
 * End-to-end smoke test for sentence mode.
 *
 * Loads the unpacked Chrome build in Playwright Chromium, points it at a
 * local mock OpenAI-compatible server that returns canned analyses, and
 * checks that sentences are replaced, a word card opens, a sentence can be
 * revealed and restoring gives back the original DOM. No real model is
 * called.
 *
 * Usage: npm run build && node scripts/e2e-sentence-mode.mjs
 */

import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extensionPath = path.join(root, '.output', 'chrome-mv3');

const PAGE = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Sentence mode test</title></head>
<body>
<article id="article">
  <h1>Learning with whole sentences</h1>
  <p id="p1">The cat is sleeping on the sofa. <a href="#" id="link">The old dog</a> watches the birds outside the window. Yesterday we walked to the harbour together.</p>
  <p id="p2">My sister reads a <strong>very long</strong> book every week. The weather report predicts heavy thunderstorms tomorrow afternoon.</p>
  <p id="p3">Please call me when you arrive at the station.</p>
</article>
</body>
</html>`;

const t = (surface, lemma, gloss, cefr, flags = 0) => [
  surface,
  lemma,
  gloss,
  cefr,
  flags,
];

/** Canned analyses keyed by source sentence. */
const CANNED = {
  'The cat is sleeping on the sofa.': [
    'Katten sover på soffan.',
    [
      t('Katten', 'katt', 'cat', 1),
      t('sover', 'sova', 'sleeps', 2),
      t('på', 'på', 'on', 1),
      t('soffan', 'soffa', 'sofa', 2, 2),
    ],
    ['pres', 'def'],
  ],
  'The old dog watches the birds outside the window.': [
    'Den gamla hunden tittar på fåglarna utanför fönstret.',
    [
      t('Den', 'den', 'the', 1),
      t('gamla', 'gammal', 'old', 1),
      t('hunden', 'hund', 'dog', 1),
      t('tittar', 'titta', 'looks', 1),
      t('på', 'på', 'at', 1),
      t('fåglarna', 'fågel', 'birds', 2),
      t('utanför', 'utanför', 'outside', 2),
      t('fönstret', 'fönster', 'window', 2),
    ],
    ['pres', 'def', 'dbldef'],
  ],
  'Yesterday we walked to the harbour together.': [
    'Igår promenerade vi till hamnen tillsammans.',
    [
      t('Igår', 'igår', 'yesterday', 1),
      t('promenerade', 'promenera', 'walked', 2),
      t('vi', 'vi', 'we', 1),
      t('till', 'till', 'to', 1),
      t('hamnen', 'hamn', 'harbour', 2),
      t('tillsammans', 'tillsammans', 'together', 2),
    ],
    ['past', 'v2', 'def'],
  ],
  'My sister reads a very long book every week.': [
    'Min syster läser en mycket lång bok varje vecka.',
    [
      t('Min', 'min', 'my', 1),
      t('syster', 'syster', 'sister', 1),
      t('läser', 'läsa', 'reads', 1),
      t('en', 'en', 'a', 1),
      t('mycket', 'mycket', 'very', 1),
      t('lång', 'lång', 'long', 1),
      t('bok', 'bok', 'book', 1),
      t('varje', 'varje', 'every', 2),
      t('vecka', 'vecka', 'week', 1),
    ],
    ['pres'],
  ],
  'The weather report predicts heavy thunderstorms tomorrow afternoon.': [
    'Väderrapporten förutspår kraftiga åskväder i morgon eftermiddag.',
    [
      t('Väderrapporten', 'väderrapport', 'weather report', 4),
      t('förutspår', 'förutspå', 'predicts', 5),
      t('kraftiga', 'kraftig', 'heavy', 3),
      t('åskväder', 'åskväder', 'thunderstorms', 4),
      t('i', 'i', 'in', 1),
      t('morgon', 'morgon', 'morning', 1),
      t('eftermiddag', 'eftermiddag', 'afternoon', 2),
    ],
    ['pres', 'def'],
  ],
  'Please call me when you arrive at the station.': [
    'Ring mig när du kommer till stationen.',
    [
      t('Ring', 'ringa', 'call', 1),
      t('mig', 'jag', 'me', 1),
      t('när', 'när', 'when', 1),
      t('du', 'du', 'you', 1),
      t('kommer', 'komma', 'arrive', 1),
      t('till', 'till', 'to', 1),
      t('stationen', 'station', 'station', 1, 2),
    ],
    ['imp', 'def'],
  ],
};

const requests = [];

function startServer() {
  const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url?.startsWith('/page.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(PAGE);
      return;
    }
    if (req.method === 'POST' && req.url === '/v1/chat/completions') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const payload = JSON.parse(body);
      requests.push({ headers: req.headers, payload });

      const user = payload.messages.find((m) => m.role === 'user').content;
      const content = JSON.stringify(
        user.split('\n').map((line) => {
          const index = line.indexOf('|');
          const id = Number(line.slice(0, index));
          const text = line.slice(index + 1);
          // Anything not canned comes back too hard to show
          const canned = CANNED[text] ?? [
            text.toUpperCase(),
            [t('SVÅRT', 'svår', 'hard', 6), t('ORD', 'ord', 'word', 6)],
            ['pres'],
          ];
          return [id, ...canned];
        }),
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          choices: [{ message: { role: 'assistant', content } }],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        }),
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve(server)),
  );
}

async function main() {
  await fs.access(path.join(extensionPath, 'manifest.json'));
  const server = await startServer();
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'illa-e2e-'));

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });

  try {
    let [worker] = context.serviceWorkers();
    worker ??= await context.waitForEvent('serviceworker');

    // Configure the extension before the page loads
    await worker.evaluate(async (endpoint) => {
      const settings = {
        userLevel: 3,
        replacementRate: 0.3,
        isEnabled: true,
        useGptApi: true,
        apiConfigs: [
          {
            id: 'e2e',
            name: 'Mock',
            protocolFamily: 'openai-compatible',
            config: {
              apiKey: 'test-key',
              apiEndpoint: endpoint,
              model: 'mock-model',
              temperature: 0,
            },
          },
        ],
        activeApiConfigId: 'e2e',
        translationStyle: 'default',
        translationMode: 'sentence',
        triggerMode: 'manual',
        multilingualConfig: { nativeLanguage: 'en', targetLanguage: 'sv' },
        lazyLoading: { enabled: true, preloadDistance: 0.5 },
        floatingBall: { enabled: false, position: 50, opacity: 0.8 },
        maxLength: 400,
        originalWordDisplayMode: 0,
        enablePronunciationTooltip: true,
        pronunciationHotkey: {
          enabled: false,
          modifierKeys: [],
          description: 'Hotkey',
        },
        translationPosition: 'after',
        showParentheses: true,
        apiRequestTimeout: 0,
        customTranslationCSS: '',
      };
      await chrome.storage.sync.set({
        user_settings: JSON.stringify(settings),
      });
    }, `${origin}/v1/chat/completions`);

    const page = await context.newPage();
    await page.goto(`${origin}/page.html`);
    const originalHtml = await page.locator('#article').innerHTML();
    await page.waitForTimeout(1000); // let the content script initialise

    await worker.evaluate(async (url) => {
      const [tab] = await chrome.tabs.query({ url });
      await chrome.tabs.sendMessage(tab.id, { type: 'MANUAL_TRANSLATE' });
    }, `${origin}/page.html`);

    await page.waitForSelector('.illa-st', { timeout: 15000 });
    await page.waitForTimeout(500);

    const translations = await page
      .locator('.illa-st')
      .evaluateAll((els) => els.map((el) => el.textContent));
    assert.deepEqual(translations, [
      'Katten sover på soffan.',
      'Min syster läser en mycket lång bok varje vecka.',
      'Ring mig när du kommer till stationen.',
    ]);
    console.log('✓ replaced the 3 eligible sentences of 7');

    // The original text of replaced sentences is hidden, the rest visible
    const visible = await page.locator('#p2').innerText();
    assert.match(visible, /Min syster läser/);
    assert.doesNotMatch(visible, /My sister reads/);
    assert.match(visible, /The weather report predicts/);
    console.log('✓ unselected sentences stay in the source language');

    // Model requests had the expected shape
    assert.ok(requests.length >= 1);
    const first = requests[0];
    assert.equal(first.headers.authorization, 'Bearer test-key');
    assert.equal(first.payload.model, 'mock-model');
    assert.equal(first.payload.messages[0].role, 'system');
    assert.match(first.payload.messages[0].content, /learning Swedish/);
    assert.match(first.payload.messages[1].content, /^\d+\|/m);
    console.log(
      `✓ ${requests.length} model request(s) with the expected shape`,
    );

    // Word card
    await page.locator('.illa-st .illa-sw', { hasText: 'Katten' }).hover();
    const card = page.locator('.illa-sentence-tooltip');
    await card.waitFor({ timeout: 3000 });
    const cardText = await card.innerText();
    assert.match(cardText, /katt/);
    assert.match(cardText, /cat/);
    assert.match(cardText, /A1/);
    console.log('✓ hovering a word opens its card');
    await page.mouse.move(0, 0);
    await page.waitForTimeout(500);

    // Reveal and hide again
    const sister = page.locator('.illa-st', { hasText: 'Min syster' });
    await sister.click();
    assert.match(
      await page.locator('#p2').innerText(),
      /My sister reads a very long book/,
    );
    console.log('✓ clicking a sentence reveals the original');
    await page.locator('#p2 strong .illa-so').click();
    assert.match(await page.locator('#p2').innerText(), /Min syster läser/);
    console.log('✓ clicking the revealed original shows the translation again');

    // Restore
    await worker.evaluate(async (url) => {
      const [tab] = await chrome.tabs.query({ url });
      await chrome.tabs.sendMessage(tab.id, { type: 'RESTORE_PAGE' });
    }, `${origin}/page.html`);
    await page.waitForTimeout(300);
    assert.equal(await page.locator('#article').innerHTML(), originalHtml);
    assert.equal(await page.locator('.illa-st, .illa-so').count(), 0);
    console.log('✓ restoring gives back the exact original DOM');

    // A second run is served from the cache
    const before = requests.length;
    await worker.evaluate(async (url) => {
      const [tab] = await chrome.tabs.query({ url });
      await chrome.tabs.sendMessage(tab.id, { type: 'MANUAL_TRANSLATE' });
    }, `${origin}/page.html`);
    await page.waitForSelector('.illa-st', { timeout: 15000 });
    await page.waitForTimeout(500);
    assert.equal(requests.length, before);
    assert.equal(await page.locator('.illa-st').count(), 3);
    console.log('✓ translating again uses cached analyses (no new requests)');

    console.log('\nsentence mode e2e passed');
  } finally {
    await context.close();
    server.close();
    await fs.rm(userDataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
