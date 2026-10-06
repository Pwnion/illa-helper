/**
 * Word card for sentence mode. Shows the lemma, gloss, CEFR level and status
 * from the cached analysis, with actions to speak, mark the word known or
 * unknown, load grammar notes and reveal the original sentence.
 *
 * All page and model text is written with textContent.
 */

import type { AnalysedToken, LemmaStatus } from './types';

const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export type WordCardStatus = LemmaStatus | 'new' | 'assumed';

const STATUS_LABELS: Record<WordCardStatus, string> = {
  new: 'New word',
  assumed: 'Likely known',
  seen: 'Seen',
  unknown: 'Unknown',
  learning: 'Learning',
  known: 'Known',
};

export interface WordCardActions {
  speak(): void;
  markKnown(): void;
  markUnknown(): void;
  loadGrammar(): Promise<string | null>;
  showOriginal(): void;
}

export interface WordCardContent {
  token: AnalysedToken;
  status: WordCardStatus;
}

export class SentenceTooltip {
  private element: HTMLElement | null = null;
  private hideTimer: number | null = null;
  private onEnter = () => this.cancelHide();
  private onLeave = () => this.scheduleHide();

  show(
    anchor: HTMLElement,
    content: WordCardContent,
    actions: WordCardActions,
  ) {
    this.cancelHide();
    this.element?.remove();

    const doc = anchor.ownerDocument;
    const card = doc.createElement('div');
    card.className = 'illa-sentence-tooltip';
    card.setAttribute('role', 'dialog');
    card.style.cssText = CARD_STYLE;

    const { token } = content;
    const header = el(doc, 'div', 'illa-st-header', HEADER_STYLE);
    header.appendChild(el(doc, 'strong', '', '', token.lemma));
    if (token.surface.toLowerCase() !== token.lemma.toLowerCase()) {
      header.appendChild(
        el(doc, 'span', '', 'opacity:0.65;margin-left:6px', token.surface),
      );
    }
    card.appendChild(header);

    if (token.gloss) {
      card.appendChild(el(doc, 'div', '', 'margin:4px 0 2px', token.gloss));
    }

    const meta = el(doc, 'div', '', 'display:flex;gap:6px;margin:6px 0');
    meta.appendChild(
      el(doc, 'span', '', BADGE_STYLE, CEFR[token.cefr - 1] ?? '?'),
    );
    meta.appendChild(
      el(doc, 'span', '', BADGE_STYLE, STATUS_LABELS[content.status]),
    );
    if (token.cognate)
      meta.appendChild(el(doc, 'span', '', BADGE_STYLE, 'Cognate'));
    card.appendChild(meta);

    const notes = el(doc, 'div', '', NOTES_STYLE);
    notes.hidden = true;

    const buttons = el(doc, 'div', '', 'display:flex;flex-wrap:wrap;gap:4px');
    buttons.appendChild(button(doc, 'Speak', () => actions.speak()));
    buttons.appendChild(
      button(doc, 'Known', () => {
        actions.markKnown();
        this.hide();
      }),
    );
    buttons.appendChild(
      button(doc, 'Unknown', () => {
        actions.markUnknown();
        this.hide();
      }),
    );
    buttons.appendChild(
      button(doc, 'Grammar', async (target) => {
        target.disabled = true;
        notes.hidden = false;
        notes.textContent = 'Loading...';
        const text = await actions.loadGrammar();
        notes.textContent = text ?? 'Grammar notes are unavailable.';
      }),
    );
    buttons.appendChild(
      button(doc, 'Original', () => {
        actions.showOriginal();
        this.hide();
      }),
    );
    card.appendChild(buttons);
    card.appendChild(notes);

    card.addEventListener('mouseenter', this.onEnter);
    card.addEventListener('mouseleave', this.onLeave);
    doc.body.appendChild(card);
    position(card, anchor);
    this.element = card;
  }

  isOpen(): boolean {
    return this.element !== null;
  }

  contains(node: Node | null): boolean {
    return !!node && !!this.element?.contains(node);
  }

  scheduleHide(delay = 350): void {
    this.cancelHide();
    this.hideTimer = window.setTimeout(() => this.hide(), delay);
  }

  cancelHide(): void {
    if (this.hideTimer !== null) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }

  hide(): void {
    this.cancelHide();
    this.element?.remove();
    this.element = null;
  }

  destroy(): void {
    this.hide();
  }
}

function el(
  doc: Document,
  tag: string,
  className: string,
  style: string,
  text?: string,
): HTMLElement {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (style) node.style.cssText = style;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(
  doc: Document,
  label: string,
  onClick: (target: HTMLButtonElement) => void,
): HTMLButtonElement {
  const node = doc.createElement('button');
  node.type = 'button';
  node.textContent = label;
  node.style.cssText = BUTTON_STYLE;
  node.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick(node);
  });
  return node;
}

function position(card: HTMLElement, anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  const width = card.offsetWidth || 260;
  const height = card.offsetHeight || 120;
  const left = Math.min(
    Math.max(8, rect.left + rect.width / 2 - width / 2),
    window.innerWidth - width - 8,
  );
  const above = rect.top - height - 8;
  const top = above >= 8 ? above : rect.bottom + 8;
  card.style.left = `${left + window.scrollX}px`;
  card.style.top = `${top + window.scrollY}px`;
}

const CARD_STYLE = [
  'position:absolute',
  'z-index:2147483646',
  'max-width:300px',
  'min-width:180px',
  'padding:10px 12px',
  'border-radius:10px',
  'background:rgba(24,24,28,0.96)',
  'color:#f2f2f7',
  'font:13px/1.45 system-ui,-apple-system,sans-serif',
  'box-shadow:0 8px 24px rgba(0,0,0,0.3)',
  'text-align:left',
].join(';');

const HEADER_STYLE = 'font-size:15px';
const BADGE_STYLE =
  'padding:1px 6px;border-radius:6px;background:rgba(255,255,255,0.12);font-size:11px';
const BUTTON_STYLE = [
  'padding:3px 8px',
  'border:1px solid rgba(255,255,255,0.2)',
  'border-radius:6px',
  'background:rgba(255,255,255,0.06)',
  'color:inherit',
  'font:inherit',
  'font-size:12px',
  'cursor:pointer',
].join(';');
const NOTES_STYLE =
  'margin-top:8px;white-space:pre-line;font-size:12px;color:#d1d1d6';
