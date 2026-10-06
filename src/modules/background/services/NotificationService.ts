/**
 * Notification service: every extension notification
 */

import { browser } from 'wxt/browser';
import {
  NotificationConfig,
  NotificationServiceConfig,
  NotificationError,
  BACKGROUND_CONSTANTS,
} from '../types';

export class NotificationService {
  private static instance: NotificationService | null = null;
  private config: NotificationServiceConfig;

  private constructor() {
    this.config = {
      defaultIconUrl: BACKGROUND_CONSTANTS.WARNING_ICON_PATH,
      defaultTimeout: BACKGROUND_CONSTANTS.NOTIFICATION_TIMEOUT,
      sessionStorageKey: BACKGROUND_CONSTANTS.SESSION_KEY_API_NOTIFICATION,
    };
  }

  /**
   * Returns the singleton instance
   */
  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  /**
   * Shows a basic notification
   */
  public async showNotification(
    notificationConfig: NotificationConfig,
  ): Promise<string> {
    try {
      const notificationId = await browser.notifications.create({
        type: 'basic',
        iconUrl:
          notificationConfig.iconUrl || browser.runtime.getURL('/warning.png'),
        title: notificationConfig.title,
        message: notificationConfig.message,
      });
      return notificationId || '';
    } catch (error) {
      console.error('Failed to create notification:', error);
      throw new NotificationError(
        `Failed to create notification: ${error instanceof Error ? error.message : 'unknown error'}`,
        { notificationConfig },
      );
    }
  }

  /**
   * Shows the API configuration error notification
   */
  public async showApiConfigError(
    source: 'user_action' | 'page_load',
  ): Promise<void> {
    const notificationConfig: NotificationConfig = {
      type: 'basic',
      title: '[ILLA Helper] API configuration error',
      message: 'No API key set. Click the extension icon to open settings.',
      iconUrl: browser.runtime.getURL('/warning.png'),
    };

    try {
      if (source === 'user_action') {
        await this.showNotification(notificationConfig);
      } else {
        const hasShown = await this.hasShownSessionNotification();
        if (!hasShown) {
          await this.showNotification(notificationConfig);
          await this.markSessionNotificationShown();
        }
      }
    } catch (error) {
      console.error(
        'Failed to show the API configuration error notification:',
        error,
      );
      throw error;
    }
  }

  /**
   * Shows a success notification
   */
  public async showSuccessNotification(
    title: string,
    message: string,
    iconUrl?: string,
  ): Promise<string> {
    return this.showNotification({
      type: 'basic',
      title,
      message,
      iconUrl: iconUrl || browser.runtime.getURL('/icon/48.png'),
    });
  }

  /**
   * Shows an error notification
   */
  public async showErrorNotification(
    title: string,
    message: string,
    error?: Error,
  ): Promise<string> {
    return this.showNotification({
      type: 'basic',
      title,
      message: error ? `${message}: ${error.message}` : message,
      iconUrl: browser.runtime.getURL('/warning.png'),
    });
  }

  /**
   * Shows a warning notification
   */
  public async showWarningNotification(
    title: string,
    message: string,
  ): Promise<string> {
    const config: NotificationConfig = {
      type: 'basic',
      title,
      message,
      iconUrl: browser.runtime.getURL('/warning.png'),
      priority: 1,
    };

    return this.showNotification(config);
  }

  /**
   * Shows a progress notification
   */
  public async showProgressNotification(
    title: string,
    message: string,
    progress: number,
  ): Promise<string> {
    const options = {
      type: 'progress' as chrome.notifications.TemplateType,
      title,
      message,
      iconUrl: browser.runtime.getURL('/icon/48.png'),
      priority: 1,
      progress: Math.max(0, Math.min(100, progress)), // clamp to 0-100
    } as chrome.notifications.NotificationCreateOptions;

    try {
      const notificationId = await browser.notifications.create(options);
      console.log(
        `Progress notification created: ${notificationId}, progress: ${progress}%`,
      );
      return notificationId || '';
    } catch (error) {
      console.error('Failed to create progress notification:', error);
      throw new NotificationError(
        `Failed to create progress notification: ${error instanceof Error ? error.message : 'unknown error'}`,
        { title, message, progress },
      );
    }
  }

  /**
   * Updates a progress notification
   */
  public async updateProgressNotification(
    notificationId: string,
    progress: number,
    message?: string,
  ): Promise<void> {
    try {
      const updateOptions: chrome.notifications.NotificationOptions = {
        progress: Math.max(0, Math.min(100, progress)),
      };

      if (message) {
        updateOptions.message = message;
      }

      await browser.notifications.update(notificationId, updateOptions);
      console.log(
        `Progress notification updated: ${notificationId}, progress: ${progress}%`,
      );
    } catch (error) {
      console.error('Failed to update progress notification:', error);
      throw new NotificationError(
        `Failed to update progress notification: ${error instanceof Error ? error.message : 'unknown error'}`,
        { notificationId, progress, message },
      );
    }
  }

  /**
   * Clears a notification
   */
  public async clearNotification(notificationId: string): Promise<void> {
    try {
      await browser.notifications.clear(notificationId);
      console.log(`Notification cleared: ${notificationId}`);
    } catch (error) {
      console.error('Failed to clear notification:', error);
      throw new NotificationError(
        `Failed to clear notification: ${error instanceof Error ? error.message : 'unknown error'}`,
        { notificationId },
      );
    }
  }

  /**
   * Clears every notification
   */
  public async clearAllNotifications(): Promise<void> {
    try {
      const notifications = await browser.notifications.getAll();
      const clearPromises = Object.keys(notifications).map((id) =>
        this.clearNotification(id),
      );
      await Promise.all(clearPromises);
      console.log('All notifications cleared');
    } catch (error) {
      console.error('Failed to clear all notifications:', error);
      throw new NotificationError(
        `Failed to clear all notifications: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  /**
   * Whether the session notification has been shown
   */
  private async hasShownSessionNotification(): Promise<boolean> {
    try {
      const result = await browser.storage.session.get(
        this.config.sessionStorageKey,
      );
      return !!result[this.config.sessionStorageKey];
    } catch (error) {
      console.error('Failed to check session notification state:', error);
      return false;
    }
  }

  /**
   * Marks the session notification as shown
   */
  private async markSessionNotificationShown(): Promise<void> {
    try {
      await browser.storage.session.set({
        [this.config.sessionStorageKey]: true,
      });
    } catch (error) {
      console.error('Failed to mark session notification state:', error);
    }
  }

  /**
   * Resets the session notification state
   */
  public async resetSessionNotificationStatus(): Promise<void> {
    try {
      await browser.storage.session.remove(this.config.sessionStorageKey);
    } catch (error) {
      console.error('Failed to reset session notification state:', error);
    }
  }

  /**
   * Registers the notification click listener
   */
  public setNotificationClickListener(
    callback: (notificationId: string) => void,
  ): void {
    browser.notifications.onClicked.addListener(callback);
  }

  /**
   * Registers the notification button listener
   */
  public setNotificationButtonClickListener(
    callback: (notificationId: string, buttonIndex: number) => void,
  ): void {
    if (browser.notifications.onButtonClicked) {
      browser.notifications.onButtonClicked.addListener(callback);
    }
  }

  /**
   * Registers the notification closed listener
   */
  public setNotificationCloseListener(
    callback: (notificationId: string, byUser: boolean) => void,
  ): void {
    browser.notifications.onClosed.addListener(callback);
  }

  /**
   * Updates the configuration
   */
  public updateConfig(newConfig: Partial<NotificationServiceConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Current configuration
   */
  public getConfig(): NotificationServiceConfig {
    return { ...this.config };
  }

  /**
   * Checks notification permission
   */
  public async checkNotificationPermission(): Promise<boolean> {
    try {
      // Extensions have notification permission by default; check anyway
      return browser.notifications !== undefined;
    } catch (error) {
      console.error('Failed to check notification permission:', error);
      return false;
    }
  }

  /**
   * Destroys the service
   */
  public destroy(): void {
    // Clean up any listeners
    console.log('Notification service destroyed');
    NotificationService.instance = null;
  }
}
