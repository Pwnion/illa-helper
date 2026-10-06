/**
 * Maps an app language code to the BCP 47 locale used to pick a
 * speech-synthesis voice. Unknown codes pass through unchanged; the voice
 * picker falls back to any voice whose language starts with the code.
 */
const SPEECH_LOCALES: Record<string, string> = {
  en: 'en-US',
  sv: 'sv-SE',
  no: 'nb-NO',
  da: 'da-DK',
  fi: 'fi-FI',
  is: 'is-IS',
  de: 'de-DE',
  nl: 'nl-NL',
  fr: 'fr-FR',
  es: 'es-ES',
  it: 'it-IT',
  pt: 'pt-PT',
  pl: 'pl-PL',
  cs: 'cs-CZ',
  ru: 'ru-RU',
  uk: 'uk-UA',
  ja: 'ja-JP',
  ko: 'ko-KR',
  zh: 'zh-CN',
};

export function getSpeechLocale(languageCode: string | undefined): string {
  if (!languageCode) return 'en-US';
  const base = languageCode.toLowerCase().split(/[-_]/)[0];
  return SPEECH_LOCALES[base] || languageCode;
}

/** Phonetic transcriptions come from an English-only dictionary. */
export function supportsPhonetics(languageCode: string | undefined): boolean {
  return (languageCode || '').toLowerCase().startsWith('en');
}
