/**
 * Shared constants
 * used across modules
 */

// ============================================================
// DOM walker rules shared by every traversal
// ============================================================

/**
 * Tags that are skipped entirely (not walked, not translated).
 * These elements and their subtrees are ignored.
 */
export const SKIP_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'META',
  'LINK',
  'NOSCRIPT',
  'TITLE',
  'HEAD',
  'HR',
  'BUTTON',
  'INPUT',
  'LABEL',
  'FORM',
  'TEXTAREA',
  'SELECT',
  'OPTION',
  'IMG',
  'SVG',
  'CANVAS',
  'VIDEO',
  'AUDIO',
  'IFRAME',
  'MATH',
  'PRE',
  'CODE',
  'KBD',
]);

/**
 * Tags that are not walked into but whose text is kept;
 * their text is included when the parent is translated
 */
export const ATOMIC_INLINE_TAGS = new Set(['TIME', 'ABBR']);

/**
 * Tags always treated as block-level regardless of CSS display
 */
export const FORCE_BLOCK_TAGS = new Set([
  'BODY',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'P',
  'DIV',
  'SECTION',
  'ARTICLE',
  'MAIN',
  'ASIDE',
  'HEADER',
  'FOOTER',
  'NAV',
  'BLOCKQUOTE',
  'UL',
  'OL',
  'LI',
  'DL',
  'DT',
  'DD',
  'TABLE',
  'THEAD',
  'TBODY',
  'TR',
  'TD',
  'TH',
  'FIGURE',
  'FIGCAPTION',
  'DETAILS',
  'SUMMARY',
  'FORM',
  'FIELDSET',
  'ADDRESS',
  'HGROUP',
]);

/**
 * DOM label attribute names
 */
export const DOM_LABELS = {
  WALKED: 'data-illa-walked',
  PARAGRAPH: 'data-illa-paragraph',
  BLOCK: 'data-illa-block',
  INLINE: 'data-illa-inline',
} as const;

// Paragraph translation constants
export const PARAGRAPH_TRANSLATION = {
  // CSS class names
  WRAPPER_CLASS: 'illa-paragraph-translation',
};
