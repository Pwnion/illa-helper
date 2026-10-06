/**
 * Website management helpers:
 * URL pattern generation and domain extraction
 */

/**
 * Extracts the domain from a URL
 * @param url full URL
 * @returns the domain, or the original URL if parsing fails
 */
export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (error) {
    console.warn('URL parsing failed, using the original URL:', url, error);
    // Fallback: pull the domain out of the string
    const match = url.match(/(?:https?:\/\/)?(?:www\.)?([^\/]+)/);
    return match ? match[1] : url;
  }
}

/**
 * Builds a domain pattern (wildcard)
 * @param domain domain
 * @returns a pattern of the form *://example.com/*
 */
export function generateDomainPattern(domain: string): string {
  // Drop a leading www.
  const cleanDomain = domain.replace(/^www\./, '');
  return `*://${cleanDomain}/*`;
}

/**
 * Builds an exact URL pattern
 * @param url full URL
 * @returns exact URL pattern
 */
export function generateExactPattern(url: string): string {
  try {
    const urlObj = new URL(url);
    // Drop the query and fragment, keep the path, and add a wildcard to match everything under it
    const basePath = urlObj.pathname.endsWith('/')
      ? urlObj.pathname
      : `${urlObj.pathname}*`;
    return `${urlObj.protocol}//${urlObj.host}${basePath}`;
  } catch (error) {
    console.warn('URL parsing failed, using the original URL:', url, error);
    return url;
  }
}

/**
 * Builds a readable rule description
 * @param pattern URL pattern
 * @param type rule type
 * @returns description
 */
export function generateRuleDescription(
  pattern: string,
  type: 'blacklist' | 'whitelist',
): string {
  const typeText = type === 'blacklist' ? 'Blacklist' : 'Whitelist';

  if (pattern.includes('*://') && pattern.endsWith('/*')) {
    // Domain pattern *://example.com/*
    const domain = pattern.replace(/^\*:\/\//, '').replace(/\/\*$/, '');
    return `${typeText} - domain: ${domain}`;
  } else {
    return `${typeText} - page: ${pattern}`;
  }
}

/**
 * Whether a URL uses a special scheme or is a local address
 * @param url URL
 * @returns whether it is special
 */
export function isSpecialUrl(url: string): boolean {
  const specialProtocols = [
    'chrome:',
    'chrome-extension:',
    'moz-extension:',
    'edge:',
    'about:',
  ];
  const isLocalhost = url.includes('localhost') || url.includes('127.0.0.1');
  const hasSpecialProtocol = specialProtocols.some((protocol) =>
    url.startsWith(protocol),
  );

  return isLocalhost || hasSpecialProtocol;
}

/**
 * Whether a URL can be added to the rules
 * @param url URL
 * @returns validation result and error message
 */
export function validateUrlForRule(url: string): {
  valid: boolean;
  error?: string;
} {
  if (!url || url.trim() === '') {
    return { valid: false, error: 'URL must not be empty' };
  }

  if (isSpecialUrl(url)) {
    return {
      valid: false,
      error:
        'Rules cannot be created for internal browser pages or local addresses',
    };
  }

  try {
    new URL(url);
    return { valid: true };
  } catch (_) {
    return { valid: false, error: 'Invalid URL' };
  }
}
