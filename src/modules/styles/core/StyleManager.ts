/**
 * Style manager:
 * translation text styles and CSS injection
 */

import { TranslationStyle } from '../../shared/types/core';
import { ALL_STYLES } from '../index';

export class StyleManager {
  private currentStyle: TranslationStyle;
  private customCSS: string = '';
  private customStyleElement: HTMLStyleElement | null = null;
  private mainStyleElement: HTMLStyleElement | null = null;

  constructor() {
    this.currentStyle = TranslationStyle.DEFAULT;
    // Inject base styles
    this.initializeStyles();
  }

  /**
   * Sets the translation style
   * @param style style type
   */
  setTranslationStyle(style: TranslationStyle): void {
    this.currentStyle = style;
  }

  /**
   * Sets custom CSS
   * @param css custom CSS
   */
  setCustomCSS(css: string): void {
    this.customCSS = css;
    this.updateCustomStyle();
  }

  /**
   * Current style class name
   * @returns class name
   */
  getCurrentStyleClass(): string {
    if (this.currentStyle === TranslationStyle.LEARNING) {
      return 'wxt-translation-term--learning';
    }
    if (this.currentStyle === TranslationStyle.CUSTOM) {
      return 'wxt-style-custom';
    }

    return `wxt-style-${this.currentStyle}`;
  }

  /**
   * Updates the custom style
   */
  private updateCustomStyle(): void {
    if (!this.customStyleElement) {
      this.customStyleElement = document.createElement('style');
      this.customStyleElement.id = 'wxt-custom-translation-style';
      document.head.appendChild(this.customStyleElement);
    }

    // Scope user CSS so it only applies to translation elements
    const safeCSS = this.customCSS?.trim()
      ? `.wxt-style-custom { ${this.customCSS} }`
      : '.wxt-style-custom { /* add custom CSS in settings */ }';

    this.customStyleElement.textContent = safeCSS;
  }

  /**
   * Injects the CSS
   * into the page
   */
  private initializeStyles(): void {
    // Avoid injecting twice
    if (this.mainStyleElement) {
      return;
    }

    this.mainStyleElement = document.createElement('style');
    this.mainStyleElement.id = 'wxt-main-styles';
    this.mainStyleElement.textContent = ALL_STYLES;
    document.head.appendChild(this.mainStyleElement);
  }

  /**
   * Removes the style element,
   * e.g. when a component unmounts
   */
  cleanup(): void {
    if (this.mainStyleElement && this.mainStyleElement.parentNode) {
      this.mainStyleElement.parentNode.removeChild(this.mainStyleElement);
      this.mainStyleElement = null;
    }

    if (this.customStyleElement && this.customStyleElement.parentNode) {
      this.customStyleElement.parentNode.removeChild(this.customStyleElement);
      this.customStyleElement = null;
    }
  }

  /**
   * Re-initialises styles
   * after an update or reset
   */
  reinitialize(): void {
    this.cleanup();
    this.initializeStyles();
    if (this.customCSS) {
      this.updateCustomStyle();
    }
  }
}
