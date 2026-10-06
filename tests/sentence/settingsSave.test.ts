import { describe, expect, it } from 'vitest';
import { nextTick, ref, toRaw, watch } from 'vue';
import {
  DEFAULT_SENTENCE_MODE_CONFIG,
  withNormalizedSentenceMode,
} from '@/src/modules/sentence/config';

describe('withNormalizedSentenceMode', () => {
  it('normalises without mutating the input', () => {
    const sentenceMode = { ...DEFAULT_SENTENCE_MODE_CONFIG, maxNewWords: 99 };
    const settings = { other: 1, sentenceMode };

    const result = withNormalizedSentenceMode(settings);

    expect(result.sentenceMode.maxNewWords).toBe(10);
    expect(settings.sentenceMode).toBe(sentenceMode);
    expect(sentenceMode.maxNewWords).toBe(99);
  });

  // Regression: the settings tab froze because its deep watcher wrote the
  // normalised config back into the watched settings, re-triggering itself.
  it('lets a deep settings watcher fire once per change', async () => {
    const settings = ref({ sentenceMode: { ...DEFAULT_SENTENCE_MODE_CONFIG } });
    let runs = 0;
    let saved: unknown;
    watch(
      settings,
      (value) => {
        runs += 1;
        if (runs > 5) return; // keep a regression from hanging the test
        saved = withNormalizedSentenceMode(toRaw(value));
      },
      { deep: true },
    );

    settings.value.sentenceMode.maxNewWords = 2;
    await nextTick();
    await nextTick();

    expect(runs).toBe(1);
    expect(saved).toMatchObject({ sentenceMode: { maxNewWords: 2 } });
  });
});
