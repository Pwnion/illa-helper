/**
 * Lazy loading service: viewport-based lazy translation.
 *
 * Responsibilities:
 * 1. owns the IntersectionObserver
 * 2. connects viewport detection to translation
 * 3. updates observation for dynamic content
 * 4. performance and error handling
 */

import type { LazyLoadingConfig } from '../../shared/types/core';
import type { ContentSegment } from '../../processing/ProcessingStateManager';
import {
  SegmentObserver,
  type SegmentObserverCallback,
} from '../utils/SegmentObserver';

/**
 * Lazy loading callback
 */
export type LazyLoadingCallback = (segments: ContentSegment[]) => Promise<void>;

/**
 * Lazy loading state
 */
interface LazyLoadingState {
  /** Whether the service has been initialised */
  initialized: boolean;
  /** Whether lazy loading is enabled */
  enabled: boolean;
  /** Segments waiting to be processed */
  processingQueue: Set<string>;
  /** Segments already processed */
  processedSegments: Set<string>;
  /** Segment cache */
  segmentCache: Map<string, ContentSegment>;
}

/**
 * Lazy loading service
 */
export class LazyLoadingService {
  private config: LazyLoadingConfig;
  private observer: SegmentObserver | null = null;
  private processingCallback: LazyLoadingCallback | null = null;
  private state: LazyLoadingState;
  private processingTimer: number | null = null;
  private isDestroyed = false;

  constructor(config: LazyLoadingConfig) {
    this.config = { ...config };
    this.state = {
      initialized: false,
      enabled: false,
      processingQueue: new Set(),
      processedSegments: new Set(),
      segmentCache: new Map(),
    };
  }

  /**
   * Initialises the service
   */
  initialize(): void {
    if (this.state.initialized) return;

    this.state.initialized = true;
    this.state.enabled = this.config.enabled;

    if (this.config.enabled) {
      this.createObserver();
    }
  }

  /**
   * Creates the observer
   */
  private createObserver(): void {
    if (this.observer) {
      this.observer.destroy();
    }

    const observerCallback: SegmentObserverCallback = (
      visibleSegments,
      invisibleSegments,
    ) => {
      this.handleVisibilityChange(visibleSegments);
    };

    const observerOptions = {
      preloadDistance: this.config.preloadDistance,
    };

    this.observer = new SegmentObserver(observerCallback, observerOptions);
  }

  /**
   * Handles segment visibility changes
   */
  private handleVisibilityChange(visibleSegments: ContentSegment[]): void {
    if (!this.state.enabled || this.isDestroyed) return;

    // Segments entering the viewport
    if (visibleSegments.length > 0) {
      this.scheduleProcessing(visibleSegments);
    }
  }

  /**
   * Schedules processing without overlapping runs
   */
  private scheduleProcessing(segments: ContentSegment[]): void {
    // Skip segments already processed
    const unprocessedSegments = segments.filter(
      (segment) => !this.state.processedSegments.has(segment.fingerprint),
    );

    if (unprocessedSegments.length === 0) return;

    // Queue and cache
    unprocessedSegments.forEach((segment) => {
      this.state.processingQueue.add(segment.fingerprint);
      this.state.segmentCache.set(segment.fingerprint, segment);
    });

    this.scheduleQueueDrain();
  }

  private scheduleQueueDrain(): void {
    if (this.processingTimer) {
      return;
    }

    // Debounce to avoid frequent runs
    this.processingTimer = window.setTimeout(() => {
      this.processAllQueuedSegments();
    }, 100);
  }

  /**
   * Processes every queued segment, so segments queued during a run are not skipped
   */
  private async processAllQueuedSegments(): Promise<void> {
    if (!this.processingCallback || this.isDestroyed) return;

    const allQueuedFingerprints = Array.from(this.state.processingQueue);
    if (allQueuedFingerprints.length === 0) {
      this.processingTimer = null;
      return;
    }

    const segmentsToProcess: ContentSegment[] = [];
    allQueuedFingerprints.forEach((fingerprint) => {
      const segment = this.state.segmentCache.get(fingerprint);
      if (segment) {
        segmentsToProcess.push(segment);
      }
    });

    if (segmentsToProcess.length === 0) {
      this.processingTimer = null;
      return;
    }

    try {
      await this.runProcessingCallbackWhenIdle(segmentsToProcess);

      // Mark as processed and drop from the cache
      segmentsToProcess.forEach((segment) => {
        this.state.processedSegments.add(segment.fingerprint);
        this.state.processingQueue.delete(segment.fingerprint);
        this.state.segmentCache.delete(segment.fingerprint);
      });
    } catch (_) {
      // Clear the queue even on failure to avoid reprocessing
      segmentsToProcess.forEach((segment) => {
        this.state.processingQueue.delete(segment.fingerprint);
        this.state.segmentCache.delete(segment.fingerprint);
      });
    } finally {
      this.processingTimer = null;
      if (this.state.processingQueue.size > 0 && !this.isDestroyed) {
        // Segments that became visible during this run stay queued; drain again once this batch finishes.
        this.scheduleQueueDrain();
      }
    }
  }

  private async runProcessingCallbackWhenIdle(
    segments: ContentSegment[],
  ): Promise<void> {
    if (!this.processingCallback) return;

    if ('requestIdleCallback' in window) {
      await new Promise<void>((resolve, reject) => {
        window.requestIdleCallback(() => {
          this.processingCallback!(segments).then(resolve).catch(reject);
        });
      });
      return;
    }

    await this.processingCallback(segments);
  }

  /**
   * Starts observing segments
   */
  observeSegments(segments: ContentSegment[]): void {
    if (
      !this.state.initialized ||
      !this.state.enabled ||
      !this.observer ||
      this.isDestroyed
    ) {
      return;
    }
    this.observer.observeMultiple(segments);
  }

  /**
   * Stops observing segments
   */
  unobserveSegments(segments: ContentSegment[]): void {
    if (!this.observer || this.isDestroyed) return;
    this.observer.unobserveMultiple(segments);
  }

  /**
   * Sets the processing callback
   */
  setProcessingCallback(callback: LazyLoadingCallback): void {
    this.processingCallback = callback;
  }

  /**
   * Updates the configuration
   */
  updateConfig(newConfig: LazyLoadingConfig): void {
    if (this.isDestroyed) return;

    const oldEnabled = this.config.enabled;
    this.config = { ...newConfig };

    // Enabled state changed
    if (oldEnabled !== newConfig.enabled) {
      this.state.enabled = newConfig.enabled;
      if (!newConfig.enabled) {
        this.stopAllObservation();
      }
    }

    // Recreate the observer when its options change
    if (this.state.initialized && this.observer) {
      this.createObserver();
    }
  }

  /**
   * Forgets every observed and processed segment so a page can be translated
   * again after its translations were removed
   */
  reset(): void {
    if (this.isDestroyed) return;
    this.stopAllObservation();
    this.state.processedSegments.clear();
  }

  /**
   * Stops all observation
   */
  private stopAllObservation(): void {
    if (this.observer) {
      this.observer.disconnect();
    }
    this.state.processingQueue.clear();
    this.state.segmentCache.clear();
    if (this.processingTimer) {
      clearTimeout(this.processingTimer);
      this.processingTimer = null;
    }
  }

  // State queries
  isEnabled(): boolean {
    return this.state.initialized && this.state.enabled;
  }

  isInitialized(): boolean {
    return this.state.initialized;
  }

  getConfig(): Readonly<LazyLoadingConfig> {
    return { ...this.config };
  }

  /**
   * Destroys the service
   */
  destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.stopAllObservation();
    if (this.observer) {
      this.observer.destroy();
      this.observer = null;
    }
  }
}
