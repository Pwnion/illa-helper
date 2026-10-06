// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { SentenceStore } from '@/src/modules/sentence/store/SentenceStore';
import {
  SentenceStoreClient,
  handleSentenceStoreRequest,
} from '@/src/modules/sentence/store/SentenceStoreClient';
import { analysis, token } from './fixtures';

function storeWithClock(limit = 3) {
  let now = 1000;
  const store = new SentenceStore(new IDBFactory(), limit, () => now);
  return { store, tick: (ms = 1) => (now += ms) };
}

const sample = (n: number) =>
  analysis(`Mening ${n}.`, [token('Mening', 'mening', 1)]);

describe('SentenceStore analysis cache', () => {
  it('stores and returns analyses by key', async () => {
    const { store } = storeWithClock();
    await store.putAnalyses([{ key: 'a', analysis: sample(1) }]);
    expect(await store.getAnalyses(['a', 'missing'])).toEqual({ a: sample(1) });
  });

  it('evicts the least recently used entries beyond the limit', async () => {
    const { store, tick } = storeWithClock(3);
    for (const key of ['a', 'b', 'c']) {
      await store.putAnalyses([{ key, analysis: sample(1) }]);
      tick();
    }
    await store.getAnalyses(['a']); // a is now the most recently used
    tick();
    await store.putAnalyses([{ key: 'd', analysis: sample(4) }]);

    expect(await store.countAnalyses()).toBe(3);
    expect(
      Object.keys(await store.getAnalyses(['a', 'b', 'c', 'd'])).sort(),
    ).toEqual(['a', 'c', 'd']);
  });

  it('clears the cache', async () => {
    const { store } = storeWithClock();
    await store.putAnalyses([{ key: 'a', analysis: sample(1) }]);
    await store.clearAnalyses();
    expect(await store.countAnalyses()).toBe(0);
  });
});

describe('SentenceStore known words', () => {
  it('applies ops atomically per language and returns updated records', async () => {
    const { store } = storeWithClock();
    const ops = [1, 2, 3].map((at) => ({
      lemma: 'Katt',
      kind: 'exposure' as const,
      at,
    }));
    const updated = await store.applyVocabOps('sv', ops, 3);

    expect(updated).toEqual([
      {
        lang: 'sv',
        lemma: 'katt',
        status: 'known',
        exposures: 3,
        lookups: 0,
        lastSeen: 3,
      },
    ]);
    expect(await store.getLemmas('sv', ['katt', 'hund'])).toEqual(updated);
    expect(await store.getLemmas('no', ['katt'])).toEqual([]);
  });

  it('imports statuses, keeps counters, lists and resets', async () => {
    const { store } = storeWithClock();
    await store.applyVocabOps(
      'sv',
      [{ lemma: 'katt', kind: 'lookup', at: 5 }],
      5,
    );
    await store.importLemmas('sv', [
      { lemma: 'katt', status: 'known' },
      { lemma: 'hund', status: 'learning' },
    ]);
    await store.importLemmas('de', [{ lemma: 'hund', status: 'known' }]);

    const swedish = await store.listLemmas('sv');
    expect(swedish.map((r) => [r.lemma, r.status, r.lookups])).toEqual([
      ['hund', 'learning', 0],
      ['katt', 'known', 1],
    ]);
    expect(await store.listLemmas()).toHaveLength(3);

    await store.resetLemmas('sv');
    expect(await store.listLemmas('sv')).toEqual([]);
    expect(await store.listLemmas('de')).toHaveLength(1);

    await store.resetLemmas();
    expect(await store.listLemmas()).toEqual([]);
  });
});

describe('SentenceStoreClient', () => {
  it('round-trips requests through the background dispatcher', async () => {
    const { store } = storeWithClock();
    const client = new SentenceStoreClient((request) =>
      handleSentenceStoreRequest(store, request),
    );

    await client.putAnalyses([{ key: 'k', analysis: sample(1) }]);
    expect(await client.getAnalyses(['k'])).toEqual({ k: sample(1) });

    const records = await client.applyVocabOps(
      'sv',
      [{ lemma: 'hus', kind: 'mark-known', at: 1 }],
      5,
    );
    expect(records[0].status).toBe('known');
    expect(await client.getLemmas('sv', ['hus'])).toEqual(records);
  });

  it('returns empty results when the transport fails', async () => {
    const client = new SentenceStoreClient(async () => ({
      success: false,
      error: 'boom',
    }));
    expect(await client.getAnalyses(['k'])).toEqual({});
    expect(await client.getLemmas('sv', ['x'])).toEqual([]);

    const throwing = new SentenceStoreClient(async () => {
      throw new Error('disconnected');
    });
    expect(await throwing.applyVocabOps('sv', [], 5)).toEqual([]);
  });
});
