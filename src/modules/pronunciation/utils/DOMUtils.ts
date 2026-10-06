/**
 * DOM helpers
 * for pronunciation elements
 */

import { CSS_CLASSES } from '../config';

export class DOMUtils {
  /**
   * Generates a unique element ID
   * @param prefix prefix
   */
  static generateUniqueId(prefix = 'wxt'): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Adds a unique identifier to an element
   * @param element target element
   */
  static addUniqueId(element: HTMLElement): string {
    let id = element.getAttribute('data-wxt-id');
    if (!id) {
      id = this.generateUniqueId();
      element.setAttribute('data-wxt-id', id);
    }
    return id;
  }

  /**
   * Returns the element's unique key
   * @param element target element
   */
  static getElementKey(element: HTMLElement): string {
    return element.getAttribute('data-wxt-id') || 'unknown';
  }

  /**
   * Removes every element matching a selector
   * @param selector CSS selector
   */
  static cleanupElements(selector: string): void {
    const elements = document.querySelectorAll(selector);
    elements.forEach((element) => {
      try {
        element.remove();
      } catch (_) {
        console.info(_);
      }
    });
  }

  /**
   * Creates an inline phonetic element
   * @param phoneticText phonetic text
   */
  static createPhoneticInlineElement(phoneticText: string): HTMLElement {
    const phoneticSpan = document.createElement('span');
    phoneticSpan.className = CSS_CLASSES.PHONETIC_INLINE;
    phoneticSpan.textContent = ` ${phoneticText}`;
    phoneticSpan.style.cssText = `
      font-size: 0.85em;
      color: #666;
      margin-left: 2px;
      font-style: italic;
    `;
    return phoneticSpan;
  }

  /**
   * Extracts a list of words
   * @param text text
   */
  static extractWords(text: string): string[] {
    return text
      .split(/\s+/)
      .map((word) => word.trim())
      .filter((word) => word.length > 0 && /^[a-zA-Z\-']+$/.test(word))
      .map((word) => word.replace(/^[^\w\-']+|[^\w\-']+$/g, ''))
      .filter((word) => word.length > 0);
  }

  /**
   * Whether the element has a CSS class
   * @param element target element
   * @param className CSS class
   */
  static hasClass(element: HTMLElement, className: string): boolean {
    return element.classList.contains(className);
  }

  /**
   * Adds a CSS class safely
   * @param element target element
   * @param className CSS class
   */
  static addClass(element: HTMLElement, className: string): void {
    if (!this.hasClass(element, className)) {
      element.classList.add(className);
    }
  }

  /**
   * Removes a CSS class safely
   * @param element target element
   * @param className CSS class
   */
  static removeClass(element: HTMLElement, className: string): void {
    if (this.hasClass(element, className)) {
      element.classList.remove(className);
    }
  }

  /**
   * Toggles a CSS class
   * @param element target element
   * @param className CSS class
   */
  static toggleClass(element: HTMLElement, className: string): boolean {
    return element.classList.toggle(className);
  }

  /**
   * Sets an attribute safely
   * @param element target element
   * @param name attribute name
   * @param value attribute value
   */
  static setAttribute(element: HTMLElement, name: string, value: string): void {
    try {
      element.setAttribute(name, value);
    } catch (e) {
      console.warn(`Failed to set attribute: ${name}=${value}`, e);
    }
  }

  /**
   * Reads an attribute safely
   * @param element target element
   * @param name attribute name
   * @param defaultValue default value
   */
  static getAttribute(
    element: HTMLElement,
    name: string,
    defaultValue = '',
  ): string {
    try {
      return element.getAttribute(name) || defaultValue;
    } catch (e) {
      console.warn(`Failed to read attribute: ${name}`, e);
      return defaultValue;
    }
  }

  /**
   * Finds the closest ancestor with a CSS class
   * @param element starting element
   * @param className CSS class
   */
  static findClosestWithClass(
    element: HTMLElement,
    className: string,
  ): HTMLElement | null {
    let current: HTMLElement | null = element;
    while (current && current !== document.body) {
      if (this.hasClass(current, className)) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }
}
