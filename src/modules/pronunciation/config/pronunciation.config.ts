/**
 * Pronunciation module configuration.
 */

import type { TooltipHotkey } from '../../shared/types/ui';
import { DEFAULT_PRONUNCIATION_HOTKEY } from '../../shared/constants/defaults';

export interface TTSConfig {
  provider: 'web-speech';
  /** BCP 47 locale of the language being spoken, e.g. "sv-SE" */
  lang?: string;
  voice?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
}

export interface PronunciationUIConfig {
  /** Phonetics are only available when the target language is English */
  showPhonetic: boolean;
  showPlayButton: boolean;
  tooltipEnabled: boolean;
  inlineDisplay: boolean;
  hotkey?: TooltipHotkey;
}

export interface PronunciationConfig {
  ttsConfig: TTSConfig;
  uiConfig: PronunciationUIConfig;
}

export const DEFAULT_TTS_CONFIG: TTSConfig = {
  provider: 'web-speech',
  lang: 'sv-SE',
  rate: 1.0,
  pitch: 1.0,
  volume: 1.0,
};

export const DEFAULT_UI_CONFIG: PronunciationUIConfig = {
  showPhonetic: false,
  showPlayButton: true,
  tooltipEnabled: true,
  inlineDisplay: false, // phonetics are shown in the tooltip only
  hotkey: DEFAULT_PRONUNCIATION_HOTKEY,
};

export const DEFAULT_PRONUNCIATION_CONFIG: PronunciationConfig = {
  ttsConfig: DEFAULT_TTS_CONFIG,
  uiConfig: DEFAULT_UI_CONFIG,
};
