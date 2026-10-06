/**
 * Credits implicit exposures. A replaced sentence that stays visible for long
 * enough to read, without being hovered or revealed, counts as one unaided
 * read of each of its words. Each sentence is credited at most once per page.
 */

export interface TrackedSentence {
  id: string;
  element: HTMLElement;
  wordCount: number;
}

export interface ExposureTrackerOptions {
  minDwellMs: number;
  dwellMsPerWord: number;
  onExposure: (id: string) => void;
}

export function dwellTime(
  wordCount: number,
  options: Pick<ExposureTrackerOptions, 'minDwellMs' | 'dwellMsPerWord'>,
): number {
  return Math.max(options.minDwellMs, wordCount * options.dwellMsPerWord);
}

export class ExposureTracker {
  private observer: IntersectionObserver | null = null;
  private sentences = new Map<Element, TrackedSentence>();
  private timers = new Map<string, number>();
  private voided = new Set<string>();
  private credited = new Set<string>();

  constructor(private options: ExposureTrackerOptions) {
    if (typeof IntersectionObserver !== 'undefined') {
      this.observer = new IntersectionObserver(
        (entries) => this.handle(entries),
        { threshold: 0.6 },
      );
    }
  }

  updateOptions(
    options: Partial<Omit<ExposureTrackerOptions, 'onExposure'>>,
  ): void {
    this.options = { ...this.options, ...options };
  }

  track(sentence: TrackedSentence): void {
    this.sentences.set(sentence.element, sentence);
    this.observer?.observe(sentence.element);
  }

  /** Hovering or revealing a sentence means it was not read unaided. */
  void(id: string): void {
    this.voided.add(id);
    this.clearTimer(id);
  }

  isCredited(id: string): boolean {
    return this.credited.has(id);
  }

  disconnect(): void {
    this.observer?.disconnect();
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.sentences.clear();
    this.voided.clear();
    this.credited.clear();
  }

  private handle(entries: IntersectionObserverEntry[]): void {
    for (const entry of entries) {
      const sentence = this.sentences.get(entry.target);
      if (!sentence) continue;
      if (entry.isIntersecting) this.startTimer(sentence);
      else this.clearTimer(sentence.id);
    }
  }

  private startTimer(sentence: TrackedSentence): void {
    const { id } = sentence;
    if (this.voided.has(id) || this.credited.has(id) || this.timers.has(id)) {
      return;
    }
    const timer = window.setTimeout(
      () => {
        this.timers.delete(id);
        if (this.voided.has(id) || this.credited.has(id)) return;
        if (document.visibilityState !== 'visible') {
          // Not read while the tab was hidden; try again on the next view
          this.startTimer(sentence);
          return;
        }
        this.credited.add(id);
        this.observer?.unobserve(sentence.element);
        this.options.onExposure(id);
      },
      dwellTime(sentence.wordCount, this.options),
    );
    this.timers.set(id, timer);
  }

  private clearTimer(id: string): void {
    const timer = this.timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }
}
