/**
 * TTS provider factory. Speech is synthesised locally with the browser's
 * Web Speech API; no audio is fetched from third-party services.
 */

import { ITTSProvider, TTSProviderConfig } from './ITTSProvider';
import { WebSpeechTTSProvider } from './WebSpeechTTSProvider';
import { TTSProviderType } from '../types';

export class TTSProviderFactory {
  static createProvider(
    providerType: TTSProviderType,
    config?: TTSProviderConfig,
  ): ITTSProvider {
    switch (providerType) {
      case 'web-speech':
        return new WebSpeechTTSProvider(config);

      default:
        throw new Error(`Unsupported TTS provider type: ${providerType}`);
    }
  }

  static getSupportedProviders(): TTSProviderType[] {
    return ['web-speech'];
  }

  static isProviderSupported(
    providerType: string,
  ): providerType is TTSProviderType {
    return this.getSupportedProviders().includes(
      providerType as TTSProviderType,
    );
  }

  static getProviderDisplayName(providerType: TTSProviderType): string {
    const displayNames: Record<TTSProviderType, string> = {
      'web-speech': 'Browser speech',
    };

    return displayNames[providerType] || providerType;
  }

  static getProviderDescription(providerType: TTSProviderType): string {
    const descriptions: Record<TTSProviderType, string> = {
      'web-speech':
        "Uses the browser's built-in speech synthesis, with a voice matching the target language",
    };

    return descriptions[providerType] || '';
  }
}
