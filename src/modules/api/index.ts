/**
 * API module exports
 */

// Types and interfaces
export { ITranslationProvider } from './types';

// Factory and services
export { ApiServiceFactory } from './factory/ApiServiceFactory';
export {
  UniversalApiService,
  universalApi,
  callAI,
  quickAI,
  type UniversalApiOptions,
  type UniversalApiResult,
} from './services/UniversalApiService';

// Providers
export { GoogleGeminiProvider, OpenAIProvider } from './providers';

// Base class
export { BaseProvider } from './base/BaseProvider';

// Helpers
export {
  mergeCustomParams,
  createErrorResponse,
  validateInputs,
} from './utils/apiUtils';
export { addPositionsToReplacements } from './utils/textUtils';
export { sendApiRequest } from './utils/requestUtils';
