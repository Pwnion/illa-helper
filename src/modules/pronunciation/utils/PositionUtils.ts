/**
 * Tooltip positioning
 * helpers
 */

import { UI_CONSTANTS } from '../config';

export type TooltipPosition = 'top' | 'bottom' | 'auto';

export interface PositionResult {
  left: number;
  top: number;
  arrowClass: string;
}

export class PositionUtils {
  /**
   * Positions a tooltip
   * @param element target element
   * @param tooltip tooltip element
   * @param zIndex z-index
   * @param position preferred position
   */
  static positionTooltip(
    element: HTMLElement,
    tooltip: HTMLElement,
    zIndex: number = UI_CONSTANTS.TOOLTIP_Z_INDEX,
    position: TooltipPosition = 'auto',
  ): void {
    // Apply base styles first so the tooltip can be measured
    tooltip.style.cssText = `
      position: fixed;
      visibility: hidden;
      z-index: ${zIndex};
    `;

    const positionResult = this.calculatePosition(element, tooltip, position);

    // Update the arrow
    const arrow = tooltip.querySelector('.wxt-tooltip-arrow');
    if (arrow) {
      arrow.className = positionResult.arrowClass;
    }

    // Apply the final position
    tooltip.style.cssText = `
      position: fixed;
      left: ${positionResult.left}px;
      top: ${positionResult.top}px;
      z-index: ${zIndex};
      visibility: visible;
    `;
  }

  /**
   * Calculates the tooltip position
   * @param element target element
   * @param tooltip tooltip element
   * @param position preferred position
   */
  static calculatePosition(
    element: HTMLElement,
    tooltip: HTMLElement,
    position: TooltipPosition = 'auto',
  ): PositionResult {
    const rect = element.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = UI_CONSTANTS.TOOLTIP_PADDING;

    // Horizontal position (centred)
    let left = rect.left + (rect.width - tooltipRect.width) / 2;
    if (left < padding) {
      left = padding;
    } else if (left + tooltipRect.width > viewportWidth - padding) {
      left = viewportWidth - tooltipRect.width - padding;
    }

    // Vertical position
    let top: number;
    let arrowClass: string;

    if (position === 'bottom') {
      // Force below
      top = rect.bottom + 12;
      arrowClass = 'wxt-tooltip-arrow wxt-tooltip-arrow-top';
    } else if (position === 'top') {
      // Force above
      top = rect.top - tooltipRect.height - 12;
      arrowClass = 'wxt-tooltip-arrow';
    } else {
      // Automatic (prefer above)
      top = rect.top - tooltipRect.height - 12;
      arrowClass = 'wxt-tooltip-arrow';

      // Not enough room above: show below
      if (top < padding) {
        top = rect.bottom + 12;
        arrowClass = 'wxt-tooltip-arrow wxt-tooltip-arrow-top';
      }
    }

    // Vertical bounds check
    if (top + tooltipRect.height > viewportHeight - padding) {
      top = viewportHeight - tooltipRect.height - padding;
    }

    return { left, top, arrowClass };
  }

  /**
   * Whether the element is inside the viewport
   * @param element target element
   */
  static isElementInViewport(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= window.innerHeight &&
      rect.right <= window.innerWidth
    );
  }

  /**
   * Element position relative to the viewport
   * @param element target element
   */
  static getElementViewportInfo(element: HTMLElement): {
    rect: DOMRect;
    isInViewport: boolean;
    distanceFromTop: number;
    distanceFromBottom: number;
    distanceFromLeft: number;
    distanceFromRight: number;
  } {
    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    return {
      rect,
      isInViewport: this.isElementInViewport(element),
      distanceFromTop: rect.top,
      distanceFromBottom: viewportHeight - rect.bottom,
      distanceFromLeft: rect.left,
      distanceFromRight: viewportWidth - rect.right,
    };
  }
}
