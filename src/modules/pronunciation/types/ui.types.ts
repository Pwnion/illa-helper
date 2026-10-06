/**
 * Pronunciation UI types
 */

import { PhoneticInfo } from './phonetic.types';

// Data attached to an element with pronunciation support
export interface PronunciationElementData {
  word: string;
  element: HTMLElement;
  phonetic?: PhoneticInfo;
  tooltip?: HTMLElement;
  isMouseOver?: boolean; // whether the pointer is over the element
  originalText?: string; // the source-language text before translation
}

// Tooltip type
export type TooltipType = 'phrase' | 'word';

// Tooltip state
export interface TooltipState {
  visible: boolean;
  element: HTMLElement | null;
  type: TooltipType;
}

// Interaction event type
export type InteractionEventType = 'mouseenter' | 'mouseleave' | 'click';

// Interaction event handler
export interface InteractionEventHandler {
  type: InteractionEventType;
  handler: (event: Event) => void;
}
