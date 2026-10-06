/**
 * Segment observer used for lazy loading
 */

import { ContentSegment } from '../../processing/ProcessingStateManager';

/**
 * Observer callback
 */
export type SegmentObserverCallback = (
  visibleSegments: ContentSegment[],
  invisibleSegments: ContentSegment[],
) => void;

/**
 * Observer options
 */
export interface SegmentObserverOptions {
  /** Preload distance as a fraction of the viewport */
  preloadDistance?: number;
}

/**
 * Segment observer
 * built on IntersectionObserver for lazy loading
 */
export class SegmentObserver {
  private observer: IntersectionObserver | null = null;
  private segmentMap = new Map<Element, ContentSegment>();
  private callback: SegmentObserverCallback;
  private options: SegmentObserverOptions;
  private isDestroyed = false;

  constructor(
    callback: SegmentObserverCallback,
    options: SegmentObserverOptions = {},
  ) {
    this.callback = callback;
    this.options = options;
    this.initializeObserver();
  }

  /**
   * Creates the observer
   */
  private initializeObserver(): void {
    if (typeof IntersectionObserver === 'undefined') {
      return;
    }

    try {
      const preloadDistance = this.options.preloadDistance || 0.5;
      const marginPercent = Math.round(preloadDistance * 100);

      const observerOptions: IntersectionObserverInit = {
        rootMargin: `${marginPercent}% 0px ${marginPercent}% 0px`,
        threshold: 0.1,
        root: null,
      };

      this.observer = new IntersectionObserver(
        this.handleIntersection.bind(this),
        observerOptions,
      );
    } catch (error) {
      console.error('[SegmentObserver] Failed to create observer:', error);
    }
  }

  /**
   * Handles intersection changes
   */
  private handleIntersection(entries: IntersectionObserverEntry[]): void {
    if (this.isDestroyed || !this.observer) return;

    const visibleSegments: ContentSegment[] = [];
    const invisibleSegments: ContentSegment[] = [];

    entries.forEach((entry) => {
      const segment = this.segmentMap.get(entry.target);
      if (!segment) return;

      if (entry.isIntersecting) {
        visibleSegments.push(segment);
      } else {
        invisibleSegments.push(segment);
      }
    });

    if (visibleSegments.length > 0 || invisibleSegments.length > 0) {
      try {
        this.callback(visibleSegments, invisibleSegments);
      } catch (error) {
        console.error('[SegmentObserver] Callback failed:', error);
      }
    }
  }

  /**
   * Observes a segment
   */
  observe(segment: ContentSegment): void {
    if (this.isDestroyed || !this.observer) return;

    const targetElement = segment.element;
    if (!targetElement || !(targetElement instanceof Element)) {
      return;
    }

    try {
      this.segmentMap.set(targetElement, segment);
      this.observer.observe(targetElement);
      this.emitIfInitiallyVisible(segment);
    } catch (error) {
      console.error('[SegmentObserver] Failed to observe segment:', error);
    }
  }

  /**
   * Stops observing a segment
   */
  unobserve(segment: ContentSegment): void {
    if (this.isDestroyed || !this.observer) return;

    const targetElement = segment.element;
    if (!targetElement || !(targetElement instanceof Element)) return;

    try {
      this.observer.unobserve(targetElement);
      this.segmentMap.delete(targetElement);
    } catch (error) {
      console.error('[SegmentObserver] Failed to stop observing:', error);
    }
  }

  /**
   * Observes several segments
   */
  observeMultiple(segments: ContentSegment[]): void {
    segments.forEach((segment) => this.observe(segment));
  }

  private emitIfInitiallyVisible(segment: ContentSegment): void {
    const targetElement = segment.element;
    if (!targetElement || !(targetElement instanceof Element)) return;

    const rect = targetElement.getBoundingClientRect();
    const preloadDistance = this.options.preloadDistance || 0.5;
    const viewportHeight =
      window.innerHeight || document.documentElement.clientHeight;
    const preloadPx = viewportHeight * preloadDistance;

    const isVisible =
      rect.bottom >= -preloadPx && rect.top <= viewportHeight + preloadPx;

    if (isVisible) {
      this.callback([segment], []);
    }
  }

  /**
   * Stops observing several segments
   */
  unobserveMultiple(segments: ContentSegment[]): void {
    segments.forEach((segment) => this.unobserve(segment));
  }

  /**
   * Updates observer options
   */
  updateOptions(newOptions: SegmentObserverOptions): void {
    if (this.isDestroyed) return;

    this.options = { ...this.options, ...newOptions };
    this.disconnect();
    this.initializeObserver();

    const segments = Array.from(this.segmentMap.values());
    this.segmentMap.clear();
    segments.forEach((segment) => this.observe(segment));
  }

  /**
   * Disconnects all observation
   */
  disconnect(): void {
    if (this.observer) {
      try {
        this.observer.disconnect();
      } catch (error) {
        console.error(
          '[SegmentObserver] Failed to disconnect observer:',
          error,
        );
      }
    }
    this.segmentMap.clear();
  }

  /**
   * Destroys the observer
   */
  destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.disconnect();
    this.observer = null;
  }

  // State queries
  getObservedCount(): number {
    return this.segmentMap.size;
  }

  isObserving(segment: ContentSegment): boolean {
    return this.segmentMap.has(segment.element);
  }

  getObservedSegments(): ContentSegment[] {
    return Array.from(this.segmentMap.values());
  }

  static isSupported(): boolean {
    return typeof IntersectionObserver !== 'undefined';
  }
}
