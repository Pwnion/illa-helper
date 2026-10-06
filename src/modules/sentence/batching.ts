/**
 * Packs whole sentences into request batches of roughly `maxChars` source
 * characters. Sentences are never split; one longer than the limit gets a
 * batch of its own.
 */
export function packBatches<T extends { text: string }>(
  items: readonly T[],
  maxChars: number,
): T[][] {
  const batches: T[][] = [];
  let current: T[] = [];
  let size = 0;

  for (const item of items) {
    const length = item.text.length;
    if (current.length > 0 && size + length > maxChars) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(item);
    size += length;
  }

  if (current.length > 0) batches.push(current);
  return batches;
}

/** Runs tasks with at most `limit` in flight, preserving result order. */
export async function runWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index], index);
    }
  };

  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    worker,
  );
  await Promise.all(workers);
  return results;
}
