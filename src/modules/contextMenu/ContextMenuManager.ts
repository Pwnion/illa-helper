/**
 * Context menu manager.
 * Updates the state of the browser context menu items (it no longer creates or removes items dynamically).
 */

import { browser } from 'wxt/browser';

import { WebsiteManager } from '../options/website-management/manager';
import {
  extractDomain,
  generateDomainPattern,
  generateExactPattern,
  generateRuleDescription,
  validateUrlForRule,
} from '../options/website-management/utils';
import type {
  ContextMenuActionType,
  UrlPatternType,
} from '../shared/types/core';

export class ContextMenuManager {
  private websiteManager: WebsiteManager;

  constructor(websiteManager: WebsiteManager) {
    this.websiteManager = websiteManager;
  }

  /**
   * Initialises the menu manager
   */
  async init(): Promise<void> {
    try {
      // Menu clicks
      browser.contextMenus.onClicked.addListener(
        this.handleMenuClick.bind(this),
      );

      // Tab updates change the menu state
      browser.tabs.onUpdated.addListener(this.handleTabUpdate.bind(this));
      browser.tabs.onActivated.addListener(this.handleTabActivated.bind(this));

      // Navigation events keep the menu in sync on SPA route changes
      browser.webNavigation.onCommitted.addListener(
        this.handleNavigation.bind(this),
      );

      // Initialise the menu for the current tab
      const tabs = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tabs[0]?.id && tabs[0]?.url) {
        await this.updateMenuState(tabs[0].id, tabs[0].url);
      }
    } catch (error) {
      console.error('Menu manager initialisation failed:', error);
    }
  }

  /**
   * Updates the menu state
   */
  private async updateMenuState(tabId: number, url: string): Promise<void> {
    console.log(
      `[ContextMenu] Updating menu state - TabID: ${tabId}, URL: ${url}`,
    );

    if (!url || !url.startsWith('http')) {
      console.log(`[ContextMenu] Invalid URL, hiding every item: ${url}`);
      await this.hideAllDynamicMenus();
      return;
    }

    try {
      // Validate the URL
      const validation = validateUrlForRule(url);
      if (!validation.valid) {
        console.log(
          `[ContextMenu] URL validation failed, hiding every item: ${validation.error || 'unknown reason'}`,
        );
        await this.hideAllDynamicMenus();
        return;
      }

      // Current website status
      const websiteStatus = await this.websiteManager.getWebsiteStatus(url);
      const domain = extractDomain(url);

      console.log(
        `[ContextMenu] Website status - Domain: ${domain}, Status: ${websiteStatus}`,
      );

      // Update visibility and titles from the website status
      await this.updateMenuVisibility(url, domain, websiteStatus);
    } catch (error) {
      console.error('[ContextMenu] Failed to update menu state:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        url,
        tabId,
        stack: error instanceof Error ? error.stack : undefined,
      });
      // Retry once before hiding the menu
      try {
        console.log('[ContextMenu] Retrying website status...');
        const websiteStatus = await this.websiteManager.getWebsiteStatus(url);
        const domain = extractDomain(url);
        await this.updateMenuVisibility(url, domain, websiteStatus);
      } catch (retryError) {
        console.error(
          '[ContextMenu] Retry failed, hiding every item:',
          retryError,
        );
        await this.hideAllDynamicMenus();
      }
    }
  }

  /**
   * Updates menu visibility from the website status
   */
  private async updateMenuVisibility(
    url: string,
    domain: string,
    websiteStatus: 'blacklisted' | 'whitelisted' | 'normal',
  ): Promise<void> {
    // Hide every dynamic item first
    await this.hideAllDynamicMenus();

    try {
      // Show the actions that apply to the current status
      if (websiteStatus === 'blacklisted') {
        // Blacklisted: offer removal and adding to the whitelist
        await browser.contextMenus.update('illa-remove-blacklist', {
          visible: true,
          title: `Remove ${domain} from blacklist`,
        });
        await browser.contextMenus.update('illa-add-whitelist-domain', {
          visible: true,
          title: `Add ${domain} to whitelist`,
        });
        await browser.contextMenus.update('illa-add-whitelist-exact', {
          visible: true,
          title: 'Add this page to whitelist',
        });
      } else if (websiteStatus === 'whitelisted') {
        // Whitelisted: offer removal and adding to the blacklist
        await browser.contextMenus.update('illa-remove-whitelist', {
          visible: true,
          title: `Remove ${domain} from whitelist`,
        });
        await browser.contextMenus.update('illa-add-blacklist-domain', {
          visible: true,
          title: `Add ${domain} to blacklist`,
        });
        await browser.contextMenus.update('illa-add-blacklist-exact', {
          visible: true,
          title: 'Add this page to blacklist',
        });
      } else {
        // No rule: offer adding
        await browser.contextMenus.update('illa-add-blacklist-domain', {
          visible: true,
          title: `Add ${domain} to blacklist`,
        });
        await browser.contextMenus.update('illa-add-blacklist-exact', {
          visible: true,
          title: 'Add this page to blacklist',
        });
        await browser.contextMenus.update('illa-add-whitelist-domain', {
          visible: true,
          title: `Add ${domain} to whitelist`,
        });
        await browser.contextMenus.update('illa-add-whitelist-exact', {
          visible: true,
          title: 'Add this page to whitelist',
        });
      }
    } catch (error) {
      console.error('Failed to update menu visibility:', error);
    }
  }

  /**
   * Hides every dynamic menu item
   */
  private async hideAllDynamicMenus(): Promise<void> {
    const dynamicMenuIds = [
      'illa-add-blacklist-domain',
      'illa-add-blacklist-exact',
      'illa-remove-blacklist',
      'illa-add-whitelist-domain',
      'illa-add-whitelist-exact',
      'illa-remove-whitelist',
    ];

    for (const menuId of dynamicMenuIds) {
      try {
        await browser.contextMenus.update(menuId, { visible: false });
      } catch (error) {
        console.error('Failed to update menu visibility:', error);
        // Ignore update failures
      }
    }
  }

  /**
   * Handles menu clicks
   */
  private async handleMenuClick(info: any, tab: any): Promise<void> {
    console.log(
      `[ContextMenu] Menu click - MenuID: ${info.menuItemId}, URL: ${tab?.url}`,
    );

    if (!tab?.url) {
      console.warn('[ContextMenu] Missing tab URL');
      this.showNotification('Action failed', 'Could not read the current page');
      return;
    }

    try {
      const url = tab.url;
      const domain = extractDomain(url);

      // The URL may differ from when the menu was shown
      console.log(
        `[ContextMenu] Handling page - URL: ${url}, Domain: ${domain}`,
      );

      // Parse the menu id
      if (info.menuItemId === 'illa-open-settings') {
        console.log('[ContextMenu] Opening settings');
        const optionsUrl = browser.runtime.getURL(
          '/options.html#website-management',
        );
        await browser.tabs.create({ url: optionsUrl });
        return;
      }

      // Add/remove actions
      if (typeof info.menuItemId === 'string') {
        console.log(
          `[ContextMenu] Handling menu action - Action: ${info.menuItemId}, Domain: ${domain}`,
        );
        await this.processMenuAction(info.menuItemId, url, domain);
      }
    } catch (error) {
      console.error('[ContextMenu] Menu click handling failed:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        menuItemId: info.menuItemId,
        url: tab?.url,
        stack: error instanceof Error ? error.stack : undefined,
      });
      this.showNotification(
        'Action failed',
        'An error occurred while handling the menu action',
      );
    }
  }

  /**
   * Handles a menu action
   */
  private async processMenuAction(
    menuItemId: string,
    url: string,
    domain: string,
  ): Promise<void> {
    let action: ContextMenuActionType;
    let patternType: UrlPatternType;
    let pattern: string;

    // Parse the menu id
    if (menuItemId.includes('add-blacklist-domain')) {
      action = 'add-to-blacklist';
      patternType = 'domain';
      pattern = generateDomainPattern(domain);
    } else if (menuItemId.includes('add-blacklist-exact')) {
      action = 'add-to-blacklist';
      patternType = 'exact';
      pattern = generateExactPattern(url);
    } else if (menuItemId.includes('add-whitelist-domain')) {
      action = 'add-to-whitelist';
      patternType = 'domain';
      pattern = generateDomainPattern(domain);
    } else if (menuItemId.includes('add-whitelist-exact')) {
      action = 'add-to-whitelist';
      patternType = 'exact';
      pattern = generateExactPattern(url);
    } else if (menuItemId.includes('remove-blacklist')) {
      action = 'remove-from-blacklist';
      patternType = 'domain';
      pattern = generateDomainPattern(domain);
    } else if (menuItemId.includes('remove-whitelist')) {
      action = 'remove-from-whitelist';
      patternType = 'domain';
      pattern = generateDomainPattern(domain);
    } else {
      return; // unknown menu item
    }

    // Execute
    await this.executeAction(action, pattern, patternType, url);
  }

  /**
   * Executes a website management action
   */
  private async executeAction(
    action: ContextMenuActionType,
    pattern: string,
    patternType: UrlPatternType,
    url: string,
  ): Promise<void> {
    console.log(
      `[ContextMenu] Executing - Action: ${action}, Pattern: ${pattern}, Type: ${patternType}`,
    );

    try {
      const type = action.includes('blacklist') ? 'blacklist' : 'whitelist';
      const description = generateRuleDescription(pattern, type);

      if (action.startsWith('add-to-')) {
        // Add a rule
        console.log(
          `[ContextMenu] Adding rule - Type: ${type}, Pattern: ${pattern}`,
        );
        await this.websiteManager.addRule(pattern, type, description);

        const actionText = type === 'blacklist' ? 'blacklist' : 'whitelist';
        const patternText = patternType === 'domain' ? 'site' : 'page';
        this.showNotification(
          'Rule added',
          `Added the ${patternText} to the ${actionText}`,
        );
      } else if (action.startsWith('remove-from-')) {
        // Remove a rule: find matching rules and delete them
        console.log(
          `[ContextMenu] Removing rule - Type: ${type}, Pattern: ${pattern}`,
        );
        const rules = await this.websiteManager.getRulesByType(type);
        const domain = extractDomain(url);
        const domainPattern = generateDomainPattern(domain);

        // Find matching rules; the domain item only removes rules for this domain.
        const matchingRules = rules.filter((rule) => {
          return rule.pattern === pattern || rule.pattern === domainPattern;
        });

        console.log(
          `[ContextMenu] Matching rules - Count: ${matchingRules.length}`,
        );

        for (const rule of matchingRules) {
          await this.websiteManager.removeRule(rule.id);
        }

        const actionText = type === 'blacklist' ? 'blacklist' : 'whitelist';
        const patternText =
          matchingRules.length > 0 ? 'the related rules' : 'the matching rule';
        this.showNotification(
          'Rule removed',
          `Removed ${patternText} from the ${actionText}`,
        );
      }

      // Refresh the menu state afterwards
      console.log('[ContextMenu] Action complete, refreshing menu state');
      const tabs = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tabs[0]?.id && tabs[0]?.url) {
        await this.updateMenuState(tabs[0].id, tabs[0].url);
      }
    } catch (error) {
      console.error('[ContextMenu] Action failed:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        action,
        pattern,
        patternType,
        url,
        stack: error instanceof Error ? error.stack : undefined,
      });
      this.showNotification(
        'Action failed',
        'An error occurred while executing the action',
      );
    }
  }

  /**
   * Shows a notification
   */
  private showNotification(title: string, message: string): void {
    browser.notifications.create({
      type: 'basic',
      iconUrl: browser.runtime.getURL('/icon/48.png'),
      title: title,
      message: message,
    });
  }

  /**
   * Handles tab updates
   */
  private async handleTabUpdate(
    tabId: number,
    changeInfo: any,
    tab: any,
  ): Promise<void> {
    // Update on URL change, load completion or title change (SPAs)
    if (
      changeInfo.url ||
      (changeInfo.status === 'complete' && tab.url) ||
      changeInfo.title
    ) {
      console.log(
        `[ContextMenu] Tab updated - TabID: ${tabId}, URL: ${tab.url}, Status: ${changeInfo.status}`,
      );
      await this.updateMenuState(tabId, tab.url!);
    }
  }

  /**
   * Handles tab activation
   */
  private async handleTabActivated(activeInfo: any): Promise<void> {
    try {
      const tab = await browser.tabs.get(activeInfo.tabId);
      if (tab.url) {
        await this.updateMenuState(activeInfo.tabId, tab.url);
      }
    } catch (error) {
      // Ignore failures to read the tab
      console.error('Failed to handle tab activation:', error);
    }
  }

  /**
   * Handles navigation events (for SPAs)
   */
  private async handleNavigation(details: any): Promise<void> {
    // Main frame only
    if (details.frameId === 0 && details.url) {
      console.log(
        `[ContextMenu] Navigation - URL: ${details.url}, TabID: ${details.tabId}`,
      );
      await this.updateMenuState(details.tabId, details.url);
    }
  }
}
