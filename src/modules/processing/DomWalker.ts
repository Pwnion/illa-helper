/**
 * DOM walker: shared DOM traversal and labelling.
 *
 * Based on read-frog's walk-label design:
 * 1. depth-first traversal of the DOM tree
 * 2. block/inline decided by getComputedStyle (semantic tags are forced to block)
 * 3. nodes with inline content are labelled "paragraph" (the basic translation unit)
 * 4. a walkId prevents concurrent or repeated walks
 *
 * Word, sentence and paragraph translation all get their DOM nodes from this module.
 */

import {
  ATOMIC_INLINE_TAGS,
  FORCE_BLOCK_TAGS,
  DOM_LABELS,
} from '../shared/constants';
import {
  isHTMLElement,
  isTranslatableTextNode,
  shouldSkipSubtree,
} from './DomTranslationPolicy';

// ============================================================
// Types
// ============================================================

export interface WalkResult {
  /** Whether the node is forced to block */
  forceBlock: boolean;
  /** Whether the node is inline */
  isInline: boolean;
}

export interface ParagraphInfo {
  /** Paragraph element */
  element: HTMLElement;
  /** Extracted text */
  textContent: string;
  /** Text nodes in the paragraph */
  textNodes: Text[];
}

let fallbackWalkId = 0;

function createWalkId(): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (typeof randomUUID === 'function') {
    return randomUUID.call(globalThis.crypto);
  }

  fallbackWalkId += 1;
  return `fallback-${Date.now()}-${fallbackWalkId}`;
}

// ============================================================
// Element classification
// ============================================================

/** Whether to skip entirely (not walked, not translated) */
function shouldSkipEntirely(element: HTMLElement): boolean {
  return shouldSkipSubtree(element);
}

/** Atomic inline element (not walked into, but its text joins the parent's translation) */
function isAtomicInline(element: HTMLElement): boolean {
  return ATOMIC_INLINE_TAGS.has(element.tagName);
}

/** Whether the element is inline, by computed style */
function isInlineElement(element: HTMLElement): boolean {
  // Elements without text are not inline
  if (!element.textContent?.trim()) return false;

  // Forced block tags
  if (FORCE_BLOCK_TAGS.has(element.tagName)) return false;

  const style = window.getComputedStyle(element);
  const display = style.display;

  // inline / inline-block / inline-flex / contents count as inline
  return display.includes('inline') || display === 'contents';
}

// ============================================================
// Text extraction
// ============================================================

/**
 * Extracts a paragraph's text, keeping meaningful whitespace
 */
function extractTextFromNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? '';
    const trimmed = text.trim();
    if (!trimmed) return '';

    // Keep meaningful leading/trailing spaces (not newlines)
    const hasLeading = /^\s/.test(text) && !/^\n/.test(text);
    const hasTrailing = /\s$/.test(text) && !/\n$/.test(text);
    return (hasLeading ? ' ' : '') + trimmed + (hasTrailing ? ' ' : '');
  }

  if (!isHTMLElement(node)) return '';

  const element = node as HTMLElement;

  if (element.tagName === 'BR') return '\n';

  // Skip ignored elements
  if (shouldSkipEntirely(element)) return '';

  // Atomic inline element: take its text directly
  if (isAtomicInline(element)) {
    return element.textContent?.trim() ?? '';
  }

  // Recurse into children
  let result = '';
  for (const child of element.childNodes) {
    result += extractTextFromNode(child);
  }
  return result;
}

/**
 * Collects the text nodes in a paragraph
 */
function collectTextNodes(element: HTMLElement): Text[] {
  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      return isTranslatableTextNode(node as Text, element)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  let node: Node | null;
  while ((node = walker.nextNode())) {
    textNodes.push(node as Text);
  }
  return textNodes;
}

// ============================================================
// Core traversal
// ============================================================

/**
 * Walks and labels DOM elements.
 *
 * Recursively labels every node in the element's subtree:
 * - data-illa-walked: walked (value is the walkId)
 * - data-illa-paragraph: paragraph node (has inline content; a translation unit)
 * - data-illa-block: block-level node
 * - data-illa-inline: inline node
 */
function walkAndLabel(element: HTMLElement, walkId: string): WalkResult {
  // Already walked in this pass
  if (element.getAttribute(DOM_LABELS.WALKED) === walkId) {
    return { forceBlock: false, isInline: false };
  }

  // Atomic inline: do not walk into it, label as inline
  if (isAtomicInline(element)) {
    return { forceBlock: false, isInline: true };
  }

  // Skip entirely
  if (shouldSkipEntirely(element)) {
    return { forceBlock: false, isInline: false };
  }

  // Mark as walked
  element.setAttribute(DOM_LABELS.WALKED, walkId);

  let hasInlineChild = false;

  // Walk the children
  for (const child of element.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      if (child.textContent?.trim()) {
        hasInlineChild = true;
      }
    } else if (isHTMLElement(child)) {
      const result = walkAndLabel(child, walkId);
      if (result.isInline) {
        hasInlineChild = true;
      }
    }
  }

  // Label paragraphs: nodes with inline content
  if (hasInlineChild) {
    element.setAttribute(DOM_LABELS.PARAGRAPH, '');
  }

  // Decide block vs inline
  const inline = isInlineElement(element);
  if (inline) {
    element.setAttribute(DOM_LABELS.INLINE, '');
  } else {
    element.setAttribute(DOM_LABELS.BLOCK, '');
  }

  return { forceBlock: false, isInline: inline };
}

/**
 * Clears walk labels
 */
function clearLabels(root: HTMLElement): void {
  const labeled = root.querySelectorAll(
    `[${DOM_LABELS.WALKED}], [${DOM_LABELS.PARAGRAPH}], [${DOM_LABELS.BLOCK}], [${DOM_LABELS.INLINE}]`,
  );
  for (const el of labeled) {
    el.removeAttribute(DOM_LABELS.WALKED);
    el.removeAttribute(DOM_LABELS.PARAGRAPH);
    el.removeAttribute(DOM_LABELS.BLOCK);
    el.removeAttribute(DOM_LABELS.INLINE);
  }
  // Clear the root too
  root.removeAttribute(DOM_LABELS.WALKED);
  root.removeAttribute(DOM_LABELS.PARAGRAPH);
  root.removeAttribute(DOM_LABELS.BLOCK);
  root.removeAttribute(DOM_LABELS.INLINE);
}

// ============================================================
// Public API
// ============================================================

/**
 * Walks the DOM and collects every paragraph.
 *
 * Shared entry point for the translation modes:
 * - word mode builds ContentSegments from the returned ParagraphInfo
 * - sentence and paragraph modes use ParagraphInfo.element as the unit
 *
 * @param root traversal root
 * @returns paragraphs in document order
 */
export function walkAndCollectParagraphs(root: HTMLElement): ParagraphInfo[] {
  const walkId = createWalkId();

  // Step 1: walk and label
  walkAndLabel(root, walkId);

  // Step 2: collect paragraph nodes
  const paragraphElements = [
    ...(root.hasAttribute(DOM_LABELS.PARAGRAPH) ? [root] : []),
    ...Array.from(
      root.querySelectorAll<HTMLElement>(`[${DOM_LABELS.PARAGRAPH}]`),
    ),
  ];

  const paragraphs: ParagraphInfo[] = [];

  for (const element of paragraphElements) {
    // Skip nodes that contain other paragraphs (leaf paragraphs only),
    // but keep paragraphs with block children (callers handle mixed content)
    const childParagraphs = element.querySelectorAll(
      `[${DOM_LABELS.PARAGRAPH}]`,
    );
    if (childParagraphs.length > 0) {
      // Check whether all child paragraphs are inline (making this node the real paragraph)
      let hasBlockParagraphChild = false;
      for (const cp of childParagraphs) {
        if (cp.hasAttribute(DOM_LABELS.BLOCK)) {
          hasBlockParagraphChild = true;
          break;
        }
      }
      // With a block child paragraph, skip this node and let the children be processed
      if (hasBlockParagraphChild) continue;
    }

    const textContent = extractTextFromNode(element);
    if (!textContent.trim() || textContent.trim().length < 2) continue;

    const textNodes = collectTextNodes(element);
    if (textNodes.length === 0) continue;

    paragraphs.push({ element, textContent, textNodes });
  }

  // Step 3: clear labels so the DOM is left clean
  clearLabels(root);

  return paragraphs;
}

/**
 * Helpers for other modules
 */
export {
  shouldSkipEntirely,
  isInlineElement,
  isHTMLElement,
  extractTextFromNode,
  collectTextNodes,
};
