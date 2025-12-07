#!/usr/bin/env node

import * as fs from 'fs';
import inquirer from 'inquirer';
import * as os from 'os';
import * as path from 'path';

import {
  loadConfig,
  updateConfig,
} from './config.js';
import {
  createS3Client,
  getUpdateJson,
  saveUpdateJson,
  uploadFile,
} from './s3.js';
import {
  Platform,
  S3Config,
  UpdateEntry,
} from './types.js';
import { createZipFromDirectory } from './zip.js';

const PLATFORMS: Platform[] = ['win', 'mac', 'linux32', 'linux64'];

async function askBuildPath(config: any): Promise<string> {
  if (config.buildPath && fs.existsSync(config.buildPath)) {
    const { useExisting } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'useExisting',
        message: `Use existing build path: ${config.buildPath}?`,
        default: true,
      },
    ]);

    if (useExisting) {
      return config.buildPath;
    }
  }

  const { buildPath } = await inquirer.prompt([
    {
      type: 'input',
      name: 'buildPath',
      message: 'Enter path to build directory:',
      validate: (input: string) => {
        if (!input.trim()) {
          return 'Build path is required';
        }
        const resolved = path.resolve(input);
        if (!fs.existsSync(resolved)) {
          return 'Build path does not exist';
        }
        const stat = fs.statSync(resolved);
        if (!stat.isDirectory()) {
          return 'Build path must be a directory';
        }
        return true;
      },
    },
  ]);

  return path.resolve(buildPath);
}

async function askProjectKey(config: any): Promise<string> {
  if (config.projectKey) {
    const { useExisting } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'useExisting',
        message: `Use existing project key: ${config.projectKey}?`,
        default: true,
      },
    ]);

    if (useExisting) {
      return config.projectKey;
    }
  }

  const { projectKey } = await inquirer.prompt([
    {
      type: 'input',
      name: 'projectKey',
      message: 'Enter unique project key/name:',
      validate: (input: string) => {
        if (!input.trim()) {
          return 'Project key is required';
        }
        // Validate that it's a valid path segment
        if (!/^[a-zA-Z0-9_-]+$/.test(input)) {
          return 'Project key can only contain letters, numbers, underscores, and hyphens';
        }
        return true;
      },
    },
  ]);

  return projectKey;
}

async function askPlatform(): Promise<Platform> {
  const { platform } = await inquirer.prompt([
    {
      type: 'list',
      name: 'platform',
      message: 'Select platform:',
      choices: PLATFORMS,
    },
  ]);

  return platform;
}

async function askAppVersion(config: any, platform: Platform): Promise<string> {
  const existingVersion = config.platforms?.[platform]?.nativeVersion;

  if (existingVersion) {
    const { useExisting } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'useExisting',
        message: `Use existing version for ${platform}: ${existingVersion}?`,
        default: true,
      },
    ]);

    if (useExisting) {
      return existingVersion;
    }
  }

  const { appVersion } = await inquirer.prompt([
    {
      type: 'input',
      name: 'appVersion',
      message: `Enter version for ${platform}:`,
      default: existingVersion || '1.0.0',
      validate: (input: string) => {
        if (!input.trim()) {
          return 'Version is required';
        }
        return true;
      },
    },
  ]);

  return appVersion;
}

async function askS3Config(config: any): Promise<S3Config> {
  if (config.s3) {
    const { useExisting } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'useExisting',
        message: 'Use existing S3 configuration?',
        default: true,
      },
    ]);

    if (useExisting) {
      return config.s3;
    }
  }

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'accessKeyId',
      message: 'S3 Access Key ID:',
      validate: (input: string) => !!input.trim() || 'Access Key ID is required',
    },
    {
      type: 'password',
      name: 'secretAccessKey',
      message: 'S3 Secret Access Key:',
      validate: (input: string) => !!input.trim() || 'Secret Access Key is required',
    },
    {
      type: 'input',
      name: 'region',
      message: 'S3 Region:',
      default: 'us-east-1',
      validate: (input: string) => !!input.trim() || 'Region is required',
    },
    {
      type: 'input',
      name: 'bucket',
      message: 'S3 Bucket:',
      validate: (input: string) => !!input.trim() || 'Bucket is required',
    },
    {
      type: 'input',
      name: 'endpoint',
      message: 'S3 Endpoint (optional, for S3-compatible services):',
      default: '',
    },
  ]);

  const s3Config: S3Config = {
    accessKeyId: answers.accessKeyId,
    secretAccessKey: answers.secretAccessKey,
    region: answers.region,
    bucket: answers.bucket,
  };

  if (answers.endpoint) {
    s3Config.endpoint = answers.endpoint;
  }

  return s3Config;
}

async function getNextVersion(updates: UpdateEntry[]): Promise<number> {
  if (updates.length === 0) {
    return 1;
  }

  const maxVersion = Math.max(...updates.map(u => u.version));
  return maxVersion + 1;
}

async function main() {
  console.log('NW.js Bundle Updater - Publish Tool\n');

  let config = loadConfig();

  // Ask for build path
  const buildPath = await askBuildPath(config);
  config = updateConfig({ buildPath });

  // Ask for project key
  const projectKey = await askProjectKey(config);
  config = updateConfig({ projectKey });

  // Ask for platform
  const platform = await askPlatform();

  // Ask for app version
  const appVersion = await askAppVersion(config, platform);
  config = updateConfig({
    platforms: {
      ...(config.platforms || {}),
      [platform]: {
        ...(config.platforms?.[platform] || {}),
        nativeVersion: appVersion,
      },
    },
  });

  // Ask for S3 config
  const s3Config = await askS3Config(config);
  config = updateConfig({ s3: s3Config });

  // Create S3 client
  const s3Client = createS3Client(s3Config);

  // Build S3 paths
  const s3BasePath = `ota/nwjs/${projectKey}/${platform}/${appVersion}`;
  const updateJsonKey = `${s3BasePath}/update.json`;

  // Get existing updates
  console.log('\nFetching existing updates...');
  let updates: UpdateEntry[] = [];
  try {
    updates = await getUpdateJson(s3Client, s3Config.bucket, updateJsonKey);
    console.log(`Found ${updates.length} existing update(s)`);
  } catch (error: any) {
    console.log('No existing updates found, starting fresh');
  }

  // Get next version
  const nextVersion = await getNextVersion(updates);
  console.log(`\nNext update version: ${nextVersion}`);

  // Create zip
  const tempDir = os.tmpdir();
  const zipFileName = `update-v${nextVersion}.zip`;
  const zipPath = path.join(tempDir, zipFileName);

  console.log(`\nCreating zip archive from ${buildPath}...`);
  await createZipFromDirectory(buildPath, zipPath);
  console.log(`Zip created: ${zipPath}`);

  // Upload zip to S3
  const zipS3Key = `${s3BasePath}/${zipFileName}`;
  console.log(`\nUploading to S3: ${zipS3Key}...`);

  const downloadUrl = await uploadFile(
    s3Client,
    s3Config.bucket,
    zipS3Key,
    zipPath,
    s3Config.region,
    s3Config.endpoint
  );
  console.log(`Upload complete: ${downloadUrl}`);

  // Add new update entry
  const newUpdate: UpdateEntry = {
    version: nextVersion,
    enable: true,
    download: downloadUrl,
  };

  updates.push(newUpdate);

  // Save update.json
  console.log(`\nSaving update.json...`);
  await saveUpdateJson(s3Client, s3Config.bucket, updateJsonKey, updates);
  console.log('Update.json saved successfully!');

  // Cleanup
  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  console.log('\n✅ Update published successfully!');
  console.log(`\nUpdate details:`);
  console.log(`  Version: ${nextVersion}`);
  console.log(`  Platform: ${platform}`);
  console.log(`  Version: ${appVersion}`);
  console.log(`  Download URL: ${downloadUrl}`);
}

main().catch((error) => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});

