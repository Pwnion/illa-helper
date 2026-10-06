/**
 * Floating ball manager:
 * creates and manages the on-page translation floating ball
 */

import type { FloatingBallConfig } from '../../shared/types/ui';
import type { FloatingBallState, FloatingBallActionType } from '../types';
import { FLOATING_BALL_STYLES, DRAG_CONFIG, MENU_ACTIONS } from '../config';
import { safeSetInnerHTML } from '@/src/utils';
import { StorageService } from '../../core/storage';

export class FloatingBallManager {
  private config: FloatingBallConfig;
  private state: FloatingBallState;
  private rootHost: HTMLElement | null = null;
  private uiRoot: ShadowRoot | null = null;
  private ballElement: HTMLElement | null = null;
  private menuContainer: HTMLElement | null = null;
  private dragStartY = 0;
  private ballStartY = 0;
  private onTranslateCallback?: () => void;
  private savePositionTimer: number | null = null;

  private storageService: StorageService;
  // Event listener references
  private eventListeners: Array<{
    target: EventTarget;
    type: string;
    listener: EventListener;
    options?: boolean | AddEventListenerOptions;
  }> = [];
  // Double-click and touch detection
  private lastClickTime = 0;
  private clickDebounceTimer: number | null = null;
  private isTouchDevice = false;
  // Menu hover
  private menuHoverTimer: number | null = null;
  private menuItemsEventsBound = false; // prevents binding menu item events twice

  constructor(config: FloatingBallConfig) {
    this.config = config;
    this.state = {
      isDragging: false,
      isVisible: false,
      isMenuExpanded: false,
      currentPosition: config.position,
    };

    // Initialise services
    this.storageService = StorageService.getInstance();

    // Detect touch devices
    this.isTouchDevice =
      'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  /**
   * Binds an event listener and records it for cleanup
   */
  private bindEventListener<K extends keyof DocumentEventMap>(
    target: EventTarget,
    type: K,
    listener: (this: Document, ev: DocumentEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): void;
  private bindEventListener(
    target: EventTarget,
    type: string,
    listener: EventListener,
    options?: boolean | AddEventListenerOptions,
  ): void;
  private bindEventListener(
    target: EventTarget,
    type: string,
    listener: EventListener | ((ev: Event) => unknown),
    options?: boolean | AddEventListenerOptions,
  ): void {
    const wrappedListener = listener as EventListener;
    target.addEventListener(type, wrappedListener, options);
    this.eventListeners.push({
      target,
      type,
      listener: wrappedListener,
      options,
    });
  }

  /**
   * Removes every event listener
   */
  private removeAllEventListeners(): void {
    this.eventListeners.forEach(({ target, type, listener, options }) => {
      target.removeEventListener(type, listener, options);
    });
    this.eventListeners = [];
  }

  /**
   * Initialises the floating ball
   */
  init(onTranslate?: () => void): void {
    this.onTranslateCallback = onTranslate;

    if (this.config.enabled) {
      this.createBall();
      this.setupEventListeners();
      this.state.isVisible = true;
    }
  }

  /**
   * Updates the configuration
   */
  updateConfig(config: FloatingBallConfig): void {
    const wasEnabled = this.config.enabled;
    this.config = config;
    this.state.currentPosition = config.position;

    if (config.enabled && !wasEnabled) {
      // Disabled -> enabled
      this.createBall();
      this.setupEventListeners();
      this.state.isVisible = true;
    } else if (!config.enabled && wasEnabled) {
      // Enabled -> disabled
      this.destroy();
      this.state.isVisible = false;
    } else if (config.enabled && this.ballElement) {
      // Update styles
      this.updateBallStyle();
      // Keep the position exact
      this.calibratePosition();
    }
  }

  /**
   * Creates the floating ball element
   */
  private createBall(): void {
    if (this.ballElement) {
      this.ballElement.remove();
    }

    const uiRoot = this.ensureUiRoot();
    this.ballElement = document.createElement('div');
    this.ballElement.className = 'wxt-floating-ball';
    safeSetInnerHTML(this.ballElement, this.createBallIcon());

    // Initial tooltip
    this.updateTooltipText();

    this.updateBallStyle();
    this.createMenu();
    uiRoot.appendChild(this.ballElement);
  }

  private ensureUiRoot(): ShadowRoot {
    if (this.rootHost?.isConnected && this.uiRoot) {
      return this.uiRoot;
    }

    const existingHost = document.getElementById('illa-floating-root');
    if (existingHost) {
      existingHost.remove();
    }

    const host = document.createElement('illa-floating-root');
    host.id = 'illa-floating-root';
    host.style.cssText = `
      all: initial !important;
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      min-width: 0 !important;
      min-height: 0 !important;
      max-width: none !important;
      max-height: none !important;
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      overflow: visible !important;
      pointer-events: none !important;
      z-index: 2147483647 !important;
      background: transparent !important;
    `;

    const shadow = host.attachShadow({ mode: 'open' });
    const resetStyle = document.createElement('style');
    resetStyle.id = 'illa-floating-root-reset';
    resetStyle.textContent = `
      :host {
        all: initial !important;
        position: fixed !important;
        inset: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        min-width: 0 !important;
        min-height: 0 !important;
        max-width: none !important;
        max-height: none !important;
        margin: 0 !important;
        padding: 0 !important;
        border: 0 !important;
        overflow: visible !important;
        pointer-events: none !important;
        z-index: 2147483647 !important;
        background: transparent !important;
      }

      *, *::before, *::after {
        box-sizing: border-box;
      }

      .wxt-floating-ball,
      .wxt-floating-panel {
        pointer-events: auto;
      }
    `;
    shadow.appendChild(resetStyle);

    document.body.appendChild(host);
    this.rootHost = host;
    this.uiRoot = shadow;

    return shadow;
  }

  /**
   * Creates the menu container (card panel)
   */
  private createMenu(): void {
    if (this.menuContainer) {
      this.menuContainer.remove();
    }

    const uiRoot = this.ensureUiRoot();
    this.menuContainer = document.createElement('div');
    this.menuContainer.className = 'wxt-floating-panel';
    safeSetInnerHTML(this.menuContainer, this.createMenuItems());

    // Inject panel styles
    this.injectPanelStyles();

    uiRoot.appendChild(this.menuContainer);
    // Hidden initially
    this.updateMenuStyle();
  }

  /**
   * Creates the panel content
   */
  private createMenuItems(): string {
    // Translation state
    const hasTranslatedContent = this.hasTranslatedContent();
    const isTranslationHidden = document.body.classList.contains(
      'wxt-translation-hidden',
    );

    let statusClass = 'wxt-status--ready';
    let statusText = 'Ready to translate';
    if (hasTranslatedContent && !isTranslationHidden) {
      statusClass = 'wxt-status--translated';
      statusText = 'Showing translation';
    } else if (hasTranslatedContent && isTranslationHidden) {
      statusClass = 'wxt-status--original';
      statusText = 'Showing original';
    }

    const actionButtons = MENU_ACTIONS.map((action) => {
      const dangerClass = action.id === 'close' ? ' wxt-panel-btn--danger' : '';
      return `
        <div class="wxt-panel-btn${dangerClass}" data-action="${action.id}" title="${action.label}">
          <div class="wxt-btn-icon">${action.icon}</div>
          <span class="wxt-btn-label">${action.label}</span>
        </div>
      `;
    }).join('');

    return `
      <div class="wxt-panel-status">
        <span class="wxt-status-dot ${statusClass}"></span>
        <span class="wxt-status-text">${statusText}</span>
      </div>
      <div class="wxt-panel-divider"></div>
      <div class="wxt-panel-actions">
        ${actionButtons}
      </div>
    `;
  }

  /**
   * Injects the panel styles
   */
  private injectPanelStyles(): void {
    const uiRoot = this.ensureUiRoot();
    const styleId = 'wxt-floating-panel-styles';
    if (uiRoot.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .wxt-floating-panel {
        position: fixed;
        z-index: 9999;
        width: 180px;
        padding: 10px;
        border-radius: 12px;
        pointer-events: auto;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        background: rgba(255, 255, 255, 0.82);
        border: 1px solid rgba(106, 136, 224, 0.15);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(106, 136, 224, 0.1);
        backdrop-filter: blur(20px) saturate(1.4);
        -webkit-backdrop-filter: blur(20px) saturate(1.4);
        opacity: 0;
        transform: translateX(8px) scale(0.92);
        transform-origin: right center;
        transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .wxt-floating-panel.wxt-panel-visible {
        opacity: 1;
        transform: translateX(0) scale(1);
      }

      /* Status bar */
      .wxt-panel-status {
        display: flex;
        align-items: center;
        padding: 0 2px 8px 2px;
        gap: 6px;
      }
      .wxt-status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
        transition: background 0.3s ease, box-shadow 0.3s ease;
      }
      .wxt-status-dot.wxt-status--ready {
        background: #6A88E0;
        box-shadow: 0 0 6px rgba(106, 136, 224, 0.4);
      }
      .wxt-status-dot.wxt-status--translated {
        background: #00e676;
        box-shadow: 0 0 6px rgba(0, 230, 118, 0.4);
      }
      .wxt-status-dot.wxt-status--original {
        background: #ff6b6b;
        box-shadow: 0 0 6px rgba(255, 107, 107, 0.4);
      }
      .wxt-status-text {
        font-size: 12px;
        font-weight: 500;
        line-height: 1;
        color: #444;
        letter-spacing: 0.2px;
      }

      /* Divider */
      .wxt-panel-divider {
        height: 1px;
        background: rgba(106, 136, 224, 0.12);
        margin: 0 2px 8px 2px;
      }

      /* Action button grid */
      .wxt-panel-actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
      }
      .wxt-panel-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 4px;
        padding: 8px 0;
        border-radius: 8px;
        cursor: pointer;
        color: #555;
        background: transparent;
        border: none;
        transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease;
      }
      .wxt-panel-btn:hover {
        background: rgba(106, 136, 224, 0.1);
        color: #6A88E0;
        transform: translateY(-1px);
      }
      .wxt-panel-btn:active {
        transform: translateY(0) scale(0.96);
      }
      .wxt-panel-btn--danger:hover {
        background: rgba(239, 68, 68, 0.08);
        color: #EF4444;
      }
      .wxt-btn-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
      }
      .wxt-btn-icon svg {
        width: 18px;
        height: 18px;
      }
      .wxt-btn-label {
        font-size: 11px;
        font-weight: 400;
        line-height: 1;
      }

      /* Dark mode */
      @media (prefers-color-scheme: dark) {
        .wxt-floating-panel {
          background: rgba(30, 30, 36, 0.85);
          border-color: rgba(106, 136, 224, 0.2);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), 0 2px 8px rgba(0, 0, 0, 0.2);
        }
        .wxt-status-text {
          color: rgba(255, 255, 255, 0.8);
        }
        .wxt-panel-divider {
          background: rgba(255, 255, 255, 0.08);
        }
        .wxt-panel-btn {
          color: rgba(255, 255, 255, 0.7);
        }
        .wxt-panel-btn:hover {
          background: rgba(106, 136, 224, 0.2);
          color: #8BA4F0;
        }
        .wxt-panel-btn--danger:hover {
          background: rgba(239, 68, 68, 0.15);
          color: #ff7b7b;
        }
      }
    `;
    uiRoot.appendChild(style);
  }

  /**
   * Creates the floating ball icon.
   *
   * The look depends on the translation state:
   * - no translations: purple-blue gradient with a blue dot (ready)
   * - translations shown: purple-blue gradient with a green dot (showing translation)
   * - translations hidden: pink gradient with a red dot (showing original)
   *
   * @returns SVG icon markup
   */
  private createBallIcon(): string {
    const { iconSize } = FLOATING_BALL_STYLES;

    // Check translation state
    const hasTranslatedContent = this.hasTranslatedContent();
    const isTranslationHidden = document.body.classList.contains(
      'wxt-translation-hidden',
    );

    // The three states
    let stateConfig;
    if (!hasTranslatedContent) {
      // No translations: default (ready)
      stateConfig = {
        colors: { start: '#667eea', end: '#764ba2', dot: '#4f7cff' },
        opacity: '0.9',
      };
    } else if (isTranslationHidden) {
      // Translations hidden: showing original
      stateConfig = {
        colors: { start: '#f093fb', end: '#f5576c', dot: '#ff6b6b' },
        opacity: '0.8',
      };
    } else {
      // Translations visible: showing translation
      stateConfig = {
        colors: { start: '#667eea', end: '#764ba2', dot: '#00ff88' },
        opacity: '1',
      };
    }

    // Translation icon path (same icon for every state)
    const iconPath =
      'M16 10h2l4.4 11h-2.155l-1.201-3h-4.09l-1.199 3h-2.154L16 10zm1 2.885L15.753 16h2.492L17 12.885zM3 4h10v2H9v7h4v2H9v4H7v-4H3v-2h4V6H3V4zM17 3a4 4 0 0 1 4 4v2h-2V7a2 2 0 0 0-2-2h-3V3h3zM5 15v2a2 2 0 0 0 2 2h3v2H7a4 4 0 0 1-4-4v-2h2z';

    return `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${iconSize}" height="${iconSize}">
        <defs>
          <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:${stateConfig.colors.start};stop-opacity:1" />
            <stop offset="100%" style="stop-color:${stateConfig.colors.end};stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="${iconSize}" height="${iconSize}" fill="url(#bgGradient)" rx="4" ry="4" opacity="${stateConfig.opacity}"/>
        <path d="${iconPath}" fill="white" opacity="0.9"/>
        <circle cx="18" cy="6" r="2" fill="${stateConfig.colors.dot}" opacity="0.9"/>
      </svg>
    `;
  }

  /**
   * Injects the animation styles
   */
  private injectPulseAnimation(): void {
    const uiRoot = this.ensureUiRoot();
    const animationId = 'wxt-floating-ball-animation';
    if (uiRoot.getElementById(animationId)) return;

    const style = document.createElement('style');
    style.id = animationId;
    style.textContent = `
      @keyframes wxt-floating-ball-pulse {
        0%, 100% {
          transform: translateY(-50%) scale(0.9);
        }
        50% {
          transform: translateY(-50%) scale(1);
        }
      }
    `;
    uiRoot.appendChild(style);
  }

  /**
   * Calibrates the position so it is accurate and within bounds
   */
  private calibratePosition(): void {
    if (!this.ballElement) return;

    // Validate and correct the position
    const correctedPosition = this.validateAndCorrectPosition(
      this.config.position,
    );
    if (correctedPosition !== this.config.position) {
      this.config.position = correctedPosition;
      this.state.currentPosition = correctedPosition;
    }

    // Re-apply the position so it lines up exactly
    requestAnimationFrame(() => {
      if (this.ballElement) {
        this.ballElement.style.top = `${this.config.position}%`;
      }
    });
  }

  /**
   * Validates and corrects the position so it stays within safe bounds
   */
  private validateAndCorrectPosition(position: number): number {
    // Basic validity check
    if (!this.isValidPosition(position)) {
      return 50; // default: centred
    }

    // Bounds check and correction
    const windowHeight = window.innerHeight;
    const ballSize = FLOATING_BALL_STYLES.size;

    // Safe bounds as percentages
    const minSafePercent = (ballSize / 2 / windowHeight) * 100;
    const maxSafePercent = ((windowHeight - ballSize / 2) / windowHeight) * 100;

    // Clamp to the safe bounds
    const safePosition = Math.max(
      Math.max(DRAG_CONFIG.minPosition, minSafePercent),
      Math.min(Math.min(DRAG_CONFIG.maxPosition, maxSafePercent), position),
    );

    return safePosition;
  }

  /**
   * Updates the floating ball styles
   */
  private updateBallStyle(): void {
    if (!this.ballElement) return;

    const { size, right, background, boxShadow, transition, zIndex } =
      FLOATING_BALL_STYLES;

    // Inject animation styles
    this.injectPulseAnimation();

    const styles = `
      position: fixed;
      right: ${right};
      top: ${this.config.position}%;
      width: ${size}px;
      height: ${size}px;
      background: ${background};
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: ${boxShadow};
      opacity: ${this.config.opacity};
      z-index: ${zIndex};
      transition: ${transition};
      user-select: none;
      transform: translateY(-50%);
      animation: wxt-floating-ball-pulse 4s ease-in-out infinite;
    `;

    this.ballElement.style.cssText = styles;

    // Calibrate the position
    this.calibratePosition();
  }

  /**
   * Updates panel position and visibility
   */
  private updateMenuStyle(): void {
    if (!this.menuContainer || !this.ballElement) return;

    const ballRect = this.ballElement.getBoundingClientRect();

    // Place the panel to the left of the ball
    const gap = 8;
    const rightPos = window.innerWidth - ballRect.left + gap;

    // Vertically centre it on the ball
    const topPos = ballRect.top + ballRect.height / 2;

    this.menuContainer.style.right = `${rightPos}px`;
    this.menuContainer.style.top = `${topPos}px`;
    this.menuContainer.style.transform = this.state.isMenuExpanded
      ? 'translateY(-50%) translateX(0) scale(1)'
      : 'translateY(-50%) translateX(8px) scale(0.92)';

    if (this.state.isMenuExpanded) {
      this.menuContainer.classList.add('wxt-panel-visible');
      this.menuContainer.style.pointerEvents = 'auto';
    } else {
      this.menuContainer.classList.remove('wxt-panel-visible');
      this.menuContainer.style.pointerEvents = 'none';
    }
  }

  /**
   * Updates panel content when the state changes
   */
  private updateMenuItemPositions(): void {
    // The panel only needs its status updated, not per-item positioning
    if (!this.menuContainer) return;

    const hasTranslatedContent = this.hasTranslatedContent();
    const isTranslationHidden = document.body.classList.contains(
      'wxt-translation-hidden',
    );

    const dot = this.menuContainer.querySelector('.wxt-status-dot');
    const text = this.menuContainer.querySelector('.wxt-status-text');
    if (!dot || !text) return;

    dot.className = 'wxt-status-dot';
    if (hasTranslatedContent && !isTranslationHidden) {
      dot.classList.add('wxt-status--translated');
      text.textContent = 'Showing translation';
    } else if (hasTranslatedContent && isTranslationHidden) {
      dot.classList.add('wxt-status--original');
      text.textContent = 'Showing original';
    } else {
      dot.classList.add('wxt-status--ready');
      text.textContent = 'Ready to translate';
    }
  }

  /**
   * Sets up hover effects
   */
  private setupHoverEffects(): void {
    if (!this.ballElement) return;

    const {
      hoverBackground,
      hoverBoxShadow,
      background,
      boxShadow,
      hoverScale,
      activeBackground,
      activeBoxShadow,
    } = FLOATING_BALL_STYLES;

    // Mouse enter
    this.ballElement.addEventListener('mouseenter', () => {
      if (!this.state.isDragging && this.ballElement) {
        this.ballElement.style.background = hoverBackground;
        this.ballElement.style.transform = `translateY(-50%) scale(${hoverScale})`;
        this.ballElement.style.boxShadow = hoverBoxShadow;
      }
    });

    // Mouse leave
    this.ballElement.addEventListener('mouseleave', () => {
      if (!this.state.isDragging && this.ballElement) {
        this.ballElement.style.background = background;
        this.ballElement.style.transform = 'translateY(-50%) scale(1)';
        this.ballElement.style.boxShadow = boxShadow;
      }
    });

    // Press
    this.ballElement.addEventListener('mousedown', () => {
      if (this.ballElement) {
        this.ballElement.style.background = activeBackground;
        this.ballElement.style.boxShadow = activeBoxShadow;
      }
    });

    // Release
    this.ballElement.addEventListener('mouseup', () => {
      if (!this.state.isDragging && this.ballElement) {
        setTimeout(() => {
          if (this.ballElement) {
            this.ballElement.style.background = hoverBackground;
            this.ballElement.style.boxShadow = hoverBoxShadow;
          }
        }, 150); // briefly show the active state before returning to hover
      }
    });
  }

  /**
   * Sets up menu hover events
   */
  private setupMenuHoverEvents(): void {
    if (!this.ballElement || !this.menuContainer) return;

    // Show the menu when hovering the ball
    this.bindEventListener(this.ballElement, 'mouseenter', () => {
      this.showMenuOnHover();
    });

    // Hide the menu (with a delay) when leaving the ball
    this.bindEventListener(this.ballElement, 'mouseleave', () => {
      this.hideMenuOnLeave();
    });

    // Keep the menu open while hovering it
    this.bindEventListener(this.menuContainer, 'mouseenter', () => {
      this.showMenuOnHover();
    });

    // Hide the menu when leaving it
    this.bindEventListener(this.menuContainer, 'mouseleave', () => {
      this.hideMenuOnLeave();
    });

    // Tap to toggle the menu on touch devices
    if (this.isTouchDevice) {
      this.bindEventListener(this.ballElement, 'click', (e) => {
        if (!this.state.isDragging) {
          e.preventDefault();
          e.stopPropagation();
          // On touch devices a tap toggles the menu
          if (this.state.isMenuExpanded) {
            this.hideMenuOnLeave();
          } else {
            this.showMenuOnHover();
          }
        }
      });
    }
  }

  /**
   * Sets up event listeners
   */
  private setupEventListeners(): void {
    if (!this.ballElement) return;

    // Hover effects
    this.setupHoverEffects();

    // Menu hover events
    this.setupMenuHoverEvents();

    // Clicks, with double-click handling and debouncing
    this.bindEventListener(this.ballElement, 'click', (e) => {
      if (!this.state.isDragging) {
        e.preventDefault();
        e.stopPropagation();
        this.handleClickWithDebounce();
      }
    });

    // Touch events use passive: false so default behaviour can be prevented when needed,
    // but only when needed, so the rest of the page still scrolls normally
    this.bindEventListener(
      this.ballElement,
      'touchstart',
      this.handleTouchStart.bind(this),
      { passive: false },
    );
    this.bindEventListener(
      document,
      'touchmove',
      this.handleTouchMove.bind(this),
      { passive: false },
    );
    this.bindEventListener(
      document,
      'touchend',
      this.handleTouchEnd.bind(this),
      { passive: false },
    );

    // Mouse events as a fallback, with device detection
    this.bindEventListener(
      this.ballElement,
      'mousedown',
      this.handleMouseDown.bind(this),
    );
    this.bindEventListener(
      document,
      'mousemove',
      this.handleMouseMove.bind(this),
    );
    this.bindEventListener(document, 'mouseup', this.handleMouseUp.bind(this));
  }

  /**
   * Click handling with debouncing
   */
  private handleClickWithDebounce(): void {
    const currentTime = Date.now();
    const timeDiff = currentTime - this.lastClickTime;

    // Detect a double click (second click within 300 ms)
    if (timeDiff < 300) {
      // Double click: cancel the pending timer and do not translate
      if (this.clickDebounceTimer) {
        clearTimeout(this.clickDebounceTimer);
        this.clickDebounceTimer = null;
      }

      if (this.menuHoverTimer) {
        clearTimeout(this.menuHoverTimer);
        this.menuHoverTimer = null;
      }
      return;
    }

    this.lastClickTime = currentTime;

    // Clear any previous timer
    if (this.clickDebounceTimer) {
      clearTimeout(this.clickDebounceTimer);
    }

    // Translate after 100 ms (guards against rapid clicks)
    this.clickDebounceTimer = window.setTimeout(() => {
      this.handleTranslate();
      this.clickDebounceTimer = null;
    }, 100);
  }

  /**
   * Handles translation
   */
  private handleTranslate(): void {
    if (this.onTranslateCallback && this.ballElement) {
      this.onTranslateCallback();

      // Translation animation
      const { activeBackground, background } = FLOATING_BALL_STYLES;
      this.ballElement.style.background = activeBackground;

      setTimeout(() => {
        if (this.ballElement) {
          this.ballElement.style.background = background;
        }
      }, 1000);
    }
  }

  /**
   * Mouse down handling
   */
  private handleMouseDown(e: MouseEvent): void {
    // Avoid handling twice on touch devices
    if (this.isTouchDevice && e.target && 'ontouchstart' in e.target) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    this.state.isDragging = false;
    this.dragStartY = e.clientY;

    // Record the current position in pixels
    if (this.ballElement) {
      const rect = this.ballElement.getBoundingClientRect();
      this.ballStartY = rect.top + rect.height / 2; // y of the ball's centre
    }

    // Disable transitions so they do not interfere with dragging
    if (this.ballElement) {
      this.ballElement.style.transition = 'none';
    }
  }

  /**
   * Mouse move handling (filters events to avoid clashing with text selection)
   */
  private handleMouseMove(e: MouseEvent): void {
    // Only handle moves once the ball has actually been pressed
    if (
      !this.ballElement ||
      (!this.state.isDragging && this.dragStartY === 0)
    ) {
      return;
    }

    // The left button must be down
    if (e.buttons !== 1) {
      return;
    }

    // Avoid clashing with an active text selection
    const selection = window.getSelection();
    if (
      selection &&
      selection.toString().length > 0 &&
      !this.state.isDragging
    ) {
      // Ignore the event if text is selected and dragging has not started
      return;
    }

    // The event must belong to an interaction that started on the ball
    if (this.dragStartY === 0) {
      // No valid drag start point: ignore
      return;
    }

    // Start dragging once the movement passes the threshold
    const deltaY = Math.abs(e.clientY - this.dragStartY);
    if (deltaY > DRAG_CONFIG.threshold) {
      this.state.isDragging = true;
    }

    // Update the position while dragging
    if (this.state.isDragging) {
      e.preventDefault();
      e.stopPropagation();

      // Positions are viewport-based, not page-based
      const currentY = e.clientY; // clientY is already viewport-relative
      const windowHeight = window.innerHeight;
      const ballSize = FLOATING_BALL_STYLES.size;

      // New centre position (viewport coordinates)
      const moveY = currentY - this.dragStartY;
      const newPixelY = this.ballStartY + moveY;

      // Keep the ball inside the viewport
      const minPixelY = ballSize / 2;
      const maxPixelY = windowHeight - ballSize / 2;
      const clampedPixelY = Math.max(minPixelY, Math.min(maxPixelY, newPixelY));

      // Convert to a percentage of the viewport height (by centre)
      const newPositionPercent = (clampedPixelY / windowHeight) * 100;

      // Clamp to the configured range
      const finalPosition = Math.max(
        DRAG_CONFIG.minPosition,
        Math.min(DRAG_CONFIG.maxPosition, newPositionPercent),
      );

      // Validate the position
      if (this.isValidPosition(finalPosition)) {
        this.config.position = finalPosition;
        this.state.currentPosition = finalPosition;
        this.ballElement.style.top = `${finalPosition}%`;
      }
    }
  }

  /**
   * Whether a position is valid
   */
  private isValidPosition(position: number): boolean {
    return (
      typeof position === 'number' &&
      !isNaN(position) &&
      position >= 0 &&
      position <= 100
    );
  }

  /**
   * Mouse up handling (resets state cleanly and avoids text selection clashes)
   */
  private handleMouseUp(e: MouseEvent): void {
    // Avoid handling twice on touch devices
    if (this.isTouchDevice && e.target && 'ontouchstart' in e.target) {
      return;
    }

    // Only handle release when there is a valid drag start point
    if (this.dragStartY === 0) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    // Restore transitions
    if (this.ballElement) {
      this.ballElement.style.transition = FLOATING_BALL_STYLES.transition;
    }

    const wasDragging = this.state.isDragging;

    if (wasDragging) {
      // Final calibration
      this.calibratePosition();

      // Save the position (debounced)
      this.debouncedSavePosition();
    }

    // Reset every drag state
    this.state.isDragging = false;
    this.dragStartY = 0; // reset the drag start point
    this.ballStartY = 0;

    // After a drag, wait briefly before allowing clicks
    if (wasDragging) {
      // Flag that prevents an immediate click
      this.lastClickTime = Date.now();
    }
  }

  /**
   * Touch start handling (separate from mouse events to avoid clashes)
   */
  private handleTouchStart(e: TouchEvent): void {
    // Touch device with exactly one touch point
    if (e.touches.length !== 1) return;

    // Check whether the touch is on the ball
    if (this.ballElement) {
      const touch = e.touches[0];
      const ballRect = this.ballElement.getBoundingClientRect();

      // Is the touch within the ball?
      const isTouchOnBall =
        touch.clientX >= ballRect.left &&
        touch.clientX <= ballRect.right &&
        touch.clientY >= ballRect.top &&
        touch.clientY <= ballRect.bottom;

      // Only handle touches that are actually on the ball
      if (isTouchOnBall) {
        // Prevent default behaviour, but only on the ball
        e.preventDefault();
        e.stopPropagation();

        // Record the start position to tell taps from drags
        this.state.isDragging = false;
        this.dragStartY = touch.clientY;
        this.lastClickTime = Date.now(); // used to detect taps

        // Record the current position in pixels
        const rect = this.ballElement.getBoundingClientRect();
        this.ballStartY = rect.top + rect.height / 2; // y of the ball's centre

        // Visual feedback that the ball can be dragged
        this.ballElement.style.transform = 'translateY(-50%) scale(1.05)';

        // Disable transitions so they do not interfere with dragging
        this.ballElement.style.transition = 'none';

        // Show the menu (on touch devices the menu shows on tap)
        this.showMenuOnHover();
      } else {
        // Touch not on the ball: make sure the state is reset
        this.dragStartY = 0;
        this.ballStartY = 0;
      }
    }
  }

  /**
   * Touch move handling
   */
  private handleTouchMove(e: TouchEvent): void {
    if (!this.ballElement || e.touches.length !== 1) return;

    // Only prevent default behaviour once we know the ball is being dragged,
    // so the rest of the page still scrolls
    if (this.dragStartY !== 0) {
      const touch = e.touches[0];

      // Mark as dragging once started or past the threshold
      const deltaY = Math.abs(touch.clientY - this.dragStartY);
      // A smaller threshold makes dragging more responsive
      const dragThreshold = Math.min(DRAG_CONFIG.threshold, 5);

      if (deltaY > dragThreshold) {
        // Only block the page's default behaviour while dragging the ball
        e.preventDefault();
        e.stopPropagation();
        this.state.isDragging = true;
      }

      // Keep updating the position while dragging,
      // using the same calculation as mouse events
      const currentY = touch.clientY;
      const windowHeight = window.innerHeight;
      const ballSize = FLOATING_BALL_STYLES.size;

      // New centre position (viewport coordinates)
      const moveY = currentY - this.dragStartY;
      const newPixelY = this.ballStartY + moveY;

      // Keep the ball inside the viewport
      const minPixelY = ballSize / 2;
      const maxPixelY = windowHeight - ballSize / 2;
      const clampedPixelY = Math.max(minPixelY, Math.min(maxPixelY, newPixelY));

      // Convert to a percentage
      const newPositionPercent = (clampedPixelY / windowHeight) * 100;

      // Clamp to the configured range
      const finalPosition = Math.max(
        DRAG_CONFIG.minPosition,
        Math.min(DRAG_CONFIG.maxPosition, newPositionPercent),
      );

      // Validate the position
      if (this.isValidPosition(finalPosition)) {
        this.config.position = finalPosition;
        this.state.currentPosition = finalPosition;
        this.ballElement.style.top = `${finalPosition}%`;
      }
    }
  }

  /**
   * Touch end handling
   */
  private handleTouchEnd(e: TouchEvent): void {
    // Was this a tap or a drag on the ball?
    const touchOnBall = this.dragStartY !== 0;

    if (touchOnBall) {
      e.preventDefault();
      e.stopPropagation();

      // Restore transitions
      if (this.ballElement) {
        this.ballElement.style.transition = FLOATING_BALL_STYLES.transition;

        // Restore normal size
        this.ballElement.style.transform = 'translateY(-50%) scale(1)';
      }

      const wasDragging = this.state.isDragging;

      // If the ball was dragged, save the new position
      if (wasDragging) {
        // Final calibration
        this.calibratePosition();

        // Save the position (debounced)
        this.debouncedSavePosition();
      } else {
        // No drag (just a tap): translate
        const currentTime = Date.now();
        const timeDiff = currentTime - this.lastClickTime;

        // A short touch counts as a tap
        if (timeDiff < 300) {
          // Simulate a click
          this.handleTranslate();
        }
      }
    }

    // Always reset drag state so the state machine stays clean
    this.state.isDragging = false;
    this.dragStartY = 0;
    this.ballStartY = 0;
  }

  /**
   * Saves the position (debounced)
   */
  private debouncedSavePosition(): void {
    if (this.savePositionTimer) {
      clearTimeout(this.savePositionTimer);
    }

    this.savePositionTimer = window.setTimeout(() => {
      this.savePosition();
    }, 300); // 300 ms debounce
  }

  /**
   * Saves the position to storage
   */
  private async savePosition(): Promise<void> {
    try {
      const { StorageService } = await import('../../core/storage');
      const storageService = StorageService.getInstance();
      const settings = await storageService.getUserSettings();
      settings.floatingBall.position = this.config.position;
      await storageService.saveUserSettings(settings);
    } catch (error) {
      console.error('Failed to save the floating ball position:', error);
    }
  }

  /**
   * Shows the menu on hover or touch
   */
  private showMenuOnHover(): void {
    // Clear the hide timer
    if (this.menuHoverTimer) {
      clearTimeout(this.menuHoverTimer);
      this.menuHoverTimer = null;
    }

    // Show the menu immediately
    if (!this.state.isMenuExpanded) {
      this.state.isMenuExpanded = true;

      // Make sure the menu is positioned correctly
      this.updateMenuStyle();

      // Bind listeners the first time only
      if (!this.menuItemsEventsBound) {
        this.bindMenuItemListeners();
        this.menuItemsEventsBound = true;
      }

      // On touch devices, close the menu automatically after a delay
      if (this.isTouchDevice) {
        this.menuHoverTimer = window.setTimeout(() => {
          this.hideMenuOnLeave();
          this.menuHoverTimer = null;
        }, 3000); // close after 3 seconds
      }
    }
  }

  /**
   * Hides the menu (with a delay) when the pointer leaves
   */
  private hideMenuOnLeave(): void {
    // Clear any previous timer
    if (this.menuHoverTimer) {
      clearTimeout(this.menuHoverTimer);
    }

    // Wait 300 ms so the user can move onto the menu
    this.menuHoverTimer = window.setTimeout(() => {
      if (this.state.isMenuExpanded) {
        this.state.isMenuExpanded = false;
        this.updateMenuStyle();
      }
      this.menuHoverTimer = null;
    }, 300);
  }

  /**
   * Toggles the menu
   */
  private toggleMenu(): void {
    this.state.isMenuExpanded = !this.state.isMenuExpanded;
    this.updateMenuStyle();

    // Close the menu on any outside click
    if (this.state.isMenuExpanded) {
      this.bindEventListener(
        document,
        'click',
        this.handleDocumentClick.bind(this),
        true,
      );

      // Bind listeners the first time only
      if (!this.menuItemsEventsBound) {
        this.bindMenuItemListeners();
        this.menuItemsEventsBound = true;
      }
    }
  }

  /**
   * Handles document clicks (to close the menu)
   */
  private handleDocumentClick(e: MouseEvent): void {
    if (!this.ballElement || !this.menuContainer) return;

    const target = e.target as HTMLElement;

    // Clicks on the ball or inside the menu keep it open
    if (
      this.ballElement.contains(target) ||
      this.menuContainer.contains(target)
    ) {
      return;
    }

    // Close the menu
    if (this.state.isMenuExpanded) {
      this.state.isMenuExpanded = false;
      this.updateMenuStyle();
    }
  }

  /**
   * Handles a menu action
   */
  private handleMenuAction(action: FloatingBallActionType): void {
    // Clear hover timers
    if (this.menuHoverTimer) {
      clearTimeout(this.menuHoverTimer);
      this.menuHoverTimer = null;
    }

    // Close the menu first
    this.state.isMenuExpanded = false;
    this.updateMenuStyle();

    switch (action) {
      case 'translate':
        this.handleTranslate();
        break;

      case 'settings':
        this.openSettings();
        break;

      case 'close':
        this.closeBall();
        break;
      case 'options':
        this.openOptions();
        break;
      default:
        console.warn('Unknown menu action:', action);
    }
  }

  /**
   * Opens settings
   */
  private openSettings(): void {
    try {
      // Open the popup through the extension API
      browser.runtime.sendMessage({ type: 'open-popup' });
    } catch (error) {
      console.error('Failed to open settings:', error);
    }
  }

  /**
   * Opens the options page
   */
  private openOptions(): void {
    try {
      browser.runtime.sendMessage({ type: 'open-options' });
    } catch (error) {
      console.error('Failed to open options:', error);
    }
  }

  /**
   * Closes the floating ball
   */
  private closeBall(): void {
    // Clear every timer
    if (this.menuHoverTimer) {
      clearTimeout(this.menuHoverTimer);
      this.menuHoverTimer = null;
    }
    if (this.clickDebounceTimer) {
      clearTimeout(this.clickDebounceTimer);
      this.clickDebounceTimer = null;
    }

    // Reset menu state
    this.state.isMenuExpanded = false;
    this.menuItemsEventsBound = false;

    // Hide the elements
    this.state.isVisible = false;
    if (this.ballElement) {
      this.ballElement.style.display = 'none';
    }
    if (this.menuContainer) {
      this.menuContainer.style.display = 'none';
    }
  }

  /**
   * Binds menu item event listeners
   */
  private bindMenuItemListeners(): void {
    if (!this.menuContainer) return;

    const menuItems = this.menuContainer.querySelectorAll('.wxt-panel-btn');
    menuItems.forEach((item) => {
      const element = item as HTMLElement;
      const action = element.dataset.action as FloatingBallActionType;

      this.bindEventListener(element, 'click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.handleMenuAction(action);
      });
    });
  }

  /**
   * Current state
   */
  getState(): FloatingBallState {
    return { ...this.state };
  }

  /**
   * Updates the translation state indicator.
   *
   * Smooth visual transition:
   * 1. shrink the ball (0.1 s)
   * 2. update the icon and tooltip
   * 3. restore the ball's size (0.1 s)
   *
   * Performance:
   * - requestAnimationFrame keeps the animation smooth
   * - every changed property is updated at once
   */
  updateTranslationStateIndicator(): void {
    if (!this.ballElement) return;

    // Start the scale animation
    this.startTransitionAnimation();

    // Update the content after a delay for a smooth transition
    setTimeout(() => {
      this.updateBallContent();
      this.updateMenuItemPositions(); // keep the panel state in sync
      this.endTransitionAnimation();
    }, 100);
  }

  /**
   * Starts the transition
   * @private
   */
  private startTransitionAnimation(): void {
    if (!this.ballElement) return;

    this.ballElement.style.transition = 'transform 0.2s ease-out';
    this.ballElement.style.transform = 'translateY(-50%) scale(0.8)';
  }

  /**
   * Updates the ball's content
   * @private
   */
  private updateBallContent(): void {
    if (!this.ballElement) return;

    // Update the icon using the safe HTML setter
    safeSetInnerHTML(this.ballElement, this.createBallIcon());

    // Update the tooltip
    this.updateTooltipText();
  }

  /**
   * Ends the transition
   * @private
   */
  private endTransitionAnimation(): void {
    if (!this.ballElement) return;

    this.ballElement.style.transform = 'translateY(-50%) scale(1)';
  }

  /**
   * Updates the tooltip text
   * @private
   */
  private updateTooltipText(): void {
    if (!this.ballElement) return;

    // Check translation state
    const hasTranslatedContent = this.hasTranslatedContent();
    const isTranslationHidden = document.body.classList.contains(
      'wxt-translation-hidden',
    );

    // Pick the tooltip text
    let modeText;
    if (!hasTranslatedContent) {
      modeText = 'Ready to translate';
    } else if (isTranslationHidden) {
      modeText = 'Showing original';
    } else {
      modeText = 'Showing translation';
    }

    this.ballElement.title = `${modeText}`;
  }

  private hasTranslatedContent(): boolean {
    return (
      document.querySelector('.wxt-translation-term') !== null ||
      document.querySelector('.illa-paragraph-translation') !== null ||
      document.querySelector('.illa-st') !== null
    );
  }

  /**
   * Shows a notification message
   */
  private showNotification(message: string): void {
    // Simple notification toast
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #333;
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 14px;
      z-index: 10001;
      opacity: 0;
      transition: opacity 0.3s ease;
      max-width: 300px;
      word-wrap: break-word;
    `;
    notification.textContent = message;

    document.body.appendChild(notification);

    // Show animation
    setTimeout(() => {
      notification.style.opacity = '1';
    }, 10);

    // Hide after 3 seconds
    setTimeout(() => {
      notification.style.opacity = '0';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 3000);
  }

  /**
   * Destroys the floating ball and releases every resource
   */
  destroy(): void {
    // Remove the ball element
    if (this.ballElement) {
      this.ballElement.remove();
      this.ballElement = null;
    }

    // Remove the menu container
    if (this.menuContainer) {
      this.menuContainer.remove();
      this.menuContainer = null;
    }

    if (this.rootHost) {
      this.rootHost.remove();
      this.rootHost = null;
      this.uiRoot = null;
    }

    // Remove every event listener
    this.removeAllEventListeners();

    // Clear every timer
    if (this.savePositionTimer) {
      clearTimeout(this.savePositionTimer);
      this.savePositionTimer = null;
    }

    if (this.clickDebounceTimer) {
      clearTimeout(this.clickDebounceTimer);
      this.clickDebounceTimer = null;
    }

    if (this.menuHoverTimer) {
      clearTimeout(this.menuHoverTimer);
      this.menuHoverTimer = null;
    }

    // Reset state
    this.state = {
      isDragging: false,
      isVisible: false,
      isMenuExpanded: false,
      currentPosition: 50,
    };

    // Reset other properties
    this.dragStartY = 0;
    this.ballStartY = 0;
    this.lastClickTime = 0;
    this.menuItemsEventsBound = false;
    this.onTranslateCallback = undefined;
  }
}
