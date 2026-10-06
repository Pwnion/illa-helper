export function cleanParagraphTranslationResult(
  translatedText: string,
  originalText: string,
): string {
  if (!translatedText || !translatedText.trim()) {
    return '';
  }

  let cleanedResult = translatedText.trim();

  const thinkMatch = cleanedResult.match(/<\/think>([\s\S]*)/);
  if (thinkMatch) {
    cleanedResult = thinkMatch[1].trim();
  }

  cleanedResult = dedupeRepeatedParagraphLines(cleanedResult);

  if (cleanedResult === originalText && originalText.length < 50) {
    console.log(
      `[ParagraphTranslationApi] Translation identical to the source; it may not need translating: "${originalText}"`,
    );
    return '';
  }

  if (cleanedResult.length < 3) {
    console.warn(
      `[ParagraphTranslationApi] Translation too short: "${cleanedResult}"`,
    );
    return '';
  }

  return cleanedResult;
}

function dedupeRepeatedParagraphLines(text: string): string {
  const lines = text
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length <= 1) {
    return text;
  }

  return lines.every((line) => line === lines[0]) ? lines[0] : text;
}
