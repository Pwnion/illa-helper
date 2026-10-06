/**
 * IndexedDB storage for sentence mode: the analysis cache and the known-word
 * store.
 *
 * It must only be opened from extension pages (background, options): a
 * content script's IndexedDB belongs to the visited website, which would leak
 * the data to the page and split it per site. Content scripts go through
 * SentenceStoreClient instead.
 */

import type {
  LemmaRecord,
  LemmaStatus,
  SentenceAnalysis,
  VocabOp,
} from '../types';
import {
  applyVocabOp,
  newLemmaRecord,
  type ImportedLemma,
} from '../vocabulary';
import { normalizeLemma } from '../selection';

const DB_NAME = 'illa-sentence-mode';
const DB_VERSION = 1;
const ANALYSES = 'analyses';
const LEMMAS = 'lemmas';

export const DEFAULT_ANALYSIS_CACHE_LIMIT = 5000;

interface AnalysisEntry {
  key: string;
  analysis: SentenceAnalysis;
  lastAccess: number;
}

interface LemmaEntry extends LemmaRecord {
  id: string;
}

export interface CachedAnalysisInput {
  key: string;
  analysis: SentenceAnalysis;
}

export class SentenceStore {
  private dbPromise?: Promise<IDBDatabase>;

  constructor(
    private readonly factory: IDBFactory = globalThis.indexedDB,
    private readonly analysisLimit = DEFAULT_ANALYSIS_CACHE_LIMIT,
    private readonly now: () => number = Date.now,
  ) {}

  // ==================== Analysis cache ====================

  /** Returns cached analyses by key and marks them recently used. */
  async getAnalyses(
    keys: readonly string[],
  ): Promise<Record<string, SentenceAnalysis>> {
    const hits: Record<string, SentenceAnalysis> = {};
    if (keys.length === 0) return hits;

    const db = await this.open();
    const tx = db.transaction(ANALYSES, 'readwrite');
    const store = tx.objectStore(ANALYSES);
    const accessedAt = this.now();

    await Promise.all(
      [...new Set(keys)].map(async (key) => {
        const entry = await request<AnalysisEntry | undefined>(store.get(key));
        if (!entry) return;
        hits[key] = entry.analysis;
        store.put({ ...entry, lastAccess: accessedAt });
      }),
    );
    await done(tx);
    return hits;
  }

  /** Stores analyses, evicting the least recently used beyond the limit. */
  async putAnalyses(entries: readonly CachedAnalysisInput[]): Promise<void> {
    if (entries.length === 0) return;

    const db = await this.open();
    const tx = db.transaction(ANALYSES, 'readwrite');
    const store = tx.objectStore(ANALYSES);
    const at = this.now();

    for (const entry of entries) {
      store.put({ key: entry.key, analysis: entry.analysis, lastAccess: at });
    }

    const count = await request<number>(store.count());
    let excess = count - this.analysisLimit;
    if (excess > 0) {
      await new Promise<void>((resolve, reject) => {
        const cursorRequest = store.index('lastAccess').openCursor();
        cursorRequest.onerror = () => reject(cursorRequest.error);
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor || excess <= 0) {
            resolve();
            return;
          }
          cursor.delete();
          excess -= 1;
          cursor.continue();
        };
      });
    }
    await done(tx);
  }

  async countAnalyses(): Promise<number> {
    const db = await this.open();
    const tx = db.transaction(ANALYSES, 'readonly');
    const count = await request<number>(tx.objectStore(ANALYSES).count());
    await done(tx);
    return count;
  }

  async clearAnalyses(): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(ANALYSES, 'readwrite');
    tx.objectStore(ANALYSES).clear();
    await done(tx);
  }

  // ==================== Known words ====================

  async getLemmas(
    lang: string,
    lemmas: readonly string[],
  ): Promise<LemmaRecord[]> {
    if (lemmas.length === 0) return [];

    const db = await this.open();
    const tx = db.transaction(LEMMAS, 'readonly');
    const store = tx.objectStore(LEMMAS);
    const unique = [...new Set(lemmas.map(normalizeLemma))];
    const found = await Promise.all(
      unique.map((lemma) =>
        request<LemmaEntry | undefined>(store.get(lemmaId(lang, lemma))),
      ),
    );
    await done(tx);
    return found.filter((e): e is LemmaEntry => !!e).map(stripId);
  }

  /** Applies learner events atomically and returns the updated records. */
  async applyVocabOps(
    lang: string,
    ops: readonly VocabOp[],
    exposuresToKnow: number,
  ): Promise<LemmaRecord[]> {
    if (ops.length === 0) return [];

    const db = await this.open();
    const tx = db.transaction(LEMMAS, 'readwrite');
    const store = tx.objectStore(LEMMAS);
    const updated = new Map<string, LemmaRecord>();

    // Ops are applied in order; later ops on a lemma see earlier results
    for (const op of ops) {
      const lemma = normalizeLemma(op.lemma);
      if (!lemma) continue;
      const id = lemmaId(lang, lemma);
      const current =
        updated.get(id) ??
        (await request<LemmaEntry | undefined>(store.get(id)).then((e) =>
          e ? stripId(e) : undefined,
        ));
      const next = applyVocabOp(
        current,
        { ...op, lemma },
        lang,
        exposuresToKnow,
      );
      updated.set(id, next);
      store.put({ ...next, id });
    }

    await done(tx);
    return [...updated.values()];
  }

  async listLemmas(lang?: string): Promise<LemmaRecord[]> {
    const db = await this.open();
    const tx = db.transaction(LEMMAS, 'readonly');
    const store = tx.objectStore(LEMMAS);
    const entries = await request<LemmaEntry[]>(
      lang ? store.index('lang').getAll(lang) : store.getAll(),
    );
    await done(tx);
    return entries.map(stripId).sort((a, b) => a.lemma.localeCompare(b.lemma));
  }

  /** Sets the status of imported lemmas, keeping existing counters. */
  async importLemmas(
    lang: string,
    items: readonly ImportedLemma[],
  ): Promise<number> {
    if (items.length === 0) return 0;

    const db = await this.open();
    const tx = db.transaction(LEMMAS, 'readwrite');
    const store = tx.objectStore(LEMMAS);
    const at = this.now();

    for (const item of items) {
      const id = lemmaId(lang, item.lemma);
      const existing = await request<LemmaEntry | undefined>(store.get(id));
      const record: LemmaRecord = existing
        ? { ...stripId(existing), status: item.status }
        : { ...newLemmaRecord(lang, item.lemma, at), status: item.status };
      store.put({ ...record, id });
    }

    await done(tx);
    return items.length;
  }

  async resetLemmas(lang?: string): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(LEMMAS, 'readwrite');
    const store = tx.objectStore(LEMMAS);
    if (lang) {
      const keys = await request<IDBValidKey[]>(
        store.index('lang').getAllKeys(lang),
      );
      for (const key of keys) store.delete(key);
    } else {
      store.clear();
    }
    await done(tx);
  }

  async setLemmaStatus(
    lang: string,
    lemma: string,
    status: LemmaStatus,
  ): Promise<void> {
    await this.importLemmas(lang, [{ lemma: normalizeLemma(lemma), status }]);
  }

  close(): void {
    void this.dbPromise?.then((db) => db.close());
    this.dbPromise = undefined;
  }

  private open(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const openRequest = this.factory.open(DB_NAME, DB_VERSION);
        openRequest.onupgradeneeded = () => {
          const db = openRequest.result;
          if (!db.objectStoreNames.contains(ANALYSES)) {
            db.createObjectStore(ANALYSES, { keyPath: 'key' }).createIndex(
              'lastAccess',
              'lastAccess',
            );
          }
          if (!db.objectStoreNames.contains(LEMMAS)) {
            db.createObjectStore(LEMMAS, { keyPath: 'id' }).createIndex(
              'lang',
              'lang',
            );
          }
        };
        openRequest.onsuccess = () => resolve(openRequest.result);
        openRequest.onerror = () => reject(openRequest.error);
      });
    }
    return this.dbPromise;
  }
}

function lemmaId(lang: string, lemma: string): string {
  return `${lang.toLowerCase()}\u0000${normalizeLemma(lemma)}`;
}

function stripId(entry: LemmaEntry): LemmaRecord {
  const { id: _id, ...record } = entry;
  return record;
}

function request<T>(req: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
}
