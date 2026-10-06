import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { SentenceTranslationService } from '@/src/modules/sentence/SentenceTranslationService';
import { SentenceStore } from '@/src/modules/sentence/store/SentenceStore';
import {
  SentenceStoreClient,
  handleSentenceStoreRequest,
} from '@/src/modules/sentence/store/SentenceStoreClient';
import type { ModelCaller } from '@/src/modules/sentence/SentenceAnalyzer';
import { DEFAULT_SETTINGS } from '@/src/modules/shared/constants/defaults';
import { DEFAULT_SENTENCE_MODE_CONFIG } from '@/src/modules/sentence/config';
import type { UserSettings } from '@/src/modules/shared/types/storage';
import type { GrammarTagId } from '@/src/modules/sentence/grammar';
import { setBody } from './fixtures';

type Token = [string, string, string, number, number];

/** Canned model output keyed by source sentence. */
const CANNED: Record<string, [string, Token[], GrammarTagId[]]> = {
  'The cat is sleeping now.': [
    'Katten sover nu.',
    [
      ['Katten', 'katt', 'cat', 1, 0],
      ['sover', 'sova', 'sleeps', 2, 0],
      ['nu', 'nu', 'now', 1, 0],
    ],
    ['pres', 'def'],
  ],
  'The dog runs through the big forest today.': [
    'Hunden springer genom den stora skogen idag.',
    [
      ['Hunden', 'hund', 'dog', 1, 0],
      ['springer', 'springa', 'runs', 2, 0],
      ['genom', 'genom', 'through', 3, 0],
      ['den', 'den', 'the', 1, 0],
      ['stora', 'stor', 'big', 1, 0],
      ['skogen', 'skog', 'forest', 2, 0],
      ['idag', 'idag', 'today', 1, 0],
    ],
    ['pres', 'def', 'dbldef'],
  ],
  'Hello there my good friend.': [
    'Hej där min gode vän.',
    [
      ['Hej', 'hej', 'hello', 1, 0],
      ['där', 'där', 'there', 1, 0],
      ['min', 'min', 'my', 1, 0],
      ['gode', 'god', 'good', 1, 0],
      ['vän', 'vän', 'friend', 1, 0],
    ],
    [],
  ],
};

const PAGE = `<article>
  <p id="a">The cat is sleeping now. <a href="#">The dog</a> runs through the big forest today.</p>
  <p id="b">Hello there my good friend.</p>
</article>`;

const fakeModel = vi.fn<ModelCaller>(async ({ userMessage }) => ({
  success: true,
  content: JSON.stringify(
    userMessage.split('\n').map((line) => {
      const [id, text] = line.split(/\|(.*)/s);
      return [Number(id), ...CANNED[text]];
    }),
  ),
}));

function settingsWith(unlocked: GrammarTagId[]): UserSettings {
  return {
    ...DEFAULT_SETTINGS,
    lazyLoading: { enabled: false, preloadDistance: 0.5 },
    multilingualConfig: { nativeLanguage: 'en', targetLanguage: 'sv' },
    sentenceMode: {
      ...DEFAULT_SENTENCE_MODE_CONFIG,
      unlockedGrammar: unlocked,
    },
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('SentenceTranslationService', () => {
  let settings: UserSettings;
  let store: SentenceStore;
  let service: SentenceTranslationService;

  beforeEach(() => {
    // jsdom has no layout; treat the usual inline tags as inline
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      (element: Element) =>
        ({
          display: ['A', 'SPAN', 'EM', 'B'].includes(element.tagName)
            ? 'inline'
            : 'block',
          visibility: 'visible',
        }) as CSSStyleDeclaration,
    );
    settings = settingsWith(['pres', 'def']);
    store = new SentenceStore(new IDBFactory());
    fakeModel.mockClear();
    service = new SentenceTranslationService(undefined, {
      storage: { getUserSettings: async () => settings },
      store: new SentenceStoreClient((request) =>
        handleSentenceStoreRequest(store, request),
      ),
      callModel: fakeModel,
      detectPageLanguage: async () => 'en',
    });
    setBody(PAGE);
  });

  afterEach(() => {
    service.restore();
    vi.restoreAllMocks();
  });

  const translations = () =>
    [...document.querySelectorAll('.illa-st')].map((e) => e.textContent);

  it('replaces only sentences within the learner level and unlocked grammar', async () => {
    await service.start();

    expect(fakeModel).toHaveBeenCalledTimes(1);
    expect(translations()).toEqual([
      'Katten sover nu.',
      'Hej där min gode vän.',
    ]);
    // The dog sentence uses double definiteness, which is locked
    expect(document.getElementById('a')!.textContent).toContain(
      'big forest today.',
    );
  });

  it('restores the exact original DOM', async () => {
    const before = document.body.innerHTML;
    await service.start();
    expect(document.body.innerHTML).not.toBe(before);

    service.restore();
    expect(document.body.innerHTML).toBe(before);
  });

  it('re-evaluates cached analyses without calling the model again', async () => {
    await service.start();
    service.restore();

    settings = settingsWith(['pres', 'def', 'dbldef']);
    await service.start();

    expect(fakeModel).toHaveBeenCalledTimes(1);
    // "genom" is B1, above the A2 cold-start level: one new word, which is allowed
    expect(translations()).toEqual([
      'Katten sover nu.',
      'Hunden springer genom den stora skogen idag.',
      'Hej där min gode vän.',
    ]);
  });

  it('reveals a sentence on click and records the new word as learning', async () => {
    settings = settingsWith(['pres', 'def', 'dbldef']);
    await service.start();

    const dog = [...document.querySelectorAll<HTMLElement>('.illa-st')].find(
      (e) => e.textContent?.startsWith('Hunden'),
    )!;
    dog.querySelector<HTMLElement>('.illa-sw')!.click();

    expect(dog.classList.contains('illa-revealed')).toBe(true);
    const originals = document.querySelectorAll(
      `.illa-so[data-illa-sid="${dog.dataset.illaSid}"]`,
    );
    expect(
      [...originals].every((o) => o.classList.contains('illa-revealed')),
    ).toBe(true);

    // Clicking the revealed original switches back
    (originals[originals.length - 1] as HTMLElement).click();
    expect(dog.classList.contains('illa-revealed')).toBe(false);

    service.restore(); // flushes pending learner events
    await sleep(20);
    const [genom] = await store.getLemmas('sv', ['genom']);
    expect(genom).toMatchObject({ status: 'learning', exposures: 0 });
  });

  it('shows a word card on hover and counts it as a lookup', async () => {
    await service.start();
    const word = document.querySelector<HTMLElement>('.illa-st .illa-sw')!;
    word.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await sleep(350);

    const card = document.querySelector('.illa-sentence-tooltip');
    expect(card?.textContent).toContain('katt');
    expect(card?.textContent).toContain('cat');
    expect(card?.textContent).toContain('A1');

    service.restore();
    await sleep(20);
    const [katt] = await store.getLemmas('sv', ['katt']);
    expect(katt).toMatchObject({ status: 'learning', lookups: 1 });
    expect(document.querySelector('.illa-sentence-tooltip')).toBeNull();
  });

  it('respects the page cap', async () => {
    settings = {
      ...settings,
      sentenceMode: { ...settings.sentenceMode, pageCap: 0.34 },
    };
    await service.start();
    // Three sentences on the page: a 34% cap allows one
    expect(translations()).toHaveLength(1);
  });

  it('does nothing on pages already in the target language', async () => {
    service = new SentenceTranslationService(undefined, {
      storage: { getUserSettings: async () => settings },
      store: new SentenceStoreClient((request) =>
        handleSentenceStoreRequest(store, request),
      ),
      callModel: fakeModel,
      detectPageLanguage: async () => 'sv',
    });
    expect(await service.start()).toBe(0);
    expect(fakeModel).not.toHaveBeenCalled();
  });
});

describe('SentenceTranslationService block discovery', () => {
  it('segments a paragraph as a whole even when a link inside has enough words', async () => {
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      (element: Element) =>
        ({
          display: element.tagName === 'A' ? 'inline' : 'block',
          visibility: 'visible',
        }) as CSSStyleDeclaration,
    );
    const store = new SentenceStore(new IDBFactory());
    const callModel = vi.fn<ModelCaller>(async () => ({
      success: true,
      content:
        '[[1, "Den gamla hunden sover.", [["sover", "sova", "sleeps", 6, 0]], []]]',
    }));
    const service = new SentenceTranslationService(undefined, {
      storage: { getUserSettings: async () => settingsWith(['pres']) },
      store: new SentenceStoreClient((request) =>
        handleSentenceStoreRequest(store, request),
      ),
      callModel,
      detectPageLanguage: async () => 'en',
    });
    setBody(
      '<p>Start here. <a href="#">The very old dog</a> sleeps all day long.</p>',
    );

    await service.start();

    expect(callModel).toHaveBeenCalledTimes(1);
    // "Start here." is too short; the link is not segmented on its own
    expect(callModel.mock.calls[0][0].userMessage).toBe(
      '1|The very old dog sleeps all day long.',
    );
    service.restore();
    vi.restoreAllMocks();
  });
});
