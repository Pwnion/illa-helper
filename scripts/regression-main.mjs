import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';

const { document, window } = parseHTML(`
  <!doctype html>
  <html>
  <body class="wxt-translation-hidden">
    <nav id="tabs" role="tablist">
      <a id="tab-guides" role="tab" href="/guides">Guides</a>
      <a id="tab-reference" role="tab" href="/reference">Reference</a>
      <a id="tab-community" role="tab" href="/community">Community</a>
    </nav>
    <nav id="plain-nav">Docs Blog Careers</nav>
    <article>
      <p id="article">
        The Ankara Summit may be
        <a id="remembered" href="https://example.com">remembered</a>
        as a <em id="turning-point">multipolar turning point</em>.
      </p>
      <div id="card" role="button">
        <span id="card-copy">Build production-grade applications with Spring.</span>
      </div>
      <button id="real-button">This real button should not be translated.</button>
      <pre id="pre">const ignored = true;</pre>
      <code id="code">inlineCodeShouldNotTranslate</code>
    </article>
  </body>
  </html>
`);

window.setTimeout = setTimeout;
window.clearTimeout = clearTimeout;
window.getComputedStyle = (element) => ({
  display: ['A', 'SPAN', 'EM'].includes(element.tagName) ? 'inline' : 'block',
  visibility: 'visible',
});

globalThis.window = window;
globalThis.document = document;
globalThis.Node = window.Node;
globalThis.Text = window.Text;
globalThis.Element = window.Element;
globalThis.HTMLElement = window.HTMLElement;
globalThis.SVGElement = window.SVGElement;
globalThis.NodeFilter = {
  FILTER_ACCEPT: 1,
  FILTER_REJECT: 2,
  SHOW_TEXT: 4,
};
globalThis.browser = {
  runtime: {
    id: 'regression-main-extension',
    onMessage: {
      addListener: () => undefined,
    },
    sendMessage: async () => true,
  },
  storage: {
    sync: {
      get: async () => ({}),
      set: async () => undefined,
    },
  },
};

const originalCrypto = globalThis.crypto;
Object.defineProperty(globalThis, 'crypto', {
  configurable: true,
  value: {},
});

const { isTranslationCandidateNode } = await import(
  '../src/modules/processing/DomTranslationPolicy.ts'
);
const { walkAndCollectParagraphs } = await import(
  '../src/modules/processing/DomWalker.ts'
);
const { selectParagraphTranslationElements } = await import(
  '../src/modules/core/translation/ParagraphTranslationSelection.ts'
);
const { renderParagraphTranslation } = await import(
  '../src/modules/core/translation/ParagraphTranslationRenderer.ts'
);

assert.equal(
  isTranslationCandidateNode(document.querySelector('#real-button'), 1),
  false,
  'a real <button> must never be queued for translation',
);
assert.equal(
  isTranslationCandidateNode(document.querySelector('#pre'), 1),
  false,
  'a <pre> code block must never be queued for translation',
);
assert.equal(
  isTranslationCandidateNode(document.querySelector('#tabs'), 1),
  true,
  'an ARIA role must not exclude a whole subtree of visible text',
);
assert.equal(
  isTranslationCandidateNode(document.querySelector('#card'), 16),
  true,
  'a role=button content card should be allowed into the translation queue',
);

const selected = selectParagraphTranslationElements(
  walkAndCollectParagraphs(document.body),
);
Object.defineProperty(globalThis, 'crypto', {
  configurable: true,
  value: originalCrypto,
});

assert.deepEqual(
  selected.map((element) => element.id),
  [
    'tab-guides',
    'tab-reference',
    'tab-community',
    'plain-nav',
    'article',
    'card',
  ],
  'paragraph selection should cover navigation, plain paragraphs and body text without <p> tags without over-filtering',
);

const article = document.querySelector('#article');
renderParagraphTranslation(
  article,
  'Ankaramötet kan komma att ses som en multipolär vändpunkt.',
  'wxt-style-default',
);

const paragraphTranslation = article.querySelector(
  '.illa-paragraph-translation',
);
assert.equal(
  paragraphTranslation?.tagName,
  'SPAN',
  'a <p> translation should be attached inside the <p>, not as a sibling that breaks layout',
);
assert.match(
  paragraphTranslation?.getAttribute('style') ?? '',
  /display:\s*block/,
  'a <p> translation must be displayed on its own line',
);

const tab = document.querySelector('#tab-guides');
renderParagraphTranslation(tab, 'Guider', 'wxt-style-default');
assert.equal(
  tab.querySelector('.illa-paragraph-translation')?.tagName,
  'SPAN',
  'a short inline navigation item should get its translation inside the element',
);

console.log('main regression passed');
