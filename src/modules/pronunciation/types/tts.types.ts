/**
 * TTS types.
 */

export interface TTSResult {
  success: boolean;
  error?: string;
}

export type TTSProviderType = 'web-speech';

export interface TTSProviderStatus {
  name: string;
  available: boolean;
  speaking: boolean;
}
