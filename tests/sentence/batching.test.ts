import { describe, expect, it } from 'vitest';
import {
  packBatches,
  runWithConcurrency,
} from '@/src/modules/sentence/batching';

const items = (lengths: number[]) =>
  lengths.map((n, i) => ({ id: i, text: 'x'.repeat(n) }));

describe('packBatches', () => {
  it('packs whole sentences up to the character budget', () => {
    const batches = packBatches(items([600, 600, 600, 200, 1400]), 1500);
    expect(batches.map((b) => b.map((i) => i.id))).toEqual([
      [0, 1],
      [2, 3],
      [4],
    ]);
  });

  it('never splits a sentence longer than the budget', () => {
    const batches = packBatches(items([100, 3000, 100]), 1500);
    expect(batches.map((b) => b.map((i) => i.id))).toEqual([[0], [1], [2]]);
  });

  it('returns no batches for no sentences', () => {
    expect(packBatches([], 1500)).toEqual([]);
  });
});

describe('runWithConcurrency', () => {
  it('keeps result order and never exceeds the limit', async () => {
    let active = 0;
    let peak = 0;
    const results = await runWithConcurrency([5, 1, 4, 2, 3], 2, async (ms) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, ms));
      active -= 1;
      return ms * 10;
    });
    expect(results).toEqual([50, 10, 40, 20, 30]);
    expect(peak).toBe(2);
  });
});
