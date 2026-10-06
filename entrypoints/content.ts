import { ContentManager } from '@/src/modules/content/ContentManager';

/**
 * Content script entry point.
 * Initialises and manages the content-side services.
 */
export default defineContentScript({
  // Match every site
  matches: ['<all_urls>'],

  async main() {
    const contentManager = new ContentManager();

    try {
      await contentManager.init();
    } catch (error) {
      console.error('[Content Script] Initialisation failed:', error);
      contentManager.destroy();
    }

    // Clean up when the page unloads
    window.addEventListener('beforeunload', () => {
      contentManager.destroy();
    });
  },
});
