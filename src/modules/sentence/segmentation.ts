/**
 * Sentence segmentation for a block of page text.
 *
 * A block's text nodes are flattened into one string with an offset map, the
 * string is split with Intl.Segmenter, and each sentence maps back to the text
 * node pieces it covers (which may sit inside links or bold text). Offsets are
 * stable across renders because rendering only splits and wraps text nodes,
 * never changes their text, and translation spans are excluded here.
 */

import { SKIP_TAGS } from '../shared/constants';

/** Stands in for content that cannot be translated, e.g. inline code */
export const GAP = '￼';

export const TRANSLATION_CLASS = 'illa-st';
export const ORIGINAL_CLASS = 'illa-so';

/** Elements that never contribute text and do not interrupt a sentence */
const MEDIA_TAGS = new Set([
  'IMG',
  'SVG',
  'CANVAS',
  'VIDEO',
  'AUDIO',
  'IFRAME',
  'HR',
  'META',
  'LINK',
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TITLE',
  'HEAD',
]);

/** Extension UI that is never part of page text */
const EXTENSION_UI_SELECTOR = [
  `.${TRANSLATION_CLASS}`,
  '.illa-sentence-tooltip',
  '.wxt-translation-term',
  '.wxt-pronunciation-tooltip',
  '.wxt-word-tooltip',
  '.wxt-floating-ball',
  '.wxt-floating-panel',
  '.illa-paragraph-translation',
  '.illa-paragraph-loading',
  'wxt-floating-menu',
].join(',');

export interface TextSpan {
  node: Text;
  /** Offset of the node's first character in the flattened text */
  start: number;
  end: number;
}

export interface FlatText {
  text: string;
  spans: TextSpan[];
}

export interface SentenceSlice {
  start: number;
  end: number;
  /** Whitespace-normalised sentence text, as sent to the model */
  text: string;
}

export interface TextPiece {
  node: Text;
  from: number;
  to: number;
}

export function flattenBlock(block: Element): FlatText {
  const parts: string[] = [];
  const spans: TextSpan[] = [];
  let length = 0;

  const append = (value: string, node?: Text) => {
    if (!value) return;
    if (node) spans.push({ node, start: length, end: length + value.length });
    parts.push(value);
    length += value.length;
  };

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      // Source line breaks render as spaces, but Intl.Segmenter treats them as
      // hard sentence breaks. Replacing them one-for-one keeps offsets intact.
      append((node as Text).data.replace(/[\n\r\t\f\v]/g, ' '), node as Text);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const element = node as Element;
    const tag = element.tagName.toUpperCase();

    if (tag === 'BR') {
      append('\n');
      return;
    }
    if (element.matches(EXTENSION_UI_SELECTOR)) return;
    // Wrapped originals are hidden while translated but still page text
    if (element.classList.contains(ORIGINAL_CLASS)) {
      for (const child of Array.from(element.childNodes)) walk(child);
      return;
    }
    if (MEDIA_TAGS.has(tag) || isInvisible(element)) return;
    if (SKIP_TAGS.has(tag) || (element as HTMLElement).isContentEditable) {
      append(GAP);
      return;
    }

    for (const child of Array.from(element.childNodes)) walk(child);
  };

  for (const child of Array.from(block.childNodes)) walk(child);

  return { text: parts.join(''), spans };
}

/**
 * Splits flattened text into translatable sentences. Sentences that contain
 * untranslatable content, have fewer than `minWords` words or have no letters
 * are dropped.
 */
export function splitSentences(
  text: string,
  language: string,
  minWords = 3,
): SentenceSlice[] {
  const sentenceSegmenter = new Intl.Segmenter(safeLocale(language), {
    granularity: 'sentence',
  });
  const slices: SentenceSlice[] = [];

  for (const segment of sentenceSegmenter.segment(text)) {
    const raw = segment.segment;
    const leading = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    if (!trimmed) continue;

    const start = segment.index + leading;
    const end = start + trimmed.length;
    if (trimmed.includes(GAP)) continue;
    if (!/\p{L}/u.test(trimmed)) continue;
    if (countWords(trimmed, language) < minWords) continue;

    slices.push({ start, end, text: normalizeWhitespace(trimmed) });
  }

  return slices;
}

/** Maps a flattened [start, end) range to the text node pieces it covers. */
export function piecesForRange(
  spans: TextSpan[],
  start: number,
  end: number,
): TextPiece[] {
  const pieces: TextPiece[] = [];
  for (const span of spans) {
    if (span.end <= start) continue;
    if (span.start >= end) break;
    const from = Math.max(start, span.start) - span.start;
    const to = Math.min(end, span.end) - span.start;
    if (to > from) pieces.push({ node: span.node, from, to });
  }
  return pieces;
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function countWords(value: string, language: string): number {
  const wordSegmenter = new Intl.Segmenter(safeLocale(language), {
    granularity: 'word',
  });
  let count = 0;
  for (const segment of wordSegmenter.segment(value)) {
    if (segment.isWordLike) count += 1;
  }
  return count;
}

function safeLocale(language: string): string | undefined {
  try {
    return Intl.getCanonicalLocales(language)[0];
  } catch {
    return undefined;
  }
}

function isInvisible(element: Element): boolean {
  if (element.hasAttribute('hidden')) return true;
  if (element.getAttribute('aria-hidden') === 'true') return true;
  const style = element.ownerDocument.defaultView?.getComputedStyle?.(element);
  if (!style) return false;
  return style.display === 'none' || style.visibility === 'hidden';
}
