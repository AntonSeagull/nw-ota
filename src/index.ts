/// <reference types="nw.js" />

import axios from 'axios';

import {
  CheckUpdateOptions,
  Platform,
  UpdateEntry,
} from './types.js';

// Check if we're in Node.js/NW.js environment
if (typeof require === 'undefined') {
    throw new Error('require недоступен. Код должен выполняться в Node.js или NW.js окружении');
}

// Load Node.js modules using require
const child_process = require('child_process');
const fs = require('fs');
const os = require('os');






/**
 * Promisify replacement (util.promisify not available in Vite)
 * Converts a callback-based function to a promise-based one
 */
function promisify(fn: any): any {
    return function (...args: any[]): Promise<any> {
        return new Promise((resolve, reject) => {
            // Remove the last argument if it's already a callback
            const callback = (err: any, ...results: any[]) => {
                if (err) {
                    reject(err);
                } else {
                    // If multiple results, return array, otherwise return single value
                    resolve(results.length > 1 ? results : results[0]);
                }
            };
            fn(...args, callback);
        });
    };
}

/**
 * Pipeline function replacement for stream/promises (not available in Vite)
 * Pipes a readable stream to a writable stream and returns a promise
 */
function pipelinePromise(readable: any, writable: any): Promise<void> {
    return new Promise((resolve, reject) => {
        readable.pipe(writable);
        writable.on('finish', resolve);
        writable.on('error', reject);
        readable.on('error', reject);
    });
}


const execAsync = promisify(child_process.exec);

/**
 * Removes a file or directory recursively with retry mechanism
 * Replacement for del library to avoid issues with fast-glob in NW.js
 * Handles file locking issues on Windows/Mac/Linux
 */
async function removePath(targetPath: string, retries: number = 3, delay: number = 100): Promise<void> {
    for (let i = 0; i < retries; i++) {
        try {
            const stat = await fs.promises.stat(targetPath);
            if (stat.isDirectory()) {
                await fs.promises.rm(targetPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
            } else {
                await fs.promises.unlink(targetPath);
            }
            return; // Success
        } catch (error: any) {
            // Ignore if file/directory doesn't exist
            if (error.code === 'ENOENT') {
                return;
            }

            // On Windows, files might be locked (EBUSY, EPERM, EACCES)
            // On Mac/Linux, similar issues can occur
            const isLocked = error.code === 'EBUSY' ||
                error.code === 'EPERM' ||
                error.code === 'EACCES' ||
                error.code === 'ENOTEMPTY' ||
                error.message?.includes('locked') ||
                error.message?.includes('in use');

            if (isLocked && i < retries - 1) {
                // Wait and retry
                await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
                continue;
            }

            // If it's the last retry or not a locking issue, throw
            throw error;
        }
    }
}

/**
 * Recursively copies a directory from source to destination
 * Replacement for ncp library to avoid external dependencies
 */
async function copyDirectory(source: string, destination: string): Promise<void> {
    const path = require('path');

    // Create destination directory if it doesn't exist
    if (!fs.existsSync(destination)) {
        fs.mkdirSync(destination, { recursive: true });
    }

    const entries = fs.readdirSync(source, { withFileTypes: true });

    for (const entry of entries) {
        const sourcePath = path.join(source, entry.name);
        const destPath = path.join(destination, entry.name);

        if (entry.isDirectory()) {
            // Recursively copy subdirectories
            await copyDirectory(sourcePath, destPath);
        } else {
            // Copy file
            fs.copyFileSync(sourcePath, destPath);
        }
    }
}

export interface BundleUpdaterOptions {
    /**
     * Path to the bundle directory to replace.
     * 
     * For NW.js apps, bundle location is platform-specific:
     * - Windows/Linux: same folder as nw.exe, or package.nw folder
     * - Mac: nwjs.app/Contents/Resources/app.nw
     * 
     * Use BundleUpdater.getDefaultBundlePath() to automatically detect the correct path.
     * 
     * Examples:
     * - "./app" - relative path
     * - "./package.nw" - package.nw folder
     * - "/path/to/app" - absolute path
     */
    bundlePath: string;
    temporaryDirectory?: string;
    backup?: boolean;
    /**
     * Enable detailed console logging for debugging
     * Default: false
     */
    dev?: boolean;
}

export default class BundleUpdater {
    private bundlePath: string;
    private temporaryDirectory: string;
    private backup: boolean;
    private versionFilePath: string;
    private dev: boolean;

    constructor(options: BundleUpdaterOptions) {
        if (!options.bundlePath) {
            throw new Error('bundlePath is required');
        }

        const path = require("path");

        this.bundlePath = path.resolve(options.bundlePath);
        this.temporaryDirectory = options.temporaryDirectory || os.tmpdir();
        this.backup = options.backup !== false;
        this.dev = options.dev === true;

        // Version file stored next to bundle path
        const bundleDir = path.dirname(this.bundlePath);
        this.versionFilePath = path.join(bundleDir, '.nw-bundle-version.json');

        if (this.dev) {
            console.log('[nw-ota] BundleUpdater initialized:');
            console.log('  bundlePath:', this.bundlePath);
            console.log('  temporaryDirectory:', this.temporaryDirectory);
            console.log('  backup:', this.backup);
            console.log('  versionFilePath:', this.versionFilePath);
        }
    }

    /**
     * Downloads a zip file from URL
     */
    async download(url: string): Promise<string> {
        if (this.dev) {
            console.log('[nw-ota] download() called');
            console.log('  URL:', url);
        }
        const path = require("path");

        const filename = decodeURIComponent(path.basename(url)) || 'bundle.zip';
        const destinationPath = path.resolve(this.temporaryDirectory, filename);

        if (this.dev) {
            console.log('  Destination:', destinationPath);
            console.log('  Starting download...');
        }

        const response = await axios({
            method: 'get',
            url: url,
            responseType: 'stream',
            timeout: 300000 // 5 minutes timeout
        });

        // Check if response.data is a stream
        if (!response.data || typeof response.data.on !== 'function') {
            if (this.dev) {
                console.log('  Stream not available, using arraybuffer fallback');
            }
            // Fallback: download as arraybuffer
            const arrayBufferResponse = await axios({
                method: 'get',
                url: url,
                responseType: 'arraybuffer',
                timeout: 300000,
            });
            const buffer = Buffer.from(arrayBufferResponse.data);
            fs.writeFileSync(destinationPath, buffer);

            if (this.dev) {
                console.log('  Download completed (arraybuffer):', buffer.length, 'bytes');
            }
            return destinationPath;
        }

        const writeStream = fs.createWriteStream(destinationPath);
        await pipelinePromise(response.data, writeStream);

        if (this.dev) {
            const stats = fs.statSync(destinationPath);
            console.log('  Download completed (stream):', stats.size, 'bytes');
        }

        return destinationPath;
    }

    /**
     * Unpacks a zip file to a temporary directory
     */
    async unpack(zipPath: string): Promise<string> {
        if (this.dev) {
            console.log('[nw-ota] unpack() called');
            console.log('  Zip path:', zipPath);
        }

        const path = require("path");
        const yauzl = require('yauzl');
        const destinationDirectory = path.join(
            this.temporaryDirectory,
            path.basename(zipPath, path.extname(zipPath))
        );

        if (this.dev) {
            console.log('  Destination directory:', destinationDirectory);
        }

        // Remove destination if it exists
        if (fs.existsSync(destinationDirectory)) {
            if (this.dev) {
                console.log('  Removing existing destination directory...');
            }
            await removePath(destinationDirectory);
        }
        fs.mkdirSync(destinationDirectory, { recursive: true });

        if (this.dev) {
            console.log('  Starting unpack with yauzl...');
        }

        // Use yauzl for cross-platform zip extraction
        return new Promise((resolve, reject) => {
            yauzl.open(zipPath, { lazyEntries: true }, (err: any, zipfile: any) => {
                if (err) {
                    reject(new Error(`Failed to open zip file: ${err.message}`));
                    return;
                }

                let entryCount = 0;
                let extractedCount = 0;

                zipfile.readEntry();

                zipfile.on('entry', (entry: any) => {
                    entryCount++;

                    if (/\/$/.test(entry.fileName)) {
                        // Directory entry
                        const dirPath = path.join(destinationDirectory, entry.fileName);
                        if (!fs.existsSync(dirPath)) {
                            fs.mkdirSync(dirPath, { recursive: true });
                        }
                        zipfile.readEntry();
                    } else {
                        // File entry
                        zipfile.openReadStream(entry, (err: any, readStream: any) => {
                            if (err) {
                                reject(new Error(`Failed to read entry ${entry.fileName}: ${err.message}`));
                                return;
                            }

                            const filePath = path.join(destinationDirectory, entry.fileName);
                            const dirPath = path.dirname(filePath);

                            // Ensure directory exists
                            if (!fs.existsSync(dirPath)) {
                                fs.mkdirSync(dirPath, { recursive: true });
                            }

                            const writeStream = fs.createWriteStream(filePath);

                            readStream.pipe(writeStream);

                            writeStream.on('close', () => {
                                extractedCount++;
                                if (this.dev && extractedCount % 100 === 0) {
                                    console.log(`  Extracted ${extractedCount} files...`);
                                }
                                zipfile.readEntry();
                            });

                            writeStream.on('error', (err: any) => {
                                reject(new Error(`Failed to write file ${filePath}: ${err.message}`));
                            });
                        });
                    }
                });

                zipfile.on('end', () => {
                    if (this.dev) {
                        console.log(`  Unpack completed: ${extractedCount} files extracted`);
                    }
                    resolve(destinationDirectory);
                });

                zipfile.on('error', (err: any) => {
                    reject(new Error(`Zip file error: ${err.message}`));
                });
            });
        });
    }

    /**
     * Creates a backup of the current bundle
     */
    async createBackup(): Promise<string | null> {
        if (!fs.existsSync(this.bundlePath)) {
            if (this.dev) {
                console.log('[nw-ota] createBackup() - bundle path does not exist, skipping');
            }
            return null;
        }

        const backupPath = `${this.bundlePath}.backup.${Date.now()}`;

        if (this.dev) {
            console.log('[nw-ota] createBackup() called');
            console.log('  Bundle path:', this.bundlePath);
            console.log('  Backup path:', backupPath);
            console.log('  Creating backup...');
        }

        await copyDirectory(this.bundlePath, backupPath);

        if (this.dev) {
            console.log('  Backup created successfully');
        }

        return backupPath;
    }

    /**
     * Replaces the current bundle with the new one
     */
    async replace(newBundlePath: string): Promise<void> {
        if (this.dev) {
            console.log('[nw-ota] replace() called');
            console.log('  New bundle path:', newBundlePath);
            console.log('  Current bundle path:', this.bundlePath);
        }

        // Create backup if enabled
        let backupPath: string | null = null;
        if (this.backup && fs.existsSync(this.bundlePath)) {
            backupPath = await this.createBackup();
        }
        const path = require("path");
        try {
            // Remove old bundle
            if (fs.existsSync(this.bundlePath)) {
                if (this.dev) {
                    console.log('  Removing old bundle...');
                }
                await removePath(this.bundlePath);
            }

            // Ensure parent directory exists
            const parentDir = path.dirname(this.bundlePath);
            if (!fs.existsSync(parentDir)) {
                if (this.dev) {
                    console.log('  Creating parent directory:', parentDir);
                }
                fs.mkdirSync(parentDir, { recursive: true });
            }

            // Copy new bundle
            if (this.dev) {
                console.log('  Copying new bundle...');
            }
            await copyDirectory(newBundlePath, this.bundlePath);

            if (this.dev) {
                console.log('  Bundle replaced successfully');
            }
        } catch (error: any) {
            // Restore from backup if replacement failed
            if (backupPath && fs.existsSync(backupPath)) {
                if (fs.existsSync(this.bundlePath)) {
                    await removePath(this.bundlePath);
                }

                await copyDirectory(backupPath, this.bundlePath);
                throw new Error(
                    `Failed to replace bundle. Backup restored. Original error: ${error.message}`
                );
            }
            throw error;
        }
    }

    /**
     * Downloads, unpacks and replaces the bundle in one call
     */
    async update(url: string): Promise<void> {
        if (this.dev) {
            console.log('[nw-ota] update() called');
            console.log('  URL:', url);
        }

        let zipPath: string | null = null;
        let unpackedPath: string | null = null;

        try {
            // Download
            zipPath = await this.download(url);

            // Unpack
            unpackedPath = await this.unpack(zipPath);

            // Find the actual bundle directory inside unpacked folder
            const bundleSource = this._findBundleSource(unpackedPath);

            if (this.dev) {
                console.log('  Bundle source found:', bundleSource);
            }

            // Replace
            await this.replace(bundleSource);

            if (this.dev) {
                console.log('  Update completed successfully');
            }

            // Cleanup
            if (zipPath && fs.existsSync(zipPath)) {
                await removePath(zipPath);
            }
            if (unpackedPath && fs.existsSync(unpackedPath)) {
                await removePath(unpackedPath);
            }
        } catch (error) {
            // Cleanup on error
            if (zipPath && fs.existsSync(zipPath)) {
                await removePath(zipPath).catch(() => { });
            }
            if (unpackedPath && fs.existsSync(unpackedPath)) {
                await removePath(unpackedPath).catch(() => { });
            }
            throw error;
        }
    }

    /**
     * Finds the bundle source directory in unpacked folder
     */
    private _findBundleSource(unpackedPath: string): string {
        const entries = fs.readdirSync(unpackedPath);

        // If there's only one entry and it's a directory, use that
        if (entries.length === 1) {
            const path = require("path");
            const singleEntry = path.join(unpackedPath, entries[0]);
            const stat = fs.statSync(singleEntry);
            if (stat.isDirectory()) {
                return singleEntry;
            }
        }

        // Otherwise, use the unpacked directory itself
        return unpackedPath;
    }

    /**
     * Gets the current platform
     */
    private _getPlatform(): Platform {
        const platform = process.platform;
        if (/^win/.test(platform)) return 'win';
        if (/^darwin/.test(platform)) return 'mac';
        if (/^linux/.test(platform)) {
            return process.arch === 'ia32' ? 'linux32' : 'linux64';
        }
        return 'win'; // fallback
    }

    /**
     * Gets the platform from NW.js context
     */
    private _getNWJSPlatform(): Platform {
        if (typeof nw !== 'undefined' && nw.App) {
            // NW.js is available
            const platform = process.platform;
            if (/^win/.test(platform)) return 'win';
            if (/^darwin/.test(platform)) return 'mac';
            if (/^linux/.test(platform)) {
                return process.arch === 'ia32' ? 'linux32' : 'linux64';
            }
        }
        return this._getPlatform();
    }

    /**
     * Gets the default bundle path based on NW.js platform-specific structure
     * According to NW.js docs: https://docs.nwjs.io/For%20Users/Package%20and%20Distribute/
     * 
     * Windows/Linux: 
     *   - Same folder as nw.exe, OR
     *   - package.nw folder in same directory as nw.exe
     * Mac:
     *   - nwjs.app/Contents/Resources/app.nw
     */
    static getDefaultBundlePath(): string | null {
        if (typeof nw === 'undefined' || !nw.App) {
            return null;
        }

        const platform = process.platform;
        let appPath: string;
        const path = require("path");
        if (/^win/.test(platform)) {
            // Windows: same directory as nw.exe
            appPath = path.dirname(process.execPath);
        } else if (/^darwin/.test(platform)) {
            // Mac: App.app/Contents/Resources/app.nw
            // process.execPath on Mac can point to:
            // - App.app/Contents/MacOS/App (main executable)
            // - App.app/Contents/Frameworks/.../Helpers/... (helper executable)
            // We need to find the .app bundle by walking up the directory tree

            let currentPath = process.execPath;
            const foundAppBundles: string[] = [];
            const path = require("path");
            // Walk up the directory tree to find all .app bundles
            while (currentPath !== path.dirname(currentPath)) {
                const dirName = path.basename(currentPath);
                if (dirName.endsWith('.app')) {
                    foundAppBundles.push(currentPath);
                }
                currentPath = path.dirname(currentPath);
            }

            // Try each .app bundle, starting from the topmost (main app)
            // The main app should be the one that contains Contents/Resources/app.nw
            for (let i = foundAppBundles.length - 1; i >= 0; i--) {
                const appBundlePath = foundAppBundles[i];
                const resourcesPath = path.join(appBundlePath, 'Contents', 'Resources');
                const appNwPath = path.join(resourcesPath, 'app.nw');

                // Check if this .app bundle has app.nw (main app)
                if (fs.existsSync(appNwPath)) {
                    return appNwPath;
                }

                // Check if Resources directory exists (might be plain files)
                if (fs.existsSync(resourcesPath)) {
                    // Verify it's not a helper app by checking if it's inside Frameworks
                    const isHelperApp = appBundlePath.includes('/Frameworks/') ||
                        appBundlePath.includes('/Helpers/');
                    if (!isHelperApp) {
                        return resourcesPath;
                    }
                }
            }

            // Fallback: try the old method (in case execPath points to main executable)
            const fallbackResourcesPath = path.join(path.dirname(path.dirname(path.dirname(process.execPath))), 'Resources');
            const fallbackAppNwPath = path.join(fallbackResourcesPath, 'app.nw');
            if (fs.existsSync(fallbackAppNwPath)) {
                return fallbackAppNwPath;
            }
            // Last fallback: return Resources path
            return fallbackResourcesPath;
        } else {
            // Linux: same directory as nw executable
            appPath = path.dirname(process.execPath);
        }

        // Check for package.nw folder (Windows/Linux)
        const packageNwPath = path.join(appPath, 'package.nw');
        if (fs.existsSync(packageNwPath)) {
            return packageNwPath;
        }

        // Check if package.json exists in app directory (plain files)
        const packageJsonPath = path.join(appPath, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            return appPath;
        }

        return null;
    }

    /**
     * Gets the application version from nw.App.manifest.version
     * Returns the version from package.json/manifest, e.g. "1.0.0"
     */
    private _getAppVersion(): string {
        // Get version from nw.App.manifest.version
        if (typeof nw !== 'undefined' && nw.App && nw.App.manifest) {
            const manifest = nw.App.manifest;
            if (manifest.version) {
                return manifest.version;
            }
        }

        const path = require("path");
        // Fallback: try to read from package.json in bundle directory
        try {
            const packageJsonPath = path.join(this.bundlePath, 'package.json');
            if (fs.existsSync(packageJsonPath)) {
                const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
                if (packageJson.version) {
                    return packageJson.version;
                }
            }
        } catch (error) {
            // Ignore errors
        }

        // If we can't determine the version, return a default
        // This should rarely happen in a real NW.js environment
        return '1.0.0';
    }

    /**
     * Downloads a file with progress tracking
     */
    private async _downloadWithProgress(
        url: string,
        destinationPath: string,
        onProgress?: (received: number, total: number) => void,
        headers?: Record<string, string>
    ): Promise<void> {
        const response = await axios({
            method: 'get',
            url: url,
            responseType: 'stream',
            timeout: 300000,
            headers: headers,
        });

        // Check if response.data is a stream
        if (!response.data || typeof response.data.on !== 'function') {
            // Fallback: download as arraybuffer and write to file
            const arrayBufferResponse = await axios({
                method: 'get',
                url: url,
                responseType: 'arraybuffer',
                timeout: 300000,
                headers: headers,
                onDownloadProgress: (progressEvent) => {
                    if (onProgress && progressEvent.total) {
                        onProgress(progressEvent.loaded, progressEvent.total);
                    }
                },
            });

            const buffer = Buffer.from(arrayBufferResponse.data);
            fs.writeFileSync(destinationPath, buffer);
            return;
        }

        const total = parseInt(response.headers['content-length'] || '0', 10);
        let received = 0;

        const writeStream = fs.createWriteStream(destinationPath);

        response.data.on('data', (chunk: Buffer) => {
            received += chunk.length;
            if (onProgress && total > 0) {
                onProgress(received, total);
            }
        });

        await pipelinePromise(response.data, writeStream);
    }

    /**
     * Gets the saved bundle version from local file
     */
    private _getSavedVersion(): number {
        try {
            if (fs.existsSync(this.versionFilePath)) {
                const content = fs.readFileSync(this.versionFilePath, 'utf-8');
                const data = JSON.parse(content);
                const version = typeof data.version === 'number' ? data.version : 0;
                if (this.dev) {
                    console.log('[nw-ota] _getSavedVersion() - loaded version:', version, 'from', this.versionFilePath);
                }
                return version;
            }
        } catch (error) {
            if (this.dev) {
                console.log('[nw-ota] _getSavedVersion() - error loading version:', error);
            }
            // Ignore errors, return 0 as default
        }
        if (this.dev) {
            console.log('[nw-ota] _getSavedVersion() - no version file found, returning 0');
        }
        return 0;
    }

    /**
     * Saves the bundle version to local file
     */
    private _saveVersion(version: number): void {
        if (this.dev) {
            console.log('[nw-ota] _saveVersion() called');
            console.log('  Version:', version);
            console.log('  Version file path:', this.versionFilePath);
        }

        try {
            const data = {
                version: version,
                updatedAt: new Date().toISOString(),
            };
            const content = JSON.stringify(data, null, 2);
            const path = require("path");
            const dir = path.dirname(this.versionFilePath);
            if (!fs.existsSync(dir)) {
                if (this.dev) {
                    console.log('  Creating directory:', dir);
                }
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.versionFilePath, content, 'utf-8');

            if (this.dev) {
                console.log('  Version saved successfully');
            }
        } catch (error) {
            // Log but don't throw - version saving is not critical
            console.warn('[nw-ota] Failed to save bundle version:', error);
        }
    }

    /**
     * Gets the current bundle version (from options or saved file)
     */
    getCurrentVersion(): number {
        return this._getSavedVersion();
    }

    /**
     * Gets version info string: "Platform Version OTAVersion"
     * Example: "win 1.0.0 5" or "mac 1.2.3 3"
     * 
     * @returns Version info string with platform, application version, and OTA bundle version
     */
    getVersionInfo(): string {
        const platform = this._getNWJSPlatform();
        const appVersion = this._getAppVersion();
        const otaVersion = this.getCurrentVersion();

        return `${platform} ${appVersion} ${otaVersion}`;
    }

    /**
     * Checks for updates and installs if available
     * Works in NW.js context - automatically detects platform and application version
     */
    async checkForUpdate(options: CheckUpdateOptions): Promise<void> {
        const dev = this.dev;

        if (dev) {
            console.log('[nw-ota] checkForUpdate() called');
            console.log('  Endpoint:', options.endpoint);
            console.log('  Project key:', options.projectKey);
        }

        try {
            // Get platform and application version from NW.js
            const platform = this._getNWJSPlatform();
            const appVersion = this._getAppVersion();

            if (dev) {
                console.log('  Detected platform:', platform);
                console.log('  Detected app version:', appVersion);
            }

            // Use provided version or load from saved file
            const currentVersion = options.currentVersion !== undefined
                ? options.currentVersion
                : this._getSavedVersion();

            if (dev) {
                console.log('  Current OTA version:', currentVersion);
            }

            // Build update.json URL
            const updateJsonUrl = `${options.endpoint}/ota/nwjs/${options.projectKey}/${platform}/${appVersion}/update.json`;

            if (dev) {
                console.log('  Update.json URL:', updateJsonUrl);
                console.log('  Fetching update.json...');
            }

            // Download update.json
            let updates: UpdateEntry[] = [];
            try {
                const response = await axios.get<UpdateEntry[]>(updateJsonUrl, {
                    headers: options.headers,
                    timeout: 30000,
                });
                updates = response.data;

                if (dev) {
                    console.log('  Update.json fetched successfully');
                    console.log('  Total updates found:', updates.length);
                }
            } catch (error: any) {
                if (error.response?.status === 404) {
                    if (dev) {
                        console.log('  Update.json not found (404)');
                    }
                    // No update.json found
                    options.noUpdate?.();
                    return;
                }
                if (dev) {
                    console.error('  Failed to fetch update.json:', error.message);
                }
                throw new Error(`Failed to fetch update.json: ${error.message}`);
            }

            if (!Array.isArray(updates) || updates.length === 0) {
                if (dev) {
                    console.log('  No updates in update.json');
                }
                options.noUpdate?.();
                return;
            }

            // Filter enabled updates with version > currentVersion
            const availableUpdates = updates
                .filter(update => update.enable && update.version > currentVersion)
                .sort((a, b) => b.version - a.version); // Sort descending

            if (dev) {
                console.log('  Available updates (enabled, version > current):', availableUpdates.length);
                if (availableUpdates.length > 0) {
                    console.log('  Latest update:', availableUpdates[0]);
                }
            }

            if (availableUpdates.length === 0) {
                if (dev) {
                    console.log('  No available updates');
                }
                options.noUpdate?.();
                return;
            }

            // Get the latest update
            const latestUpdate = availableUpdates[0];

            if (dev) {
                console.log('  Installing update version:', latestUpdate.version);
                console.log('  Download URL:', latestUpdate.download);
            }

            options.updateFound?.(latestUpdate);

            const path = require("path");
            // Download and install
            const filename = decodeURIComponent(path.basename(latestUpdate.download)) || 'bundle.zip';
            const zipPath = path.resolve(this.temporaryDirectory, filename);

            try {
                // Download with progress
                if (dev) {
                    console.log('  Starting download...');
                }
                await this._downloadWithProgress(
                    latestUpdate.download,
                    zipPath,
                    options.progress,
                    options.headers
                );

                // Unpack
                if (dev) {
                    console.log('  Starting unpack...');
                }
                const unpackedPath = await this.unpack(zipPath);

                // Find bundle source
                const bundleSource = this._findBundleSource(unpackedPath);

                if (dev) {
                    console.log('  Bundle source:', bundleSource);
                }

                // Replace bundle
                if (dev) {
                    console.log('  Replacing bundle...');
                }
                await this.replace(bundleSource);

                // Save the new version
                if (dev) {
                    console.log('  Saving new version...');
                }
                this._saveVersion(latestUpdate.version);

                // Cleanup
                if (dev) {
                    console.log('  Cleaning up temporary files...');
                }
                if (fs.existsSync(zipPath)) {
                    await removePath(zipPath);
                }
                if (fs.existsSync(unpackedPath)) {
                    await removePath(unpackedPath);
                }

                if (dev) {
                    console.log('  Update installed successfully!');
                }

                // Success callback
                options.updateSuccess?.();

                // Restart if requested
                if (options.restartAfterInstall) {
                    const delay = options.restartDelay || 300;
                    if (dev) {
                        console.log(`  Restarting app in ${delay}ms...`);
                    }
                    setTimeout(() => {
                        if (typeof nw !== 'undefined' && nw.App) {
                            nw.App.quit();
                        } else {
                            process.exit(0);
                        }
                    }, delay);
                }
            } catch (error: any) {
                if (dev) {
                    console.error('  Error during update installation:', error);
                }
                // Cleanup on error
                if (fs.existsSync(zipPath)) {
                    await removePath(zipPath).catch(() => { });
                }
                const errorMessage = error.message || String(error);
                options.updateFail?.(new Error(`Failed to install update: ${errorMessage}`));
            }
        } catch (error: any) {
            if (dev) {
                console.error('[nw-ota] Error in checkForUpdate:', error);
            }
            const errorMessage = error.message || String(error);
            options.updateFail?.(new Error(`Failed to check for updates: ${errorMessage}`));
        }
    }
}

