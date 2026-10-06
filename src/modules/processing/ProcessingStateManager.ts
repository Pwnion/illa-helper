/**
 * Global processing state manager.
 * Tracks processing state for all text to prevent duplicate work and keep the system consistent.
 */

export interface ProcessedContentInfo {
  /** Content fingerprint */
  fingerprint: string;
  /** Processing timestamp */
  timestamp: number;
  /** DOM path */
  domPath: string;
  /** Processing result summary */
  processingResult: {
    replacementCount: number;
    success: boolean;
  };
}

export interface ContentSegment {
  /** Unique segment id */
  id: string;
  /** Text content */
  textContent: string;
  /** The segment's DOM element */
  element: Element;
  /** Every related DOM element (for merged segments) */
  elements: Element[];
  /** Text nodes */
  textNodes: Text[];
  /** Content fingerprint */
  fingerprint: string;
  /** DOM context path */
  domPath: string;
}

/**
 * Global processing state manager.
 *
 * Responsibilities:
 * 1. track processed content to prevent duplicate work
 * 2. track in-flight content to avoid concurrent processing
 * 3. generate and check content fingerprints
 * 4. manage the processing state lifecycle
 */
export class ProcessingStateManager {
  /** Processed content */
  private processedContent = new Map<string, ProcessedContentInfo>();

  /** Content currently being processed */
  private activeProcessing = new Set<string>();

  /** Cleanup timer */
  private cleanupTimer: number | null = null;

  /** Cleanup interval (2 hours) */
  private readonly CLEANUP_INTERVAL = 2 * 60 * 60 * 1000;

  /** Content lifetime (4 hours) */
  private readonly CONTENT_TTL = 4 * 60 * 60 * 1000;

  constructor() {
    this.startCleanupTimer();
  }

  /**
   * Generates a content fingerprint.
   * Fingerprints must be deterministic: the same text at the same DOM position always yields the same value.
   * Dynamic content is told apart by DOM path and text; mixing time into the fingerprint would cause duplicate processing.
   */
  generateContentFingerprint(textContent: string, domPath: string): string {
    const normalizedText = textContent.trim().replace(/\s+/g, ' ');
    const combinedString = `${normalizedText}|${domPath}`;

    // Simple but effective hash
    let hash = 0;
    for (let i = 0; i < combinedString.length; i++) {
      const char = combinedString.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // force a 32-bit integer
    }

    return Math.abs(hash).toString(36);
  }

  /**
   * Generates a DOM path
   * that identifies the element
   */
  generateDomPath(element: Element): string {
    const path: string[] = [];
    let current: Element | null = element;

    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();

      // Add class names (skipping processing-related classes)
      const classList = Array.from(current.classList)
        .filter((cls) => !cls.startsWith('wxt-'))
        .slice(0, 2); // at most two class names

      if (classList.length > 0) {
        selector += '.' + classList.join('.');
      }

      // Add the position among siblings of the same tag
      const siblings = current.parentElement?.children;
      if (siblings && siblings.length > 1) {
        const index = Array.from(siblings).indexOf(current);
        selector += `:nth-child(${index + 1})`;
      }

      path.unshift(selector);
      current = current.parentElement;
    }

    return path.join(' > ');
  }

  /**
   * Whether content has already been processed
   */
  isContentProcessed(fingerprint: string): boolean {
    const info = this.processedContent.get(fingerprint);
    if (!info) return false;

    // Check expiry
    const now = Date.now();
    if (now - info.timestamp > this.CONTENT_TTL) {
      this.processedContent.delete(fingerprint);
      return false;
    }

    return true;
  }

  /**
   * Whether content is being processed
   */
  isContentProcessing(fingerprint: string): boolean {
    return this.activeProcessing.has(fingerprint);
  }

  /**
   * Marks content as being processed
   */
  markProcessingStart(fingerprint: string): boolean {
    if (
      this.isContentProcessed(fingerprint) ||
      this.isContentProcessing(fingerprint)
    ) {
      return false; // already processed or in progress
    }

    this.activeProcessing.add(fingerprint);
    return true;
  }

  /**
   * Marks content as processed
   */
  markProcessingComplete(
    fingerprint: string,
    domPath: string,
    replacementCount: number,
    success: boolean = true,
  ): void {
    // Clear the in-progress flag
    this.activeProcessing.delete(fingerprint);

    // Record as processed
    this.processedContent.set(fingerprint, {
      fingerprint,
      timestamp: Date.now(),
      domPath,
      processingResult: {
        replacementCount,
        success,
      },
    });
  }

  /**
   * Marks processing as failed
   */
  markProcessingFailed(fingerprint: string, domPath: string): void {
    this.markProcessingComplete(fingerprint, domPath, 0, false);
  }

  /**
   * Processing statistics
   */
  getProcessingStats(): {
    processedCount: number;
    activeCount: number;
    successRate: number;
    totalReplacements: number;
  } {
    const processed = Array.from(this.processedContent.values());
    const successful = processed.filter(
      (info) => info.processingResult.success,
    );
    const totalReplacements = processed.reduce(
      (sum, info) => sum + info.processingResult.replacementCount,
      0,
    );

    return {
      processedCount: processed.length,
      activeCount: this.activeProcessing.size,
      successRate:
        processed.length > 0 ? successful.length / processed.length : 0,
      totalReplacements,
    };
  }

  /**
   * Removes expired processing state
   */
  private cleanup(): void {
    const now = Date.now();
    const expired: string[] = [];

    for (const [fingerprint, info] of this.processedContent.entries()) {
      if (now - info.timestamp > this.CONTENT_TTL) {
        expired.push(fingerprint);
      }
    }

    expired.forEach((fingerprint) => {
      this.processedContent.delete(fingerprint);
    });

    // Expired state is removed silently
  }

  /**
   * Starts the cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = window.setInterval(() => {
      this.cleanup();
    }, this.CLEANUP_INTERVAL);
  }

  /**
   * Triggers cleanup manually
   */
  forceCleanup(): void {
    this.cleanup();
  }

  /**
   * Resets all state (for tests or emergencies)
   */
  reset(): void {
    this.processedContent.clear();
    this.activeProcessing.clear();
  }

  /**
   * Destroys the manager
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.reset();
  }
}

// Global singleton
export const globalProcessingState = new ProcessingStateManager();
