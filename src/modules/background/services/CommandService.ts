/**
 * Command service: handles extension keyboard commands
 */

import { browser } from 'wxt/browser';
import { StorageService } from '../../core/storage';
import {
  ExtensionCommand,
  CommandHandlerResult,
  CommandServiceConfig,
  ConfigValidationResult,
  EXTENSION_COMMANDS,
} from '../types';

export class CommandService {
  private static instance: CommandService | null = null;
  private config: CommandServiceConfig;
  private storageService: StorageService;

  private constructor() {
    this.config = {
      enabledCommands: ['translate-page'],
      requiresValidation: true,
    };
    this.storageService = StorageService.getInstance();
  }

  /**
   * Returns the singleton instance
   */
  public static getInstance(): CommandService {
    if (!CommandService.instance) {
      CommandService.instance = new CommandService();
    }
    return CommandService.instance;
  }

  /**
   * Registers the command listener
   */
  public initialize(): void {
    browser.commands.onCommand.addListener(this.handleCommand.bind(this));
    console.log('[CommandService] Command listener registered');
  }

  /**
   * Handles an extension command
   */
  private async handleCommand(command: string): Promise<void> {
    console.log(`[CommandService] Received command: ${command}`);

    if (!this.isCommandEnabled(command as ExtensionCommand)) {
      console.warn(`[CommandService] Command not enabled: ${command}`);
      return;
    }

    try {
      const result = await this.executeCommand(command as ExtensionCommand);
      if (!result.success && result.error) {
        console.error(`[CommandService] Command failed: ${result.error}`);
      }
    } catch (error) {
      console.error(`[CommandService] Command threw:`, error);
    }
  }

  /**
   * Executes a command
   */
  private async executeCommand(
    command: ExtensionCommand,
  ): Promise<CommandHandlerResult> {
    switch (command) {
      case EXTENSION_COMMANDS.TRANSLATE_PAGE:
        return this.handleTranslatePageCommand();
      default:
        return {
          success: false,
          error: `Unknown command: ${command}`,
        };
    }
  }

  /**
   * Handles the translate-page command
   */
  private async handleTranslatePageCommand(): Promise<CommandHandlerResult> {
    try {
      // Validate the API configuration
      if (this.config.requiresValidation) {
        const validation = await this.validateApiConfiguration();
        if (!validation.isValid) {
          return {
            success: false,
            error: 'Invalid API configuration',
          };
        }
      }

      // Find the active tab
      const tabs = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (!tabs[0]?.id) {
        return {
          success: false,
          error: 'Could not find the current tab',
        };
      }

      // Send the translate command to the content script
      await browser.tabs.sendMessage(tabs[0].id, {
        type: 'translate-page-command',
      });
      return {
        success: true,
      };
    } catch (error) {
      console.error('[CommandService] Translate-page command failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Validates the API configuration
   */
  private async validateApiConfiguration(): Promise<ConfigValidationResult> {
    try {
      const settings = await this.storageService.getUserSettings();

      // Check the active configuration
      const activeConfig = settings.apiConfigs?.find(
        (config) => config.id === settings.activeApiConfigId,
      );

      const isValid = !!activeConfig?.config?.apiKey;

      if (!isValid) {
        return {
          isValid: false,
          errors: ['API key not set'],
        };
      }

      return {
        isValid: true,
        activeConfig: {
          id: activeConfig.id,
          protocolFamily: activeConfig.protocolFamily,
          hasApiKey: !!activeConfig.config.apiKey,
        },
        errors: [],
      };
    } catch (error) {
      console.error('[CommandService] Configuration validation failed:', error);
      return {
        isValid: false,
        errors: ['An error occurred while validating the configuration'],
      };
    }
  }

  /**
   * Whether a command is enabled
   */
  private isCommandEnabled(command: ExtensionCommand): boolean {
    return this.config.enabledCommands.includes(command);
  }

  /**
   * Enables a command
   */
  public enableCommand(command: ExtensionCommand): void {
    if (!this.config.enabledCommands.includes(command)) {
      this.config.enabledCommands.push(command);
      console.log(`[CommandService] Command enabled: ${command}`);
    }
  }

  /**
   * Disables a command
   */
  public disableCommand(command: ExtensionCommand): void {
    const index = this.config.enabledCommands.indexOf(command);
    if (index > -1) {
      this.config.enabledCommands.splice(index, 1);
      console.log(`[CommandService] Command disabled: ${command}`);
    }
  }

  /**
   * Enabled commands
   */
  public getEnabledCommands(): ExtensionCommand[] {
    return [...this.config.enabledCommands];
  }

  /**
   * Sets whether validation is required
   */
  public setRequiresValidation(requiresValidation: boolean): void {
    this.config.requiresValidation = requiresValidation;
    console.log(
      `[CommandService] Validation requirement set to: ${requiresValidation}`,
    );
  }

  /**
   * Executes a command manually (for other services)
   */
  public async executeManualCommand(
    command: ExtensionCommand,
  ): Promise<CommandHandlerResult> {
    console.log(`[CommandService] Executing command manually: ${command}`);

    if (!this.isCommandEnabled(command)) {
      return {
        success: false,
        error: `Command not enabled: ${command}`,
      };
    }

    return this.executeCommand(command);
  }

  /**
   * Available commands
   */
  public getAvailableCommands(): ExtensionCommand[] {
    return Object.values(EXTENSION_COMMANDS) as ExtensionCommand[];
  }

  /**
   * Updates the configuration
   */
  public updateConfig(newConfig: Partial<CommandServiceConfig>): void {
    this.config = {
      ...this.config,
      ...newConfig,
    };
    console.log('[CommandService] Configuration updated:', this.config);
  }

  /**
   * Current configuration
   */
  public getConfig(): CommandServiceConfig {
    return { ...this.config };
  }

  /**
   * Command statistics
   */
  public getCommandStats(): {
    enabledCommands: number;
    totalCommands: number;
    requiresValidation: boolean;
  } {
    return {
      enabledCommands: this.config.enabledCommands.length,
      totalCommands: this.getAvailableCommands().length,
      requiresValidation: this.config.requiresValidation,
    };
  }

  /**
   * Destroys the service
   */
  public destroy(): void {
    // The extensions API has no way to remove the listener,
    // so this only clears the instance
    console.log('[CommandService] Service destroyed');
    CommandService.instance = null;
  }
}
