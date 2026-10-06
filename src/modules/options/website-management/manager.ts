import glob from './glob';
import { WebsiteRule, WebsiteManagementSettings, WebsiteStatus } from './types';

// Default settings
const DEFAULT_SETTINGS: WebsiteManagementSettings = { rules: [] };
const STORAGE_KEY = 'website-management-settings';

export class WebsiteManager {
  private settingsCache: WebsiteManagementSettings | null = null;
  private cacheTimestamp: number | null = null;

  /**
   * Returns the website's rule status
   */
  async getWebsiteStatus(url: string): Promise<WebsiteStatus> {
    console.log(`[WebsiteManager] Getting website status: ${url}`);

    // Keep the cache unless it has expired
    const settings = await this.getSettings();

    // Clear the cache when it is more than 5 seconds old
    const now = Date.now();
    if (this.cacheTimestamp && now - this.cacheTimestamp > 5000) {
      console.log('[WebsiteManager] Cache expired, clearing');
      this.clearCache();
    }

    // Blacklist rules take priority
    const blacklistRules = settings.rules.filter(
      (rule) => rule.type === 'blacklist' && rule.enabled,
    );

    for (const rule of blacklistRules) {
      if (glob.match(rule.pattern, url)) {
        console.log(`[WebsiteManager] Matched blacklist rule: ${rule.pattern}`);
        return 'blacklisted';
      }
    }

    // Then whitelist rules
    const whitelistRules = settings.rules.filter(
      (rule) => rule.type === 'whitelist' && rule.enabled,
    );

    for (const rule of whitelistRules) {
      if (glob.match(rule.pattern, url)) {
        console.log(`[WebsiteManager] Matched whitelist rule: ${rule.pattern}`);
        return 'whitelisted';
      }
    }

    console.log('[WebsiteManager] No rule matched');
    return 'normal';
  }

  /**
   * Whether the site is blacklisted
   */
  async isBlacklisted(url: string): Promise<boolean> {
    const status = await this.getWebsiteStatus(url);
    return status === 'blacklisted';
  }

  /**
   * Whether the site is whitelisted
   */
  async isWhitelisted(url: string): Promise<boolean> {
    const status = await this.getWebsiteStatus(url);
    return status === 'whitelisted';
  }

  /**
   * Returns every rule
   */
  async getRules(): Promise<WebsiteRule[]> {
    const settings = await this.getSettings();
    return settings.rules;
  }

  /**
   * Returns the rules of one type
   */
  async getRulesByType(
    type: 'blacklist' | 'whitelist',
  ): Promise<WebsiteRule[]> {
    // Clear the cache to get the latest rules
    this.clearCache();
    const settings = await this.getSettings();
    return settings.rules.filter((rule) => rule.type === type);
  }

  /**
   * Adds a rule
   */
  async addRule(
    pattern: string,
    type: 'blacklist' | 'whitelist',
    description?: string,
  ): Promise<void> {
    if (!pattern) return;

    // Force-clear the cache so stale data cannot resurrect deleted rules
    this.clearCache();
    const settings = await this.getSettings();

    // Look for an existing rule with the same pattern (any type)
    const existingRule = settings.rules.find(
      (rule) => rule.pattern === pattern,
    );

    if (existingRule) {
      if (existingRule.type === type) {
        return; // an identical rule already exists
      } else {
        // A pattern can only have one rule type.
        const ruleIndex = settings.rules.findIndex(
          (rule) => rule.id === existingRule.id,
        );
        if (ruleIndex > -1) {
          settings.rules.splice(ruleIndex, 1);
        }
      }
    }

    const newRule: WebsiteRule = {
      id: this.generateId(),
      pattern,
      type,
      enabled: true,
      createdAt: new Date(),
      description,
    };

    settings.rules.push(newRule);
    await this.saveSettings(settings);
    this.clearCache(); // keep the data fresh
  }

  /**
   * Updates a rule
   */
  async updateRule(id: string, updates: Partial<WebsiteRule>): Promise<void> {
    const settings = await this.getSettings();
    const ruleIndex = settings.rules.findIndex((rule) => rule.id === id);

    if (ruleIndex === -1) {
      throw new Error('Rule not found');
    }

    settings.rules[ruleIndex] = {
      ...settings.rules[ruleIndex],
      ...updates,
    };

    await this.saveSettings(settings);
    this.clearCache(); // keep the data fresh
  }

  /**
   * Removes a rule
   */
  async removeRule(id: string): Promise<void> {
    const settings = await this.getSettings();
    const ruleIndex = settings.rules.findIndex((rule) => rule.id === id);

    if (ruleIndex > -1) {
      settings.rules.splice(ruleIndex, 1);
      await this.saveSettings(settings);
      this.clearCache(); // keep the data fresh
    }
  }

  /**
   * Removes several rules
   */
  async removeRules(ids: string[]): Promise<void> {
    const settings = await this.getSettings();
    settings.rules = settings.rules.filter((rule) => !ids.includes(rule.id));
    await this.saveSettings(settings);
    this.clearCache(); // keep the data fresh
  }

  /**
   * Replaces the website rules with rules in the current format.
   */
  async replaceRules(rules: WebsiteRule[]): Promise<number> {
    const normalizedSettings = this.normalizeSettings({ rules });
    await this.saveSettings(normalizedSettings);
    this.clearCache();
    return normalizedSettings.rules.length;
  }

  /**
   * Enables or disables a rule
   */
  async toggleRule(id: string): Promise<void> {
    const settings = await this.getSettings();
    const rule = settings.rules.find((rule) => rule.id === id);

    if (rule) {
      rule.enabled = !rule.enabled;
      await this.saveSettings(settings);
      this.clearCache(); // keep the data fresh
    }
  }

  /**
   * Loads the settings
   */
  private async getSettings(): Promise<WebsiteManagementSettings> {
    if (this.settingsCache) {
      return this.settingsCache;
    }

    try {
      const result = await browser.storage.sync.get(STORAGE_KEY);
      if (result && result[STORAGE_KEY]) {
        const settings = this.normalizeSettings(
          JSON.parse(result[STORAGE_KEY]),
        );
        this.settingsCache = settings;
        this.cacheTimestamp = Date.now();
        return settings;
      }

      this.settingsCache = DEFAULT_SETTINGS;
      return DEFAULT_SETTINGS;
    } catch (error) {
      console.error('Failed to load website management settings:', error);
      this.settingsCache = DEFAULT_SETTINGS;
      return DEFAULT_SETTINGS;
    }
  }

  /**
   * Saves the settings
   */
  private async saveSettings(
    settings: WebsiteManagementSettings,
  ): Promise<void> {
    try {
      const serializedSettings = JSON.stringify(settings);
      await browser.storage.sync.set({ [STORAGE_KEY]: serializedSettings });
      this.settingsCache = settings;
      this.cacheTimestamp = Date.now(); // refresh the cache
    } catch (error) {
      console.error('Failed to save website management settings:', error);
    }
  }

  private normalizeSettings(rawSettings: unknown): WebsiteManagementSettings {
    if (!rawSettings || typeof rawSettings !== 'object') {
      return DEFAULT_SETTINGS;
    }

    const settings = rawSettings as Partial<WebsiteManagementSettings>;
    const rawRules = Array.isArray(settings.rules) ? settings.rules : [];

    return {
      rules: rawRules
        .map((rule) => this.normalizeRule(rule))
        .filter((rule): rule is WebsiteRule => rule !== null),
    };
  }

  private normalizeRule(rawRule: unknown): WebsiteRule | null {
    if (!rawRule || typeof rawRule !== 'object') {
      return null;
    }

    const rule = rawRule as Partial<WebsiteRule>;
    if (
      !rule.id ||
      !rule.pattern ||
      typeof rule.enabled !== 'boolean' ||
      !rule.createdAt ||
      (rule.type !== 'blacklist' && rule.type !== 'whitelist')
    ) {
      return null;
    }

    const createdAt = new Date(rule.createdAt);
    if (Number.isNaN(createdAt.getTime())) {
      return null;
    }

    return {
      id: rule.id,
      pattern: rule.pattern,
      type: rule.type,
      enabled: rule.enabled,
      createdAt,
      description: rule.description,
    };
  }

  /**
   * Generates a unique ID
   */
  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  /**
   * Clears the cache
   */
  clearCache(): void {
    this.settingsCache = null;
    this.cacheTimestamp = null;
  }
}
