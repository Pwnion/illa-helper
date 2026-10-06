/**
 * 更新检查服务
 * 负责检查插件更新、显示通知和管理版本徽章
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
  private readonly checkInterval: number = 24 * 60 * 60 * 1000; // 24小时检查一次
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
   * 初始化更新检查服务
   */
  async init(): Promise<void> {
    console.log('[UpdateCheckService] 初始化更新检查服务');

    // 插件启动时检查更新
    setTimeout(() => {
      this.checkForUpdates();
    }, 10000); // 延迟5秒启动，避免影响插件初始化速度

    // 设置定期检查
    this.schedulePeriodicCheck();

    // 设置通知监听器
    this.setupNotificationListeners();

    // 检查是否有未处理的更新通知
    await this.checkPendingUpdate();
  }

  /**
   * 销毁服务
   */
  destroy(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  /**
   * 设置定期检查
   */
  private schedulePeriodicCheck(): void {
    this.intervalId = setInterval(() => {
      this.checkForUpdates();
    }, this.checkInterval) as any;
  }

  /**
   * 处理更新相关的消息
   */
  async handleMessage(
    message: any,
    sendResponse: (response: any) => void,
  ): Promise<boolean> {
    switch (message.type) {
      case 'CHECK_UPDATE':
        try {
          // 手动检查更新时，强制检查并忽略已忽略版本的设置
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
   * 设置通知监听器
   */
  private setupNotificationListeners(): void {
    // 监听通知点击
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
   * 检查更新
   * @param forceCheck 是否强制检查（忽略已忽略版本的设置）
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
        console.error('[UpdateCheckService] GitHub API 错误响应:', errorText);
        throw new Error(
          `GitHub API 请求失败: ${response.status} - ${errorText.slice(0, 100)}`,
        );
      }

      const releaseData: GitHubRelease = await response.json();

      // 跳过预发布版本和草稿
      if (releaseData.prerelease || releaseData.draft) {
        console.log('[UpdateCheckService] 跳过预发布版本或草稿');
        return this.createUpdateInfo(false, this.currentVersion);
      }

      const latestVersion = releaseData.tag_name.replace(/^v/, '');
      const hasUpdate =
        this.compareVersions(latestVersion, this.currentVersion) > 0;

      // 解析下载资源
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

      // 存储检查结果
      await this.storeUpdateInfo(updateInfo);

      return updateInfo;
    } catch (error) {
      console.error('[UpdateCheckService] 检查更新失败:', error);
      return this.createUpdateInfo(false, this.currentVersion);
    }
  }

  /**
   * 处理发现更新
   * @param updateInfo 更新信息
   * @param forceCheck 是否强制检查（忽略已忽略版本的设置）
   */
  private async handleUpdateAvailable(
    updateInfo: UpdateInfo,
    forceCheck: boolean = false,
  ): Promise<void> {
    // 检查是否已经通知过这个版本
    const lastNotifiedVersion = await this.getLastNotifiedVersion();
    const isDismissed = forceCheck
      ? false
      : await this.isUpdateDismissed(updateInfo.latestVersion);

    if (lastNotifiedVersion !== updateInfo.latestVersion && !isDismissed) {
      await this.showUpdateNotification(updateInfo);
      await this.setLastNotifiedVersion(updateInfo.latestVersion);
    }

    // 总是显示徽章，除非用户主动清除（强制检查时忽略忽略状态）
    if (!isDismissed) {
      await this.setBadge(true);
    }
  }

  /**
   * 显示更新通知
   */
  private async showUpdateNotification(updateInfo: UpdateInfo): Promise<void> {
    try {
      const notificationId = `update-available-${updateInfo.latestVersion}`;

      await browser.notifications.create(notificationId, {
        type: 'basic',
        iconUrl: '/icon/128.png',
        title: '🎉 illa-helper 有新版本了！',
        message: `发现新版本 v${updateInfo.latestVersion}，当前版本 v${updateInfo.currentVersion}。点击查看更新详情。`,
        buttons: [{ title: '查看更新' }, { title: '稍后提醒' }],
      });

      console.log('[UpdateCheckService] 已显示更新通知');
    } catch (error) {
      console.error('[UpdateCheckService] 显示通知失败:', error);
    }
  }

  /**
   * 处理通知点击
   */
  private async handleNotificationClick(notificationId: string): Promise<void> {
    const updateInfo = await this.getStoredUpdateInfo();
    if (updateInfo?.downloadUrl) {
      browser.tabs.create({ url: updateInfo.downloadUrl });
    }
    browser.notifications.clear(notificationId);
  }

  /**
   * 处理通知按钮点击
   */
  private async handleNotificationButtonClick(
    notificationId: string,
    buttonIndex: number,
  ): Promise<void> {
    const updateInfo = await this.getStoredUpdateInfo();

    if (buttonIndex === 0 && updateInfo?.downloadUrl) {
      // 查看更新
      browser.tabs.create({ url: updateInfo.downloadUrl });
    } else if (buttonIndex === 1) {
      // 稍后提醒 - 清除当前通知但保持徽章
      console.log('[UpdateCheckService] 用户选择稍后提醒');
    }

    browser.notifications.clear(notificationId);
  }

  /**
   * 设置插件徽章
   */
  private async setBadge(hasUpdate: boolean): Promise<void> {
    try {
      if (hasUpdate) {
        await browser.action.setBadgeText({ text: 'NEW' });
        await browser.action.setBadgeBackgroundColor({ color: '#ff4444' });
        await browser.action.setTitle({
          title: '浸入式学语言助手 - 有新版本可用！点击查看详情',
        });
      } else {
        await browser.action.setBadgeText({ text: '' });
        await browser.action.setTitle({
          title: '浸入式学语言助手',
        });
      }
    } catch (error) {
      console.error('[UpdateCheckService] 设置徽章失败:', error);
    }
  }

  /**
   * 清除更新徽章
   */
  async clearUpdateBadge(): Promise<void> {
    await this.setBadge(false);

    // 标记当前版本为已忽略
    const updateInfo = await this.getStoredUpdateInfo();
    if (updateInfo?.latestVersion) {
      await this.dismissUpdate(updateInfo.latestVersion);
    }
  }

  /**
   * 忽略更新
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
   * 比较版本号
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
   * 创建更新信息对象
   */
  private createUpdateInfo(hasUpdate: boolean, version: string): UpdateInfo {
    return {
      hasUpdate,
      latestVersion: version,
      currentVersion: this.currentVersion,
    };
  }

  /**
   * 存储更新信息
   */
  private async storeUpdateInfo(updateInfo: UpdateInfo): Promise<void> {
    await browser.storage.local.set({
      updateInfo,
      lastUpdateCheck: Date.now(),
    });
  }

  /**
   * 获取存储的更新信息
   */
  async getStoredUpdateInfo(): Promise<UpdateInfo | null> {
    const result = await browser.storage.local.get('updateInfo');
    return result.updateInfo || null;
  }

  /**
   * 检查待处理的更新
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
   * 获取最后通知的版本
   */
  private async getLastNotifiedVersion(): Promise<string | null> {
    const result = await browser.storage.local.get('lastNotifiedVersion');
    return result.lastNotifiedVersion || null;
  }

  /**
   * 设置最后通知的版本
   */
  private async setLastNotifiedVersion(version: string): Promise<void> {
    await browser.storage.local.set({ lastNotifiedVersion: version });
  }

  /**
   * 获取被忽略的版本列表
   */
  private async getDismissedVersions(): Promise<string[]> {
    const result = await browser.storage.local.get('dismissedUpdateVersions');
    return result.dismissedUpdateVersions || [];
  }

  /**
   * 检查版本是否被忽略
   */
  private async isUpdateDismissed(version: string): Promise<boolean> {
    const dismissedVersions = await this.getDismissedVersions();
    return dismissedVersions.includes(version);
  }

  /**
   * 解析GitHub Release的下载资源
   */
  private parseDownloadAssets(assets: GitHubAsset[]): DownloadAsset[] {
    const downloadAssets: DownloadAsset[] = [];

    for (const asset of assets) {
      let browserType: 'chrome' | 'firefox' | 'edge' | 'safari' | undefined;

      // 根据文件名判断浏览器类型
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
