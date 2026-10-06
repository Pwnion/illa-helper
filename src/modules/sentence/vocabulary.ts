/**
 * Known-word state transitions, import and export. Pure functions shared by
 * the background store (which applies them atomically) and the tests.
 */

import { normalizeLemma } from './selection';
import {
  LEMMA_STATUSES,
  type LemmaRecord,
  type LemmaStatus,
  type VocabOp,
} from './types';

export function newLemmaRecord(
  lang: string,
  lemma: string,
  at: number,
): LemmaRecord {
  return {
    lang,
    lemma: normalizeLemma(lemma),
    status: 'seen',
    exposures: 0,
    lookups: 0,
    lastSeen: at,
  };
}

/**
 * Applies one learner event to a lemma:
 * - exposure: read in a replaced sentence without help; after
 *   `exposuresToKnow` of these in a row the lemma becomes known
 * - lookup: the learner opened the word card, so it is being learned
 * - reveal: the learner revealed a sentence in which this was a new word
 * - reset-exposure: the learner revealed a sentence containing this word, so
 *   the current run of unaided reads is broken
 * - mark-known / mark-unknown: explicit choices from the word card
 */
export function applyVocabOp(
  record: LemmaRecord | undefined,
  op: VocabOp,
  lang: string,
  exposuresToKnow: number,
): LemmaRecord {
  const next: LemmaRecord = record
    ? { ...record }
    : newLemmaRecord(lang, op.lemma, op.at);
  next.lastSeen = op.at;

  switch (op.kind) {
    case 'exposure':
      next.exposures += 1;
      if (next.status !== 'known' && next.exposures >= exposuresToKnow) {
        next.status = 'known';
      }
      break;
    case 'lookup':
      next.lookups += 1;
      next.exposures = 0;
      next.status = 'learning';
      break;
    case 'reveal':
      next.exposures = 0;
      if (next.status !== 'known') next.status = 'learning';
      break;
    case 'reset-exposure':
      next.exposures = 0;
      break;
    case 'mark-known':
      next.status = 'known';
      break;
    case 'mark-unknown':
      next.status = 'unknown';
      next.exposures = 0;
      break;
  }

  return next;
}

export interface ImportedLemma {
  lemma: string;
  status: LemmaStatus;
}

/**
 * Parses an import. Accepts:
 * - plain text, one lemma per line, optionally followed by a tab and a status
 *   (lines starting with # are comments; the default status is known)
 * - this extension's CSV export
 * - this extension's JSON export
 */
export function parseVocabularyImport(text: string): ImportedLemma[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    return parseJsonImport(trimmed);
  }

  const lines = trimmed.split(/\r?\n/);
  if (/^lemma,status\b/i.test(lines[0].trim())) {
    return dedupe(
      lines
        .slice(1)
        .map((line) => parseCsvLine(line))
        .filter((cells) => cells.length >= 2)
        .map(([lemma, status]) => toImported(lemma, status)),
    );
  }

  return dedupe(
    lines
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const [lemma, status] = line.split('\t');
        return toImported(lemma, status);
      }),
  );
}

export function vocabularyToCsv(records: readonly LemmaRecord[]): string {
  const header = 'lemma,status,exposures,lookups,lastSeen,lang';
  const rows = records.map((record) =>
    [
      record.lemma,
      record.status,
      record.exposures,
      record.lookups,
      new Date(record.lastSeen).toISOString(),
      record.lang,
    ]
      .map(csvCell)
      .join(','),
  );
  return [header, ...rows].join('\n') + '\n';
}

export function vocabularyToJson(records: readonly LemmaRecord[]): string {
  return JSON.stringify(records, null, 2) + '\n';
}

export function countByStatus(
  records: readonly LemmaRecord[],
): Record<LemmaStatus, number> {
  const counts = { seen: 0, unknown: 0, learning: 0, known: 0 };
  for (const record of records) counts[record.status] += 1;
  return counts;
}

function toImported(lemma: string | undefined, status?: string): ImportedLemma {
  const clean = (status ?? '').trim().toLowerCase();
  return {
    lemma: normalizeLemma(lemma ?? ''),
    status: isLemmaStatus(clean) ? clean : 'known',
  };
}

function parseJsonImport(text: string): ImportedLemma[] {
  try {
    const parsed = JSON.parse(text);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return dedupe(
      list
        .filter(
          (item): item is { lemma: string; status?: string } =>
            item && typeof item.lemma === 'string',
        )
        .map((item) => toImported(item.lemma, item.status)),
    );
  } catch {
    return [];
  }
}

function dedupe(items: ImportedLemma[]): ImportedLemma[] {
  const byLemma = new Map<string, ImportedLemma>();
  for (const item of items) {
    if (item.lemma) byLemma.set(item.lemma, item);
  }
  return [...byLemma.values()];
}

function isLemmaStatus(value: string): value is LemmaStatus {
  return (LEMMA_STATUSES as readonly string[]).includes(value);
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}
