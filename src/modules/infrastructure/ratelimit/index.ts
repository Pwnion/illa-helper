/**
 * Rate limiting entry point.
 * Exports everything related to rate limiting.
 */

// Services
export {
  default as RateLimiterService,
  rateLimiterService,
  rateLimitManager,
  SimpleRateLimiter,
  debugRateLimiters,
} from './RateLimiterService';

// Types
export type {
  RateLimiterConfig,
  RateLimiterStatus,
  BatchExecutionConfig,
  BatchExecutionResult,
  BatchProgress,
  RequestFunction,
  ProgressCallback,
  RateLimiterServiceConfig,
  RateLimiterEventData,
  RateLimiterEventListener,
  RateLimiterStats,
  EndpointStats,
  ManagerStatus,
} from './types';

export { RateLimiterEventType } from './types';

// Default export
export { rateLimiterService as default } from './RateLimiterService';
