/**
 * Floating ball types
 */

// Floating ball configuration
export interface FloatingBallConfig {
  enabled: boolean; // whether the floating ball is shown
  position: number; // vertical position as a percentage (0-100)
  opacity: number; // opacity (0.1-1.0)
}

// Floating ball event type
export type FloatingBallEventType = 'translate' | 'drag' | 'click' | 'menu';

// Floating ball action type
export type FloatingBallActionType =
  | 'translate' // trigger translation
  | 'settings' // open settings
  | 'close' // close the floating ball
  | 'toggle_menu' // toggle the menu
  | 'options'; // open the options page

// Floating ball state
export interface FloatingBallState {
  isDragging: boolean;
  isVisible: boolean;
  isMenuExpanded: boolean; // whether the menu is expanded
  currentPosition: number;
}
