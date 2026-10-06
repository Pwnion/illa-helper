/**
 * Phonetic provider interface
 * (strategy pattern, so different phonetics APIs can be plugged in)
 */

import { PhoneticResult } from '../types';

export interface IPhoneticProvider {
  /**
   * Provider name
   */
  readonly name: string;

  /**
   * Looks up phonetics for a word
   * @param word the word to look up
   * @returns Promise<PhoneticResult> lookup result
   */
  getPhonetic(word: string): Promise<PhoneticResult>;

  /**
   * Looks up phonetics for several words
   * @param words the words to look up
   * @returns Promise<PhoneticResult[]> lookup results
   */
  getBatchPhonetics(words: string[]): Promise<PhoneticResult[]>;

  /**
   * Whether the provider is available
   * @returns Promise<boolean> availability
   */
  isAvailable(): Promise<boolean>;

  /**
   * Provider configuration
   * @returns the provider's configuration
   */
  getConfig(): {
    endpoint?: string;
    rateLimitPerMinute?: number;
    supportsBatch?: boolean;
    supportsAudio?: boolean;
  };
}
