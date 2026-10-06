/**
 * Floating ball module entry point
 */

// Types
export type {
  FloatingBallConfig,
  FloatingBallState,
  FloatingBallEventType,
} from './types';

// Configuration
export {
  DEFAULT_FLOATING_BALL_CONFIG,
  FLOATING_BALL_STYLES,
  DRAG_CONFIG,
} from './config';

// Manager
export { FloatingBallManager } from './managers/FloatingBallManager';
