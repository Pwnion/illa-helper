/**
 * Timer manager.
 * Tracks every timer in one place to avoid leaks.
 */

export class TimerManager {
  private timers = new Map<string, number>();

  /**
   * Sets a timer
   * @param key timer key
   * @param callback callback
   * @param delay delay in milliseconds
   */
  set(key: string, callback: () => void, delay: number): void {
    // Clear any existing timer with the same key
    this.clear(key);

    const timerId = window.setTimeout(() => {
      callback();
      this.timers.delete(key);
    }, delay);

    this.timers.set(key, timerId);
  }

  /**
   * Clears a timer
   * @param key timer key
   */
  clear(key: string): void {
    const timerId = this.timers.get(key);
    if (timerId !== undefined) {
      clearTimeout(timerId);
      this.timers.delete(key);
    }
  }

  /**
   * Clears every timer
   */
  clearAll(): void {
    for (const timerId of this.timers.values()) {
      clearTimeout(timerId);
    }
    this.timers.clear();
  }

  /**
   * Whether a timer exists
   * @param key timer key
   */
  has(key: string): boolean {
    return this.timers.has(key);
  }

  /**
   * Number of active timers
   */
  size(): number {
    return this.timers.size;
  }

  /**
   * Keys of all active timers
   */
  keys(): string[] {
    return Array.from(this.timers.keys());
  }

  /**
   * Destroys the manager
   */
  destroy(): void {
    this.clearAll();
  }
}
