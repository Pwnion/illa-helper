/**
 * Web Speech API TTS provider.
 * Wraps the browser's built-in speech synthesis.
 */

import { ITTSProvider, TTSProviderConfig } from './ITTSProvider';
import { TTSResult } from '../types';

export class WebSpeechTTSProvider implements ITTSProvider {
  readonly name = 'web-speech';

  private config: TTSProviderConfig;
  private synthesis: SpeechSynthesis | null;
  private voices: SpeechSynthesisVoice[] = [];
  private isInitialized = false;
  private currentUtterance: SpeechSynthesisUtterance | null = null;

  constructor(config: TTSProviderConfig = {}) {
    this.config = {
      lang: 'en-US',
      rate: 1.0,
      pitch: 1.0,
      volume: 1.0,
      ...config,
    };
    this.synthesis =
      typeof window !== 'undefined' && 'speechSynthesis' in window
        ? window.speechSynthesis
        : null;
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    if (this.isInitialized) return;

    await this.loadVoices();
    this.isInitialized = true;
  }

  private loadVoices(): Promise<void> {
    const synthesis = this.synthesis;
    if (!synthesis) return Promise.resolve();

    return new Promise((resolve) => {
      const loadVoicesHandler = () => {
        this.voices = synthesis.getVoices();
        if (this.voices.length > 0) {
          resolve();
        }
      };

      // Some browsers populate the voice list asynchronously
      if (synthesis.getVoices().length > 0) {
        loadVoicesHandler();
      } else {
        synthesis.onvoiceschanged = loadVoicesHandler;
        setTimeout(() => {
          if (this.voices.length === 0) {
            this.voices = synthesis.getVoices();
          }
          resolve();
        }, 1000);
      }
    });
  }

  async speak(
    text: string,
    config?: Partial<TTSProviderConfig>,
  ): Promise<TTSResult> {
    try {
      if (!text || typeof text !== 'string') {
        return {
          success: false,
          error: 'Invalid text',
        };
      }
      const synthesis = this.synthesis;
      if (!synthesis) {
        return { success: false, error: 'Speech synthesis is unavailable' };
      }

      await this.initialize();

      this.stop();

      const finalConfig = { ...this.config, ...config };
      const lang = finalConfig.lang || 'en-US';
      const utterance = new SpeechSynthesisUtterance(text);
      this.currentUtterance = utterance;

      utterance.lang = lang;
      utterance.rate = finalConfig.rate || 1.0;
      utterance.pitch = finalConfig.pitch || 1.0;
      utterance.volume = finalConfig.volume || 1.0;

      const voice = this.selectVoice(lang, finalConfig.voice);
      if (voice) {
        utterance.voice = voice;
      }

      return new Promise((resolve) => {
        utterance.onend = () => {
          this.currentUtterance = null;
          resolve({ success: true });
        };

        utterance.onerror = (event) => {
          this.currentUtterance = null;
          resolve({
            success: false,
            error: `Speech failed: ${event.error}`,
          });
        };

        synthesis.speak(utterance);
      });
    } catch (error) {
      this.currentUtterance = null;
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  stop(): void {
    if (this.synthesis?.speaking) {
      this.synthesis.cancel();
    }
    this.currentUtterance = null;
  }

  isSpeaking(): boolean {
    return this.synthesis?.speaking ?? false;
  }

  isAvailable(): boolean {
    return this.synthesis !== null;
  }

  updateConfig(config: Partial<TTSProviderConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): TTSProviderConfig {
    return { ...this.config };
  }

  getVoices(): SpeechSynthesisVoice[] {
    return this.voices;
  }

  /**
   * Voices whose language starts with the given tag. Some platforms report
   * "sv_SE" instead of "sv-SE", so separators are normalised first.
   */
  getVoicesByLanguage(lang: string): SpeechSynthesisVoice[] {
    const wanted = normalizeLangTag(lang);
    return this.voices.filter((voice) =>
      normalizeLangTag(voice.lang).startsWith(wanted),
    );
  }

  /**
   * Prefers an explicitly named voice, then an exact locale match, then any
   * voice for the base language. Local voices win over network voices.
   */
  private selectVoice(
    lang: string,
    preferredVoice?: string,
  ): SpeechSynthesisVoice | null {
    if (this.voices.length === 0) return null;

    if (preferredVoice) {
      const voice = this.voices.find((v) => v.name === preferredVoice);
      if (voice) return voice;
    }

    const exact = this.getVoicesByLanguage(lang).filter(
      (v) => normalizeLangTag(v.lang) === normalizeLangTag(lang),
    );
    const baseLanguage = normalizeLangTag(lang).split('-')[0];
    const candidates =
      exact.length > 0 ? exact : this.getVoicesByLanguage(baseLanguage);

    if (candidates.length === 0) return null;
    return candidates.find((v) => v.localService) || candidates[0];
  }
}

function normalizeLangTag(tag: string): string {
  return tag.replace('_', '-').toLowerCase();
}
