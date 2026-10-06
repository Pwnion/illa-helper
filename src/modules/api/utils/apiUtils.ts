/**
 * API helpers
 */

/**
 * Merges custom parameters into the base parameter object
 */
export function mergeCustomParams(
  baseParams: any,
  customParamsJson?: string,
): any {
  const merged = { ...baseParams };
  const protectedKeys = ['model', 'messages', 'apiKey'];

  if (!customParamsJson?.trim()) return merged;

  try {
    const customParams = JSON.parse(customParamsJson);
    Object.entries(customParams).forEach(([key, value]) => {
      if (!protectedKeys.includes(key)) {
        merged[key] = value;
      } else {
        console.warn(`Ignoring protected parameter: ${key}`);
      }
    });
  } catch (error) {
    console.warn('Failed to parse custom parameter JSON:', error);
  }

  return merged;
}

/**
 * Creates a generic error response
 */
export function createErrorResponse(originalText: string) {
  return {
    original: originalText,
    processed: originalText,
    replacements: [],
  };
}

/**
 * Validates the text and configuration
 */
export function validateInputs(text: string, apiKey?: string): boolean {
  return !!(text?.trim() && apiKey?.trim());
}
