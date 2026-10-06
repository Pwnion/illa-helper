/**
 * Update check service:
 * checks for new releases, shows notifications and manages the badge
 */

import { browser } from 'wxt/browser';
import { StorageService } from '@/src/modules/core/storage';

export interface UpdateInfo {
  hasUpdate: boolean;
  latestVersion: string;
  currentVersion: string;
  releaseNotes?: string;
  downloadUrl?: string;
  releaseDate?: string;
  downloadAssets?: DownloadAsset[];
}

export interface DownloadAsset {
  name: string;
  downloadUrl: string;
  size: number;
  browserType?: 'chrome' | 'firefox' | 'edge' | 'safari';
}

export interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
  published_at: string;
  prerelease: boolean;
  draft: boolean;
  assets: GitHubAsset[];
}

export interface GitHubAsset {
  name: string;
  browser_download_url: string;
  size: number;
  content_type: string;
}

export class UpdateCheckService {
  private static instance: UpdateCheckService;
  private readonly currentVersion: string;
  private readonly checkInterval: number = 24 * 60 * 60 * 1000; // check daily
  private readonly githubApiUrl =
    'https://api.github.com/repos/Pwnion/illa-helper/releases/latest';
  private storageService: StorageService;
  private intervalId?: number;

  private constructor() {
    this.currentVersion = browser.runtime.getManifest().version;
    this.storageService = StorageService.getInstance();
  }

  static getInstance(): UpdateCheckService {
    if (!UpdateCheckService.instance) {
      UpdateCheckService.instance = new UpdateCheckService();
    }
    return UpdateCheckService.instance;
  }

  /**
   * Initialises the update check service
   */
  async init(): Promise<void> {
    console.log('[UpdateCheckService] Initialising update checks');

    // Check once after startup
    setTimeout(() => {
      this.checkForUpdates();
    }, 10000); // delay so startup is not slowed down

    // Schedule periodic checks
    this.schedulePeriodicCheck();

    // Register notification listeners
    this.setupNotificationListeners();

    // Handle any pending update notification
    await this.checkPendingUpdate();
  }

  /**
   * Destroys the service
   */
  destroy(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  /**
   * Schedules periodic checks
   */
  private schedulePeriodicCheck(): void {
    this.intervalId = setInterval(() => {
      this.checkForUpdates();
    }, this.checkInterval) as any;
  }

  /**
   * Handles update messages
   */
  async handleMessage(
    message: any,
    sendResponse: (response: any) => void,
  ): Promise<boolean> {
    switch (message.type) {
      case 'CHECK_UPDATE':
        try {
          // A manual check forces a check and ignores dismissed versions
          const updateInfo = await this.checkForUpdates(true);
          sendResponse(updateInfo);
        } catch (error) {
          sendResponse({
            hasUpdate: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return true;

      case 'CLEAR_UPDATE_BADGE':
        try {
          await this.clearUpdateBadge();
          sendResponse({ success: true });
        } catch (error) {
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return true;

      case 'DISMISS_UPDATE':
        try {
          await this.dismissUpdate(message.version);
          sendResponse({ success: true });
        } catch (error) {
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return true;

      case 'GET_UPDATE_INFO':
        try {
          const updateInfo = await this.getStoredUpdateInfo();
          sendResponse(updateInfo);
        } catch (_) {
          sendResponse(null);
        }
        return true;

      default:
        return false;
    }
  }

  /**
   * Registers notification listeners
   */
  private setupNotificationListeners(): void {
    // Notification clicks
    browser.notifications?.onClicked?.addListener((notificationId) => {
      if (notificationId.startsWith('update-available')) {
        this.handleNotificationClick(notificationId);
      }
    });

    browser.notifications?.onButtonClicked?.addListener(
      (notificationId, buttonIndex) => {
        if (notificationId.startsWith('update-available')) {
          this.handleNotificationButtonClick(notificationId, buttonIndex);
        }
      },
    );
  }

  /**
   * Checks for updates
   * @param forceCheck whether to check even for dismissed versions
   */
  async checkForUpdates(forceCheck: boolean = false): Promise<UpdateInfo> {
    try {
      const response = await fetch(this.githubApiUrl, {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'illa-helper',
        },
        cache: 'no-cache',
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          '[UpdateCheckService] GitHub API error response:',
          errorText,
        );
        throw new Error(
          `GitHub API request failed: ${response.status} - ${errorText.slice(0, 100)}`,
        );
      }

      const releaseData: GitHubRelease = await response.json();

      // Skip pre-releases and drafts
      if (releaseData.prerelease || releaseData.draft) {
        console.log('[UpdateCheckService] Skipping pre-release or draft');
        return this.createUpdateInfo(false, this.currentVersion);
      }

      const latestVersion = releaseData.tag_name.replace(/^v/, '');
      const hasUpdate =
        this.compareVersions(latestVersion, this.currentVersion) > 0;

      // Parse download assets
      const downloadAssets = this.parseDownloadAssets(releaseData.assets || []);

      const updateInfo: UpdateInfo = {
        hasUpdate,
        latestVersion,
        currentVersion: this.currentVersion,
        releaseNotes: releaseData.body,
        downloadUrl: releaseData.html_url,
        releaseDate: releaseData.published_at,
        downloadAssets,
      };

      if (hasUpdate) {
        await this.handleUpdateAvailable(updateInfo, forceCheck);
      } else {
        await this.setBadge(false);
      }

      // Store the result
      await this.storeUpdateInfo(updateInfo);

      return updateInfo;
    } catch (error) {
      console.error('[UpdateCheckService] Update check failed:', error);
      return this.createUpdateInfo(false, this.currentVersion);
    }
  }

  /**
   * Handles a discovered update
   * @param updateInfo update information
   * @param forceCheck whether to ignore dismissed versions
   */
  private async handleUpdateAvailable(
    updateInfo: UpdateInfo,
    forceCheck: boolean = false,
  ): Promise<void> {
    // Check whether this version was already notified
    const lastNotifiedVersion = await this.getLastNotifiedVersion();
    const isDismissed = forceCheck
      ? false
      : await this.isUpdateDismissed(updateInfo.latestVersion);

    if (lastNotifiedVersion !== updateInfo.latestVersion && !isDismissed) {
      await this.showUpdateNotification(updateInfo);
      await this.setLastNotifiedVersion(updateInfo.latestVersion);
    }

    // Always show the badge unless the user cleared it (forced checks ignore dismissals)
    if (!isDismissed) {
      await this.setBadge(true);
    }
  }

  /**
   * Shows the update notification
   */
  private async showUpdateNotification(updateInfo: UpdateInfo): Promise<void> {
    try {
      const notificationId = `update-available-${updateInfo.latestVersion}`;

      await browser.notifications.create(notificationId, {
        type: 'basic',
        iconUrl: '/icon/128.png',
        title: 'A new version of ILLA Helper is available',
        message: `Version v${updateInfo.latestVersion} is available (current: v${updateInfo.currentVersion}). Click for details.`,
        buttons: [{ title: 'View update' }, { title: 'Remind me later' }],
      });

      console.log('[UpdateCheckService] Update notification shown');
    } catch (error) {
      console.error('[UpdateCheckService] Failed to show notification:', error);
    }
  }

  /**
   * Handles a notification click
   */
  private async handleNotificationClick(notificationId: string): Promise<void> {
    const updateInfo = await this.getStoredUpdateInfo();
    if (updateInfo?.downloadUrl) {
      browser.tabs.create({ url: updateInfo.downloadUrl });
    }
    browser.notifications.clear(notificationId);
  }

  /**
   * Handles a notification button click
   */
  private async handleNotificationButtonClick(
    notificationId: string,
    buttonIndex: number,
  ): Promise<void> {
    const updateInfo = await this.getStoredUpdateInfo();

    if (buttonIndex === 0 && updateInfo?.downloadUrl) {
      // View update
      browser.tabs.create({ url: updateInfo.downloadUrl });
    } else if (buttonIndex === 1) {
      // Remind me later: clear the notification but keep the badge
      console.log('[UpdateCheckService] User chose remind me later');
    }

    browser.notifications.clear(notificationId);
  }

  /**
   * Sets the extension badge
   */
  private async setBadge(hasUpdate: boolean): Promise<void> {
    try {
      if (hasUpdate) {
        await browser.action.setBadgeText({ text: 'NEW' });
        await browser.action.setBadgeBackgroundColor({ color: '#ff4444' });
        await browser.action.setTitle({
          title: 'ILLA Helper - a new version is available. Click for details',
        });
      } else {
        await browser.action.setBadgeText({ text: '' });
        await browser.action.setTitle({
          title: 'ILLA Helper',
        });
      }
    } catch (error) {
      console.error('[UpdateCheckService] Failed to set badge:', error);
    }
  }

  /**
   * Clears the update badge
   */
  async clearUpdateBadge(): Promise<void> {
    await this.setBadge(false);

    // Mark the current version as dismissed
    const updateInfo = await this.getStoredUpdateInfo();
    if (updateInfo?.latestVersion) {
      await this.dismissUpdate(updateInfo.latestVersion);
    }
  }

  /**
   * Dismisses an update
   */
  private async dismissUpdate(version: string): Promise<void> {
    const dismissedVersions = await this.getDismissedVersions();
    if (!dismissedVersions.includes(version)) {
      dismissedVersions.push(version);
      await browser.storage.local.set({
        dismissedUpdateVersions: dismissedVersions,
      });
    }
  }

  /**
   * Compares version numbers
   */
  private compareVersions(version1: string, version2: string): number {
    const v1Parts = version1.split('.').map(Number);
    const v2Parts = version2.split('.').map(Number);

    const maxLength = Math.max(v1Parts.length, v2Parts.length);

    for (let i = 0; i < maxLength; i++) {
      const v1 = v1Parts[i] || 0;
      const v2 = v2Parts[i] || 0;

      if (v1 > v2) return 1;
      if (v1 < v2) return -1;
    }

    return 0;
  }

  /**
   * Builds the update info object
   */
  private createUpdateInfo(hasUpdate: boolean, version: string): UpdateInfo {
    return {
      hasUpdate,
      latestVersion: version,
      currentVersion: this.currentVersion,
    };
  }

  /**
   * Stores update info
   */
  private async storeUpdateInfo(updateInfo: UpdateInfo): Promise<void> {
    await browser.storage.local.set({
      updateInfo,
      lastUpdateCheck: Date.now(),
    });
  }

  /**
   * Returns stored update info
   */
  async getStoredUpdateInfo(): Promise<UpdateInfo | null> {
    const result = await browser.storage.local.get('updateInfo');
    return result.updateInfo || null;
  }

  /**
   * Checks for a pending update
   */
  private async checkPendingUpdate(): Promise<void> {
    const updateInfo = await this.getStoredUpdateInfo();
    if (updateInfo?.hasUpdate) {
      const isDismissed = await this.isUpdateDismissed(
        updateInfo.latestVersion,
      );
      if (!isDismissed) {
        await this.setBadge(true);
      }
    }
  }

  /**
   * Last notified version
   */
  private async getLastNotifiedVersion(): Promise<string | null> {
    const result = await browser.storage.local.get('lastNotifiedVersion');
    return result.lastNotifiedVersion || null;
  }

  /**
   * Sets the last notified version
   */
  private async setLastNotifiedVersion(version: string): Promise<void> {
    await browser.storage.local.set({ lastNotifiedVersion: version });
  }

  /**
   * Dismissed versions
   */
  private async getDismissedVersions(): Promise<string[]> {
    const result = await browser.storage.local.get('dismissedUpdateVersions');
    return result.dismissedUpdateVersions || [];
  }

  /**
   * Whether a version was dismissed
   */
  private async isUpdateDismissed(version: string): Promise<boolean> {
    const dismissedVersions = await this.getDismissedVersions();
    return dismissedVersions.includes(version);
  }

  /**
   * Parses the GitHub release download assets
   */
  private parseDownloadAssets(assets: GitHubAsset[]): DownloadAsset[] {
    const downloadAssets: DownloadAsset[] = [];

    for (const asset of assets) {
      let browserType: 'chrome' | 'firefox' | 'edge' | 'safari' | undefined;

      // Infer the browser from the file name
      const fileName = asset.name.toLowerCase();
      if (fileName.includes('chrome') || fileName.includes('.crx')) {
        browserType = 'chrome';
      } else if (fileName.includes('firefox') || fileName.includes('.xpi')) {
        browserType = 'firefox';
      } else if (fileName.includes('edge')) {
        browserType = 'edge';
      } else if (fileName.includes('safari')) {
        browserType = 'safari';
      }

      downloadAssets.push({
        name: asset.name,
        downloadUrl: asset.browser_download_url,
        size: asset.size,
        browserType,
      });
    }

    return downloadAssets;
  }
}
