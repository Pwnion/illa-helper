/**
 * Cache keys for sentence analyses.
 *
 * Content scripts on http pages have no crypto.subtle, so this uses two
 * independently seeded 53-bit hashes (cyrb53) for a ~106-bit key, plenty for
 * a cache of a few thousand sentences.
 */

export interface AnalysisKeyInput {
  promptVersion: number;
  model: string;
  sourceLanguage: string;
  targetLanguage: string;
  /** Glosses are written in the native language, so it is part of the key */
  nativeLanguage: string;
  text: string;
}

export function analysisCacheKey(input: AnalysisKeyInput): string {
  const material = [
    `v${input.promptVersion}`,
    input.model,
    input.sourceLanguage.toLowerCase(),
    input.targetLanguage.toLowerCase(),
    input.nativeLanguage.toLowerCase(),
    input.text,
  ].join('\u0000');

  return (
    cyrb53(material, 0x9e3779b1).toString(16).padStart(14, '0') +
    cyrb53(material, 0x85ebca77).toString(16).padStart(14, '0')
  );
}

export function cyrb53(value: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < value.length; i++) {
    const ch = value.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
