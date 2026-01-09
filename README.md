# nw-ota

[English](README.md) | [Русский](README_RU.md)

Update NW.js application bundle (app files) without replacing the entire application.

This library allows you to update only the application bundle (e.g., `app/` folder) of your NW.js application, while keeping the NW.js runtime and other files intact.

## Installation

```bash
npm install nw-ota
```

## Usage

### Basic Example - Updating Bundle

```typescript
import BundleUpdater from "nw-ota";

// Option 1: Auto-detect bundle path (recommended for NW.js apps)
// bundlePath will be automatically detected using getDefaultBundlePath()
const updater = new BundleUpdater({});

// Option 2: Manual path
// const updater = new BundleUpdater({
//   bundlePath: "./app", // Path to your app bundle directory
// });

// Update bundle from URL
try {
  await updater.update("https://example.com/updates/app-bundle.zip");
  console.log("Bundle updated successfully!");
} catch (error) {
  console.error("Update failed:", error);
}
```

### Automatic Update Check (NW.js Context)

The library can automatically check for updates from S3 and install them. This works in NW.js context and automatically detects platform and application version:

```typescript
import BundleUpdater from "nw-ota";

// Auto-detect bundle path based on platform (bundlePath is optional)
const updater = new BundleUpdater({});

// Check for updates and install automatically
await updater.checkForUpdate({
  endpoint: "https://bucket.s3.region.amazonaws.com",
  projectKey: "my-project",
  // currentVersion is optional - if not provided, will load from saved version file
  // After successful update, version is automatically saved

  // Callbacks
  updateFound: (update) => {
    console.log(`Update found: version ${update.version}`);
  },

  updateSuccess: () => {
    console.log("Update installed successfully!");
  },

  updateFail: (error) => {
    console.error("Update failed:", error);
  },

  noUpdate: () => {
    console.log("No updates available");
  },

  // Optional: notify that restart is needed
  onNeedRestart: () => {
    console.log("Update installed! Please restart the app to apply changes.");
  },

  // Optional: track status changes
  onStatus: (status) => {
    console.log("Update status:", status);
  },
});
```

The function automatically:

- Detects platform (win/mac/linux32/linux64) from NW.js
- Gets **application version** (e.g., "1.0.0") from `nw.App.manifest.version` - this is the version from your package.json/manifest
- Loads current OTA bundle version from `package.json` key `"ota"` if `currentVersion` is not provided (defaults to 0 if key doesn't exist)
- Builds update.json URL: `{endpoint}/ota/nwjs/{projectKey}/{platform}/{appVersion}/update.json`
- Finds the latest enabled update with version > currentVersion
- Downloads and installs the update
- **Saves the new version automatically** to `package.json` key `"ota"` after successful installation

**Note:** The `appVersion` in the URL path refers to the application version from `nw.App.manifest.version` (like "1.0.0", "1.2.3"). This allows you to have separate update channels for different application versions.

### Step-by-step Update

```typescript
import BundleUpdater from "nw-ota";

const updater = new BundleUpdater({
  bundlePath: "./app",
  temporaryDirectory: "./temp",
  backup: true, // Create backup before replacing (default: true)
});

try {
  // 1. Download the zip file
  const zipPath = await updater.download(
    "https://example.com/updates/app-bundle.zip"
  );

  // 2. Unpack the zip file
  const unpackedPath = await updater.unpack(zipPath);

  // 3. Replace the bundle
  await updater.replace(unpackedPath);

  console.log("Bundle updated successfully!");
} catch (error) {
  console.error("Update failed:", error);
}
```

## Publishing Updates (CLI)

The package includes a CLI tool for publishing updates to S3 storage.

### Installation

```bash
npm install -g nw-ota
```

Or use with npx:

```bash
npx nw-ota
```

### Usage

Run the publish command in your project directory:

```bash
npx nw-ota-publish
```

Or:

```bash
npx nw-ota
```

The CLI will guide you through the process:

1. **Build Path**: Enter the path to your build directory (saved for future use)
2. **Project Key**: Enter a unique project identifier (saved for future use)
3. **Platform**: Select platform (win, mac, linux32, linux64)
4. **Version**: Enter the application version (e.g., "1.0.0") - this should match the version from your package.json/manifest (saved per platform)
5. **S3 Configuration**: Enter S3 credentials and settings (saved for future use)
6. **Upload**: The tool will:
   - Create a zip archive from your build directory
   - Upload it to S3 at: `/ota/nwjs/{projectKey}/{platform}/{version}/update-v{X}.zip`
   - Update or create `update.json` with the new version

**Note:** The version should match the application version from your package.json/manifest (e.g., "1.0.0", "1.2.3"). This allows you to have separate update channels for different application versions.

### Configuration

The CLI saves configuration in `.nw-ota-config.json` in your project directory. This file contains:

- Build path
- Project key
- Platform-specific versions
- S3 configuration

**Note**: The config file is automatically added to `.gitignore` to prevent committing sensitive S3 credentials.

### S3 Structure

Updates are stored in S3 with the following structure:

```
ota/nwjs/{projectKey}/{platform}/{version}/
  ├── update.json
  ├── update-v1.zip
  ├── update-v2.zip
  └── ...
```

### update.json Format

The `update.json` file contains an array of available updates:

```json
[
  {
    "version": 1,
    "enable": true,
    "download": "https://bucket.s3.region.amazonaws.com/ota/nwjs/project/win/1.0.0/update-v1.zip"
  },
  {
    "version": 2,
    "enable": true,
    "download": "https://bucket.s3.region.amazonaws.com/ota/nwjs/project/win/1.0.0/update-v2.zip"
  }
]
```

## API

### `new BundleUpdater(options)`

Creates a new instance of BundleUpdater.

**Options:**

- `bundlePath` (optional): Path to the bundle directory to replace. If not provided, will be automatically detected using `BundleUpdater.getDefaultBundlePath()`.

  **Important:** In NW.js apps, bundle location is **platform-specific** according to [NW.js documentation](https://docs.nwjs.io/For%20Users/Package%20and%20Distribute/):

  - **Windows/Linux**: Same folder as `nw.exe` (or `nw`), OR `package.nw` folder in the same directory
  - **Mac**: `nwjs.app/Contents/Resources/app.nw`

  If `bundlePath` is not provided, the library will automatically detect it:

  ```typescript
  // Auto-detect (recommended for NW.js apps)
  const updater = new BundleUpdater({});

  // Or provide manually
  const updater = new BundleUpdater({
    bundlePath: "./app",
  });
  ```

  Examples:

  - `'./app'` - relative path
  - `'./package.nw'` - package.nw folder (Windows/Linux)
  - `'/path/to/app'` - absolute path

- `temporaryDirectory` (optional): Path to temporary directory for downloads. Defaults to `os.tmpdir()`
- `backup` (optional): Whether to create a backup before replacing. Defaults to `true`

### `BundleUpdater.getDefaultBundlePath()`

Static method that automatically detects the default bundle path based on NW.js platform-specific structure.

**Returns:** `string | null` - The detected bundle path, or `null` if NW.js is not available or path cannot be determined.

**Example:**

```typescript
const defaultPath = BundleUpdater.getDefaultBundlePath();
if (defaultPath) {
  const updater = new BundleUpdater({
    bundlePath: defaultPath,
  });
} else {
  // Fallback to manual path
  const updater = new BundleUpdater({
    bundlePath: "./app",
  });
}
```

### `updater.update(url)`

Downloads, unpacks and replaces the bundle in one call.

**Parameters:**

- `url` (string): URL to download the zip file from

**Returns:** `Promise<void>`

### `updater.download(url)`

Downloads a zip file from URL.

**Parameters:**

- `url` (string): URL to download the zip file from

**Returns:** `Promise<string>` - Path to the downloaded file

### `updater.unpack(zipPath)`

Unpacks a zip file to a temporary directory.

**Parameters:**

- `zipPath` (string): Path to the zip file

**Returns:** `Promise<string>` - Path to the unpacked directory

### `updater.replace(newBundlePath)`

Replaces the current bundle with the new one.

**Parameters:**

- `newBundlePath` (string): Path to the new bundle directory

**Returns:** `Promise<void>`

**Platform-specific behavior:**

- **Windows**: For `package.nw` directory, only the contents are removed (directory is preserved), then new files are copied into it. This prevents issues with locked directories on Windows.
- **Other platforms**: The entire bundle directory is removed and recreated.

### `updater.createBackup()`

Creates a backup of the current bundle.

**Returns:** `Promise<string | null>` - Path to the backup directory, or null if bundle doesn't exist

### `updater.getCurrentVersion()`

Gets the current bundle version from `package.json`.

**Returns:** `number` - Current bundle version (0 if `"ota"` key doesn't exist in package.json)

**Note:** The version is automatically saved after successful updates via `checkForUpdate()`. The version is stored in `package.json` in the `"ota"` key within the bundle directory.

**Example package.json:**

```json
{
  "name": "my-app",
  "version": "1.0.0",
  "ota": 5
}
```

### `updater.getVersionInfo()`

Gets version info string with platform, application version, and OTA bundle version.

**Returns:** `string` - Version info in format: `"Platform Version (OTAVersion)"`

**Example:**

```typescript
const versionInfo = updater.getVersionInfo();
console.log(versionInfo); // "Windows 1.0.0 (5)" or "macOS 1.2.3 (3)"
```

This is the same information that is used when checking for updates (platform, application version, and current OTA version).

### `BundleUpdater.getVersionInfo(bundlePath?)`

Static method that gets version info without creating an instance. Can be called without constructor.

**Parameters:**

- `bundlePath` (optional): Bundle path. If not provided, will try to auto-detect using `getDefaultBundlePath()`.

**Returns:** `string` - Version info in format: `"Platform Version (OTAVersion)"`

**Example:**

```typescript
// Without constructor
const versionInfo = BundleUpdater.getVersionInfo();
console.log(versionInfo); // "Windows 1.0.0 (5)"

// Or with explicit bundle path
const versionInfo = BundleUpdater.getVersionInfo("./app");
```

### `updater.checkForUpdate(options)`

Checks for updates from S3 storage and installs them automatically. Works in NW.js context - automatically detects platform and application version.

**Parameters:**

- `options` (CheckUpdateOptions): Configuration object

  - `endpoint` (string, required): S3 endpoint/base URL where updates are stored
  - `projectKey` (string, required): Unique project identifier
  - `currentVersion` (number, optional): Current bundle version. If not provided, will be loaded from `package.json` key `"ota"`. Defaults to 0 if key doesn't exist.
  - `headers` (Record<string, string>, optional): Optional headers for requests
  - `updateFound` (function, optional): Callback when update is found `(update: UpdateEntry) => void`
  - `updateSuccess` (function, optional): Callback when update succeeds `() => void`
  - `updateFail` (function, optional): Callback when update fails `(error?: string | Error) => void`
  - `noUpdate` (function, optional): Callback when no update is available `() => void`
  - `onNeedRestart` (function, optional): Callback triggered after update is successfully installed. The app will not restart automatically - user must restart manually to apply the update `() => void`
  - `onStatus` (function, optional): Callback triggered on every status change during the update process. Provides unified status tracking `(status: UpdateStatus) => void`

**UpdateStatus values:**

- `'checking'` - Checking for available updates
- `'update-found'` - Update has been found and will be installed
- `'downloading'` - Downloading the update package
- `'downloaded'` - Download completed successfully
- `'unpacking'` - Unpacking the downloaded archive
- `'unpacked'` - Unpacking completed successfully
- `'replacing'` - Replacing the current bundle with the new one
- `'replaced'` - Bundle replacement completed successfully
- `'saving'` - Saving the new version information
- `'cleaning'` - Cleaning up temporary files
- `'success'` - Update installation completed successfully
- `'error'` - An error occurred during the update process
- `'no-update'` - No updates available
- `'restart-needed'` - Update installed, application restart is required

**Returns:** `Promise<void>`

**Example:**

```typescript
await updater.checkForUpdate({
  endpoint: "https://bucket.s3.region.amazonaws.com",
  projectKey: "my-project",
  // currentVersion will be loaded automatically from package.json "ota" key
  updateSuccess: () => {
    console.log(
      "Update installed! Version saved automatically to package.json."
    );
  },
  onNeedRestart: () => {
    console.log("Please restart the app to apply the update.");
  },
});

// Get current version
const currentVersion = updater.getCurrentVersion();
console.log(`Current bundle version: ${currentVersion}`);
```

## Building

To build the TypeScript source:

```bash
npm run build
```

This will compile the TypeScript files to JavaScript in the `dist/` directory.

## Differences from nw-updater

- **nw-updater**: Replaces the entire NW.js application (executable, runtime, and all files)
- **nw-ota**: Replaces only the application bundle (your app code), keeping the NW.js runtime intact

This is useful when:

- You want to update your application code without redistributing the entire NW.js runtime
- You want smaller update packages
- You want faster updates (only app files, not the entire application)

## Requirements

- Node.js 14.0.0 or higher
- TypeScript 5.0+ (for development)
- For Windows: PowerShell 5.0+ (Windows 10+) or unzip utility
- For macOS/Linux: unzip utility (usually pre-installed)
- For publishing: AWS S3 or S3-compatible storage
- For automatic updates: NW.js application context (for `checkForUpdate` method)

### Required Dependencies in NW.js Build

When building your NW.js application, the following packages from `node_modules` must be included in your build:

- `process-nextick-args`
- `yauzl`
- `yazl`

These libraries are required by `nw-ota` for zip file extraction and are used at runtime in your NW.js application. Make sure these packages are bundled with your application when creating the NW.js build.

## License

MIT
