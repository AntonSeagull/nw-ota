import * as fs from 'node:fs';
import * as path from 'node:path';
import { ProjectConfig } from './types.js';

const CONFIG_FILE = '.nw-ota-config.json';

export function getConfigPath(): string {
  return path.join(process.cwd(), CONFIG_FILE);
}

export function loadConfig(): ProjectConfig {
  const configPath = getConfigPath();
  if (fs.existsSync(configPath)) {
    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.warn('Failed to load config file, using defaults');
      return {};
    }
  }
  return {};
}

export function saveConfig(config: ProjectConfig): void {
  const configPath = getConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

export function updateConfig(updates: Partial<ProjectConfig>): ProjectConfig {
  const config = loadConfig();
  const updated = { ...config, ...updates };
  saveConfig(updated);
  return updated;
}

