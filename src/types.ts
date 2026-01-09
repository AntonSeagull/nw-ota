export interface UpdateEntry {
  version: number;
  enable: boolean;
  download: string;
}

export interface S3Config {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucket: string;
  endpoint?: string; // Optional custom endpoint (for S3-compatible services)
}

export interface ProjectConfig {
  buildPath?: string;
  projectKey?: string;
  platforms?: {
    [platform: string]: {
      nativeVersion?: string;
    };
  };
  s3?: S3Config;
}

export type Platform = 'win' | 'mac' | 'linux32' | 'linux64';

/**
 * Status of the update process
 */
export type UpdateStatus =
  | 'checking' // Checking for available updates
  | 'update-found' // Update has been found and will be installed
  | 'downloading' // Downloading the update package
  | 'downloaded' // Download completed successfully
  | 'unpacking' // Unpacking the downloaded archive
  | 'unpacked' // Unpacking completed successfully
  | 'replacing' // Replacing the current bundle with the new one
  | 'replaced' // Bundle replacement completed successfully
  | 'saving' // Saving the new version information
  | 'cleaning' // Cleaning up temporary files
  | 'success' // Update installation completed successfully
  | 'error' // An error occurred during the update process
  | 'no-update' // No updates available
  | 'restart-needed'; // Update installed, application restart is required

export interface CheckUpdateOptions {
  /**
   * S3 endpoint/base URL where updates are stored
   * Example: "https://bucket.s3.region.amazonaws.com" or "https://s3.example.com"
   */
  endpoint: string;

  /**
   * Unique project key/name
   */
  projectKey: string;

  /**
   * Current bundle version (will be compared with update versions)
   */
  currentVersion?: number;

  /**
   * Enable detailed console logging for debugging
   * Default: false
   */
  dev?: boolean;

  /**
   * Optional headers to include with the update request
   */
  headers?: Record<string, string>;



  /**
   * Callback triggered when update check completes and update is found
   * @param update - The update entry that will be installed
   */
  updateFound?(update: UpdateEntry): void;

  /**
   * Callback triggered when the update succeeds
   */
  updateSuccess?(): void;

  /**
   * Callback triggered when the update fails
   * @param message - Error message describing the failure
   */
  updateFail?(message?: string | Error): void;

  /**
   * Callback triggered when no update is available
   */
  noUpdate?(): void;

  /**
   * Callback triggered after update is successfully installed
   * This allows the user to handle restart manually (e.g., show a message to the user)
   * The app will not restart automatically - user must restart manually to apply the update
   */
  onNeedRestart?(): void;

  /**
   * Callback triggered on every status change during the update process
   * This provides status information about what's happening at each stage
   * Duplicates information from other callbacks but provides a unified status tracking
   * @param status - Current status of the update process
   */
  onStatus?(status: UpdateStatus): void;
}

