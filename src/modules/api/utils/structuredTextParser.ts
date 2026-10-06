/**
 * Simple text parser
 * for the "original||translation" format
 */

export interface ParsedReplacement {
  original: string;
  translation: string;
}

export interface ParseResult {
  success: boolean;
  replacements: ParsedReplacement[];
  errors: string[];
}

/**
 * Simple text parser
 */
export class StructuredTextParser {
  /**
   * Parses double-pipe formatted text
   * @param text the model's output
   * @returns parse result
   */
  public static parse(text: string): ParseResult {
    const result: ParseResult = {
      success: false,
      replacements: [],
      errors: [],
    };

    try {
      // Clean the text
      const cleanedText = this.cleanText(text);

      // Parse replacements
      const replacements = this.parseDoubleBarFormat(cleanedText);

      result.replacements = replacements.filter(
        (r: ParsedReplacement) => r.original && r.translation,
      );
      result.success = result.replacements.length > 0;

      if (result.replacements.length === 0) {
        result.errors.push('No valid replacements found');
      }
    } catch (error) {
      result.errors.push(
        `Parse error: ${error instanceof Error ? error.message : String(error)}`,
      );
      console.error('[Double-pipe parser] Parse failed:', error);
    }

    return result;
  }

  /**
   * Removes surplus whitespace and formatting characters
   */
  private static cleanText(text: string): string {
    return text
      .replace(/```[\s\S]*?```/g, '') // code fences
      .replace(/^\s*[\r\n]/gm, '') // blank lines
      .trim();
  }

  /**
   * Parses the double-pipe format: original||translation
   */
  private static parseDoubleBarFormat(text: string): ParsedReplacement[] {
    const replacements: ParsedReplacement[] = [];

    // Split into lines
    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line);

    for (const line of lines) {
      // Try the double-pipe separator first
      if (line.includes('||')) {
        const parts = line.split('||');
        if (parts.length >= 2) {
          const original = parts[0].trim();
          const translation = parts[1].trim();
          if (original && translation) {
            // [Double-pipe parser] found a replacement
            replacements.push({ original, translation });
            continue;
          }
        }
      }

      // Fallback separators
      const fallbackResult = this.parseFallbackSeparators(line);
      if (fallbackResult) {
        replacements.push(fallbackResult);
      }
    }

    return replacements;
  }

  /**
   * Parses fallback separator formats
   */
  private static parseFallbackSeparators(
    line: string,
  ): ParsedReplacement | null {
    // Common separators, in priority order
    const separators = ['→', '->', ':', '=', '|'];

    for (const sep of separators) {
      if (line.includes(sep)) {
        const parts = line.split(sep);
        if (parts.length >= 2) {
          const original = parts[0].trim();
          const translation = parts[1].trim();
          if (original && translation) {
            return { original, translation };
          }
        }
      }
    }

    return null;
  }

  /**
   * Validates the parse result
   */
  public static validateResult(
    result: ParseResult,
    expectedMinimum: number = 1,
  ): boolean {
    if (!result.success) {
      console.warn('[Double-pipe parser] Parse failed:', result.errors);
      return false;
    }

    if (result.replacements.length < expectedMinimum) {
      return false;
    }

    // Validate each replacement
    for (const replacement of result.replacements) {
      if (!replacement.original || !replacement.translation) {
        console.warn('[Double-pipe parser] Invalid replacement:', replacement);
        return false;
      }

      if (
        replacement.original.length < 1 ||
        replacement.translation.length < 1
      ) {
        console.warn(
          '[Double-pipe parser] Replacement too short:',
          replacement,
        );
        return false;
      }
    }

    return true;
  }
}
