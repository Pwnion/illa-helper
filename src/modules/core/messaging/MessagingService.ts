/**
 * Messaging service.
 * Handles communication between extension parts: tab messages, background messages and context menu actions.
 *
 * Features:
 * - messages to tabs
 * - messages to the background script
 * - context menu actions
 * - listener registration and routing
 * - error handling and retries
 */

import { browser } from 'wxt/browser';
import { UserSettings, ContextMenuMessage } from '../../shared/types/storage';
import { ContextMenuActionType, UrlPatternType } from '../../shared/types/core';
import {
  MessagingServiceConfig,
  MessageSendResult,
  TabQueryOptions,
  MessageSendOptions,
  MessageListener,
  MessageType,
  Message,
  SettingsUpdateMessage,
  WebsiteManagementUpdateMessage,
  ContextMenuActionMessage,
  NotificationMessage,
} from './types';

// ==================== Messaging service ====================

/**
 * Messaging service
 * (singleton)
 */
export class MessagingService {
  private static instance: MessagingService;

  // Configuration and state
  private readonly config: MessagingServiceConfig;
  private messageListeners: Map<string, MessageListener[]> = new Map();
  private messageHistory: Message[] = [];
  private maxHistorySize = 100;

  /**
   * Private constructor (singleton)
   */
  private constructor(config: MessagingServiceConfig = {}) {
    this.config = {
      enableLogging: true,
      defaultTimeout: 5000,
      maxRetries: 3,
      enableBroadcast: false,
      ...config,
    };
  }

  /**
   * Returns the singleton instance
   * @param config optional service configuration
   * @returns MessagingService instance
   */
  public static getInstance(config?: MessagingServiceConfig): MessagingService {
    if (!MessagingService.instance) {
      MessagingService.instance = new MessagingService(config);
    }
    return MessagingService.instance;
  }

  // ==================== Listeners ====================

  /**
   * Adds a message listener
   * @param messageType message type
   * @param listener listener
   */
  public addMessageListener(
    messageType: string,
    listener: MessageListener,
  ): void {
    if (!this.messageListeners.has(messageType)) {
      this.messageListeners.set(messageType, []);
    }
    this.messageListeners.get(messageType)!.push(listener);
  }

  /**
   * Removes a message listener
   * @param messageType message type
   * @param listener listener
   */
  public removeMessageListener(
    messageType: string,
    listener: MessageListener,
  ): void {
    const listeners = this.messageListeners.get(messageType);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Handles a received message
   * @param message message
   * @param sender sender information
   */
  private async handleMessage(message: Message, sender?: any): Promise<any> {
    this.addToHistory(message);

    if (this.config.enableLogging) {
      console.log(
        '[MessagingService] Received message:',
        message.type,
        message,
      );
    }

    const listeners = this.messageListeners.get(message.type);
    if (listeners && listeners.length > 0) {
      const results = await Promise.allSettled(
        listeners.map((listener) => listener(message, sender)),
      );

      // Handle listener results
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.error(
            `[MessagingService] Listener ${index} failed:`,
            result.reason,
          );
        }
      });

      return results[0].status === 'fulfilled' ? results[0].value : undefined;
    }
  }

  /**
   * Adds a message to the history
   * @param message message
   */
  private addToHistory(message: Message): void {
    message.timestamp = Date.now();
    message.id = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    this.messageHistory.push(message);

    // Cap the history size
    if (this.messageHistory.length > this.maxHistorySize) {
      this.messageHistory.shift();
    }
  }

  // ==================== Tab messaging ====================

  /**
   * Queries tabs
   * @param options query options
   * @returns tabs
   */
  private async queryTabs(options: TabQueryOptions = {}): Promise<any[]> {
    try {
      return await browser.tabs.query({
        active: true,
        currentWindow: true,
        ...options,
      });
    } catch (error) {
      console.error('[MessagingService] Tab query failed:', error);
      return [];
    }
  }

  /**
   * Sends a message to a tab
   * @param tabId tab id
   * @param message message
   * @param options send options
   * @returns send result
   */
  public async sendToTab(
    tabId: number,
    message: Message,
    options: MessageSendOptions = {},
  ): Promise<MessageSendResult> {
    try {
      const response = await browser.tabs.sendMessage(tabId, message);

      if (this.config.enableLogging) {
        console.log('[MessagingService] Sent to tab:', tabId, message.type);
      }

      return { success: true, response };
    } catch (error) {
      const errorMessage = `Failed to send message to tab ${tabId}: ${error}`;
      console.error('[MessagingService]', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Broadcasts a message to every active tab
   * @param message message
   * @param options send options
   * @returns send results
   */
  public async broadcastToTabs(
    message: Message,
    options: MessageSendOptions = {},
  ): Promise<MessageSendResult[]> {
    const tabs = await this.queryTabs();
    const results: MessageSendResult[] = [];

    for (const tab of tabs) {
      if (tab.id) {
        const result = await this.sendToTab(tab.id, message, options);
        results.push(result);
      }
    }

    return results;
  }

  // ==================== Runtime messaging ====================

  /**
   * Sends a message to the runtime (background script)
   * @param message message
   * @param options send options
   * @returns send result
   */
  public async sendToRuntime(
    message: Message,
    options: MessageSendOptions = {},
  ): Promise<MessageSendResult> {
    try {
      const response = await browser.runtime.sendMessage(message);

      if (this.config.enableLogging) {
        console.log('[MessagingService] Sent to runtime:', message.type);
      }

      return { success: true, response };
    } catch (error) {
      const errorMessage = `Failed to send message to the runtime: ${error}`;
      console.error('[MessagingService]', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  // ==================== Higher-level messages ====================

  /**
   * Notifies that settings changed
   * @param settings new settings
   * @returns send results
   */
  public async notifySettingsChanged(
    settings: UserSettings,
  ): Promise<MessageSendResult[]> {
    const message: SettingsUpdateMessage = {
      type: MessageType.SETTINGS_UPDATED,
      settings,
    };

    this.addToHistory(message);

    if (this.config.enableBroadcast) {
      return await this.broadcastToTabs(message);
    } else {
      const tabs = await this.queryTabs({ active: true, currentWindow: true });
      if (tabs[0]?.id) {
        const result = await this.sendToTab(tabs[0].id, message);
        return [result];
      }
      return [{ success: false, error: 'No active tab found' }];
    }
  }

  /**
   * Sends a context menu action to the background script
   * @param action action type
   * @param url target URL
   * @param pattern URL pattern
   * @param patternType pattern type
   * @param description optional description
   * @returns send result
   */
  public async sendContextMenuAction(
    action: ContextMenuActionType,
    url: string,
    pattern: string,
    patternType: UrlPatternType,
    description?: string,
  ): Promise<MessageSendResult> {
    const contextMessage: ContextMenuMessage = {
      type: action,
      url,
      pattern,
      patternType,
      description,
    };

    const message: ContextMenuActionMessage = {
      type: MessageType.CONTEXT_MENU_ACTION,
      data: contextMessage,
    };

    return await this.sendToRuntime(message);
  }

  /**
   * Notifies that website management settings changed
   * @returns send results
   */
  public async notifyWebsiteManagementChanged(): Promise<MessageSendResult[]> {
    const message: WebsiteManagementUpdateMessage = {
      type: MessageType.WEBSITE_MANAGEMENT_UPDATED,
    };

    this.addToHistory(message);

    if (this.config.enableBroadcast) {
      return await this.broadcastToTabs(message);
    } else {
      const tabs = await this.queryTabs({ active: true, currentWindow: true });
      if (tabs[0]?.id) {
        const result = await this.sendToTab(tabs[0].id, message);
        return [result];
      }
      return [{ success: false, error: 'No active tab found' }];
    }
  }

  /**
   * Sends a notification message
   * @param title notification title
   * @param message notification body
   * @param level notification level
   * @returns send results
   */
  public async sendNotification(
    title: string,
    message: string,
    level: 'info' | 'warning' | 'error' | 'success' = 'info',
  ): Promise<MessageSendResult[]> {
    const notificationMessage: NotificationMessage = {
      type: MessageType.NOTIFICATION,
      title,
      message,
      level,
    };

    this.addToHistory(notificationMessage);
    return await this.broadcastToTabs(notificationMessage);
  }

  // ==================== Utilities ====================

  /**
   * Returns the message history
   * @param limit maximum number of entries
   * @returns message history
   */
  public getMessageHistory(limit?: number): Message[] {
    if (limit && limit > 0) {
      return this.messageHistory.slice(-limit);
    }
    return [...this.messageHistory];
  }

  /**
   * Clears the message history
   */
  public clearMessageHistory(): void {
    this.messageHistory = [];
  }

  /**
   * Service status
   */
  public getStatus() {
    return {
      config: this.config,
      listenerCount: Array.from(this.messageListeners.values()).reduce(
        (sum, listeners) => sum + listeners.length,
        0,
      ),
      historySize: this.messageHistory.length,
      isHealthy: true,
    };
  }
}

// ==================== Exports ====================

// Singleton instance
export const messagingService = MessagingService.getInstance();

// Default export
export default MessagingService;
