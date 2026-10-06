/**
 * Background script
 */

import { browser } from 'wxt/browser';
import { StorageService } from '@/src/modules/core/storage';
import { NotificationService } from '@/src/modules/background/services/NotificationService';
import { ApiProxyService } from '@/src/modules/background/services/ApiProxyService';
import { CommandService } from '@/src/modules/background/services/CommandService';
import { InitializationService } from '@/src/modules/background/services/InitializationService';
import { UpdateCheckService } from '@/src/modules/background/services/UpdateCheckService';
import {
  MESSAGE_TYPES,
  BACKGROUND_CONSTANTS,
} from '@/src/modules/background/types';
import { MessageType } from '@/src/modules/core/messaging/types';

export default defineBackground(() => {
  // Service instances
  const storageService = StorageService.getInstance();
  const notificationService = NotificationService.getInstance();
  const apiProxyService = ApiProxyService.getInstance();
  const commandService = CommandService.getInstance();
  const initializationService = InitializationService.getInstance();
  const updateCheckService = UpdateCheckService.getInstance();

  /**
   * Initialises every service
   */
  async function initializeServices(): Promise<void> {
    try {
      // Command service
      commandService.initialize();

      // Update check service
      await updateCheckService.init();

      console.log('[Background] All services initialised');
    } catch (error) {
      console.error('[Background] Service initialisation failed:', error);
    }
  }

  /**
   * Handles the extension install event
   */
  browser.runtime.onInstalled.addListener(async (details) => {
    try {
      const result = await initializationService.handleInstallation(details);

      if (result.success) {
        console.log('[Background] Install handled');
        if (result.warnings.length > 0) {
          console.warn('[Background] Install warnings:', result.warnings);
        }
      } else {
        console.error('[Background] Install failed:', result.errors);
      }
    } catch (error) {
      console.error('[Background] Install threw:', error);
    }
  });

  /**
   * Handles runtime messages
   */
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log(`[Background] Received message: ${message.type}`);

    switch (message.type) {
      case MESSAGE_TYPES.SHOW_NOTIFICATION:
        handleShowNotification(message);
        return false;

      case MESSAGE_TYPES.OPEN_POPUP:
        handleOpenPopup();
        return false;

      case MESSAGE_TYPES.OPEN_OPTIONS:
        handleOpenOptions();
        return false;

      case MESSAGE_TYPES.VALIDATE_CONFIG:
        handleValidateConfiguration(message, sendResponse);
        return true; // keep the message channel open

      case MESSAGE_TYPES.API_REQUEST:
        handleApiRequest(message, sendResponse);
        return true; // keep the message channel open

      case MessageType.CONTEXT_MENU_ACTION:
        handleContextMenuAction(message, sendResponse);
        return true; // keep the message channel open

      // Update check messages
      case 'CHECK_UPDATE':
      case 'CLEAR_UPDATE_BADGE':
      case 'DISMISS_UPDATE':
      case 'GET_UPDATE_INFO':
        handleUpdateMessage(message, sendResponse);
        return true; // keep the message channel open

      default:
        console.warn(`[Background] Unknown message type: ${message.type}`);
        return false;
    }
  });

  /**
   * Handles the show-notification message
   */
  async function handleShowNotification(message: any): Promise<void> {
    try {
      await notificationService.showNotification({
        type: 'basic',
        title: message.options.title || 'Notification',
        message: message.options.message || '',
        iconUrl: message.options.iconUrl,
      });
    } catch (error) {
      console.error('[Background] Failed to show notification:', error);
    }
  }

  /**
   * Handles the open-popup message
   */
  async function handleOpenPopup(): Promise<void> {
    try {
      browser.action.openPopup();
    } catch (error) {
      console.error('[Background] Could not open the popup:', error);
      // Fall back to the options page
      const optionsUrl = browser.runtime.getURL(
        BACKGROUND_CONSTANTS.OPTIONS_PATH,
      );
      browser.tabs.create({ url: optionsUrl });
    }
  }

  /**
   * Handles the open-options message
   */
  async function handleOpenOptions(): Promise<void> {
    const optionsUrl = browser.runtime.getURL(
      BACKGROUND_CONSTANTS.OPTIONS_PATH,
    );
    browser.tabs.create({ url: optionsUrl });
  }

  /**
   * Handles the validate-configuration message
   */
  function handleValidateConfiguration(
    message: any,
    sendResponse: (response: boolean) => void,
  ): void {
    (async () => {
      try {
        const settings = await storageService.getUserSettings();

        // Check the active configuration
        const activeConfig = settings.apiConfigs?.find(
          (config) => config.id === settings.activeApiConfigId,
        );
        const isConfigValid = !!activeConfig?.config?.apiKey;

        if (isConfigValid) {
          sendResponse(true);
          return;
        }

        // Notify when the configuration is invalid
        await notificationService.showApiConfigError(message.source);
        sendResponse(false);
      } catch (error) {
        console.error('[Background] Configuration validation failed:', error);
        sendResponse(false);
      }
    })();
  }

  /**
   * Handles API request messages
   */
  function handleApiRequest(
    message: any,
    sendResponse: (response: any) => void,
  ): void {
    (async () => {
      try {
        const response = await apiProxyService.handleApiRequest(message);
        sendResponse(response);
      } catch (error) {
        console.error('[Background] API request handling failed:', error);
        sendResponse({
          success: false,
          error: {
            message: error instanceof Error ? error.message : 'Unknown error',
          },
        });
      }
    })();
  }

  /**
   * Handles context menu action messages
   */
  function handleContextMenuAction(
    message: any,
    sendResponse: (response: any) => void,
  ): void {
    (async () => {
      try {
        console.log('[Background] Handling context menu action:', message.data);

        // The actual handling lives in ContextMenuManager (owned by InitializationService),
        // so this just acknowledges the message
        sendResponse({
          success: true,
          message: 'Context menu action handled',
        });
      } catch (error) {
        console.error('[Background] Context menu action failed:', error);
        sendResponse({
          success: false,
          error: {
            message: error instanceof Error ? error.message : 'Unknown error',
          },
        });
      }
    })();
  }

  /**
   * Handles update check messages
   */
  function handleUpdateMessage(
    message: any,
    sendResponse: (response: any) => void,
  ): void {
    (async () => {
      try {
        const handled = await updateCheckService.handleMessage(
          message,
          sendResponse,
        );
        if (!handled) {
          sendResponse({
            success: false,
            error: { message: 'Unknown update message type' },
          });
        }
      } catch (error) {
        console.error('[Background] Update message handling failed:', error);
        sendResponse({
          success: false,
          error: {
            message: error instanceof Error ? error.message : 'Unknown error',
          },
        });
      }
    })();
  }

  // Initialise services
  initializeServices();
});
