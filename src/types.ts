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
   * Callback to track download progress
   * @param received - Number of bytes received
   * @param total - Total number of bytes to be downloaded
   */
  progress?(received: number, total: number): void;
  
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
   * Indicates whether the app should restart after installing the update
   * Default: false
   */
  restartAfterInstall?: boolean;
  
  /**
   * Delay in milliseconds before restarting the app after installing the update
   * Default: 300ms
   */
  restartDelay?: number;
}

