/**
 * Messaging service entry point.
 * Exports everything related to message passing.
 */

// Services
export {
  default as MessagingService,
  messagingService,
} from './MessagingService';

// Types
export type {
  MessagingServiceConfig,
  MessageSendResult,
  TabQueryOptions,
  MessageSendOptions,
  MessageListener,
  Message,
  BaseMessage,
  SettingsUpdateMessage,
  WebsiteManagementUpdateMessage,
  ContextMenuActionMessage,
  NotificationMessage,
  ErrorMessage,
  UserSettings,
  ContextMenuMessage,
  ContextMenuActionType,
  UrlPatternType,
} from './types';

export { MessageType } from './types';

// Default export
export { messagingService as default } from './MessagingService';
