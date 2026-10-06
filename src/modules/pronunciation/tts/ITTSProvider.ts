/**
 * Text-to-speech provider interface.
 */

import { TTSResult } from '../types';

export interface TTSProviderConfig {
  /** BCP 47 language tag, e.g. "sv-SE" */
  lang?: string;
  voice?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
}

export interface ITTSProvider {
  readonly name: string;

  speak(text: string, config?: Partial<TTSProviderConfig>): Promise<TTSResult>;

  stop(): void;

  isSpeaking(): boolean;

  isAvailable(): boolean;

  updateConfig(config: Partial<TTSProviderConfig>): void;

  getConfig(): TTSProviderConfig;
}
