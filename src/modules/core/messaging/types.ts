/**
 * Messaging types:
 * message passing, notifications and the communication protocol
 */

import { UserSettings, ContextMenuMessage } from '../../shared/types/storage';
import { ContextMenuActionType, UrlPatternType } from '../../shared/types/core';

// Re-export imported types
export type {
  UserSettings,
  ContextMenuMessage,
  ContextMenuActionType,
  UrlPatternType,
};

// ==================== Message types ====================

/**
 * Message type enum
 */
export enum MessageType {
  SETTINGS_UPDATED = 'settings_updated',
  WEBSITE_MANAGEMENT_UPDATED = 'website_management_updated',
  CONTEXT_MENU_ACTION = 'context-menu-action',
  NOTIFICATION = 'notification',
  ERROR = 'error',
}

/**
 * Base message
 */
export interface BaseMessage {
  type: MessageType | string;
  timestamp?: number;
  id?: string;
}

/**
 * Settings updated
 */
export interface SettingsUpdateMessage extends BaseMessage {
  type: MessageType.SETTINGS_UPDATED;
  settings: UserSettings;
}

/**
 * Website management updated
 */
export interface WebsiteManagementUpdateMessage extends BaseMessage {
  type: MessageType.WEBSITE_MANAGEMENT_UPDATED;
}

/**
 * Context menu action
 */
export interface ContextMenuActionMessage extends BaseMessage {
  type: MessageType.CONTEXT_MENU_ACTION;
  data: ContextMenuMessage;
}

/**
 * Notification
 */
export interface NotificationMessage extends BaseMessage {
  type: MessageType.NOTIFICATION;
  title: string;
  message: string;
  level: 'info' | 'warning' | 'error' | 'success';
}

/**
 * Error
 */
export interface ErrorMessage extends BaseMessage {
  type: MessageType.ERROR;
  error: string;
  details?: any;
}

/**
 * Union of all messages
 */
export type Message =
  | SettingsUpdateMessage
  | WebsiteManagementUpdateMessage
  | ContextMenuActionMessage
  | NotificationMessage
  | ErrorMessage;

// ==================== Communication ====================

/**
 * Result of sending a message
 */
export interface MessageSendResult {
  success: boolean;
  error?: string;
  response?: any;
}

/**
 * Tab query options
 */
export interface TabQueryOptions {
  active?: boolean;
  currentWindow?: boolean;
  url?: string[];
  index?: number;
}

/**
 * Message send options
 */
export interface MessageSendOptions {
  targetTab?: number;
  targetRuntime?: string;
  timeout?: number;
  retries?: number;
}

/**
 * Message listener
 */
export type MessageListener<T = any> = (
  message: T,
  sender?: any,
) => Promise<any> | any;

/**
 * Messaging service configuration
 */
export interface MessagingServiceConfig {
  enableLogging?: boolean;
  defaultTimeout?: number;
  maxRetries?: number;
  enableBroadcast?: boolean;
}
