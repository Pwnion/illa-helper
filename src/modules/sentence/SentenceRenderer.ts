/**
 * Renders translated sentences in place and restores the original DOM.
 *
 * Rendering never moves or rewrites page text. The sentence's text nodes are
 * split at the sentence boundaries and each piece is wrapped in a hidden
 * span; a translation span is inserted before them. Every split is recorded,
 * so restoring unwraps the pieces and merges the text back into the original
 * node objects, leaving the same nodes, attributes and markup as before.
 */

import {
  flattenBlock,
  normalizeWhitespace,
  piecesForRange,
  ORIGINAL_CLASS,
  TRANSLATION_CLASS,
} from './segmentation';
import type { AnalysedToken, SentenceAnalysis } from './types';

export const WORD_CLASS = 'illa-sw';
export const REVEALED_CLASS = 'illa-revealed';
const STYLE_ID = 'illa-sentence-style';

export interface SentenceRenderTarget {
  block: Element;
  start: number;
  end: number;
  /** Whitespace-normalised source text; rendering is skipped if it changed */
  text: string;
}

export interface RenderedSentence {
  id: string;
  block: Element;
  translation: HTMLElement;
  originals: HTMLElement[];
  splits: Array<{ original: Text; created: Text }>;
  analysis: SentenceAnalysis;
  sourceText: string;
  /** Lemmas that counted as new when the sentence was selected */
  newLemmas: string[];
  revealed: boolean;
}

export interface TranslationPart {
  text: string;
  tokenIndex?: number;
}

export class SentenceRenderer {
  private rendered: RenderedSentence[] = [];
  private byId = new Map<string, RenderedSentence>();
  private nextId = 0;

  constructor(private targetLanguage: string) {}

  setTargetLanguage(language: string): void {
    this.targetLanguage = language;
  }

  render(
    target: SentenceRenderTarget,
    analysis: SentenceAnalysis,
    newLemmas: string[],
  ): RenderedSentence | null {
    const { block } = target;
    if (!block.isConnected) return null;

    const flat = flattenBlock(block);
    const current = normalizeWhitespace(
      flat.text.slice(target.start, target.end),
    );
    if (current !== target.text) return null;

    const pieces = piecesForRange(flat.spans, target.start, target.end);
    if (pieces.length === 0) return null;

    this.ensureStyles(block.ownerDocument);

    const splits: RenderedSentence['splits'] = [];
    const originals: HTMLElement[] = [];
    const doc = block.ownerDocument;

    for (const piece of pieces) {
      let node = piece.node;
      let { from, to } = piece;
      if (from > 0) {
        const rest = node.splitText(from);
        splits.push({ original: node, created: rest });
        node = rest;
        to -= from;
        from = 0;
      }
      if (to < node.data.length) {
        const tail = node.splitText(to);
        splits.push({ original: node, created: tail });
      }

      const wrapper = doc.createElement('span');
      wrapper.className = ORIGINAL_CLASS;
      node.parentNode!.insertBefore(wrapper, node);
      wrapper.appendChild(node);
      originals.push(wrapper);
    }

    const id = `s${++this.nextId}`;
    for (const wrapper of originals) wrapper.dataset.illaSid = id;

    const translation = this.createTranslationElement(doc, id, analysis);
    const anchor = insertionAnchor(originals[0], block, new Set(originals));
    anchor.parentNode!.insertBefore(translation, anchor);

    const sentence: RenderedSentence = {
      id,
      block,
      translation,
      originals,
      splits,
      analysis,
      sourceText: target.text,
      newLemmas,
      revealed: false,
    };
    this.rendered.push(sentence);
    this.byId.set(id, sentence);
    return sentence;
  }

  setRevealed(sentence: RenderedSentence, revealed: boolean): void {
    sentence.revealed = revealed;
    sentence.translation.classList.toggle(REVEALED_CLASS, revealed);
    for (const wrapper of sentence.originals) {
      wrapper.classList.toggle(REVEALED_CLASS, revealed);
    }
  }

  get(id: string | undefined | null): RenderedSentence | undefined {
    return id ? this.byId.get(id) : undefined;
  }

  all(): readonly RenderedSentence[] {
    return this.rendered;
  }

  hasContent(): boolean {
    return this.rendered.length > 0;
  }

  /**
   * Restores every rendered sentence, newest first, so each sentence's splits
   * are undone in the reverse order they were made.
   */
  restoreAll(): void {
    for (const sentence of [...this.rendered].reverse()) {
      try {
        restoreSentence(sentence);
      } catch (error) {
        console.warn('[SentenceRenderer] Failed to restore sentence:', error);
      }
    }
    this.rendered = [];
    this.byId.clear();
    document.getElementById(STYLE_ID)?.remove();
  }

  private createTranslationElement(
    doc: Document,
    id: string,
    analysis: SentenceAnalysis,
  ): HTMLElement {
    const element = doc.createElement('span');
    element.className = TRANSLATION_CLASS;
    element.lang = this.targetLanguage;
    element.dataset.illaSid = id;

    for (const part of splitTranslation(
      analysis.translation,
      analysis.tokens,
    )) {
      if (part.tokenIndex === undefined) {
        element.appendChild(doc.createTextNode(part.text));
        continue;
      }
      const word = doc.createElement('span');
      word.className = WORD_CLASS;
      word.dataset.illaToken = String(part.tokenIndex);
      word.textContent = part.text;
      element.appendChild(word);
    }
    return element;
  }

  private ensureStyles(doc: Document): void {
    if (doc.getElementById(STYLE_ID)) return;
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = SENTENCE_STYLES;
    (doc.head ?? doc.documentElement).appendChild(style);
  }
}

/**
 * Splits a translation into plain text and token parts by finding each
 * token's surface form in order. Tokens that cannot be found are skipped.
 */
export function splitTranslation(
  translation: string,
  tokens: readonly AnalysedToken[],
): TranslationPart[] {
  const parts: TranslationPart[] = [];
  const lower = translation.toLowerCase();
  let cursor = 0;

  tokens.forEach((token, tokenIndex) => {
    let index = translation.indexOf(token.surface, cursor);
    if (index === -1)
      index = lower.indexOf(token.surface.toLowerCase(), cursor);
    if (index === -1) return;

    if (index > cursor) parts.push({ text: translation.slice(cursor, index) });
    const end = index + token.surface.length;
    parts.push({ text: translation.slice(index, end), tokenIndex });
    cursor = end;
  });

  if (cursor < translation.length) {
    parts.push({ text: translation.slice(cursor) });
  }
  return parts;
}

/**
 * Where to insert the translation: before the first original piece, hoisted
 * out of inline ancestors whose text belongs entirely to this sentence, so a
 * sentence that starts with a link does not render its translation as a link.
 */
function insertionAnchor(
  first: HTMLElement,
  block: Element,
  originals: Set<Node>,
): Node {
  let anchor: Node = first;
  let parent = first.parentElement;
  while (parent && parent !== block && isFullyCovered(parent, originals)) {
    anchor = parent;
    parent = parent.parentElement;
  }
  return anchor;
}

function isFullyCovered(element: Element, originals: Set<Node>): boolean {
  const walker = element.ownerDocument.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
  );
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (!(node as Text).data.trim()) continue;
    const wrapper = node.parentElement;
    if (!wrapper || !originals.has(wrapper)) return false;
  }
  return true;
}

function restoreSentence(sentence: RenderedSentence): void {
  sentence.translation.remove();

  for (const wrapper of sentence.originals) {
    const parent = wrapper.parentNode;
    if (!parent) continue;
    while (wrapper.firstChild) parent.insertBefore(wrapper.firstChild, wrapper);
    wrapper.remove();
  }

  for (const { original, created } of [...sentence.splits].reverse()) {
    if (original.nextSibling === created) {
      original.appendData(created.data);
      created.remove();
    }
  }
}

const SENTENCE_STYLES = `
.${ORIGINAL_CLASS} { display: none !important; }
.${ORIGINAL_CLASS}.${REVEALED_CLASS} {
  display: inline !important;
  background: rgba(255, 196, 0, 0.14);
  border-radius: 2px;
  cursor: pointer;
}
.${TRANSLATION_CLASS} {
  background: rgba(106, 136, 224, 0.1);
  border-bottom: 1px dotted rgba(106, 136, 224, 0.55);
  border-radius: 2px;
  cursor: pointer;
}
.${TRANSLATION_CLASS}.${REVEALED_CLASS} { display: none !important; }
.${TRANSLATION_CLASS} .${WORD_CLASS}:hover {
  background: rgba(106, 136, 224, 0.22);
  border-radius: 2px;
}
.wxt-translation-hidden .${TRANSLATION_CLASS} { display: none !important; }
.wxt-translation-hidden .${ORIGINAL_CLASS} {
  display: inline !important;
  background: none;
  cursor: auto;
}
`;
