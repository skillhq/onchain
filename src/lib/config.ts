import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import JSON5 from 'json5';

export interface PolymarketPreferences {
  excludeTags?: string[]; // e.g., ["sports", "nfl", "nba"]
  includeTags?: string[]; // e.g., ["crypto", "politics", "ai"]
}

export interface OnchainConfig {
  debankApiKey?: string;
  heliusApiKey?: string;
  // Coinbase CDP API (JWT-based auth with ECDSA)
  coinbaseApiKeyId?: string; // format: organizations/{org_id}/apiKeys/{key_id}
  coinbaseApiKeySecret?: string; // EC private key in PEM format
  binanceApiKey?: string;
  binanceApiSecret?: string;
  coingeckoApiKey?: string;
  coinmarketcapApiKey?: string;
  // Block explorer APIs
  etherscanApiKey?: string;
  solscanApiKey?: string;
  timeoutMs?: number;
  // Polymarket preferences
  polymarket?: PolymarketPreferences;
}

const DEFAULT_CONFIG: OnchainConfig = {
  timeoutMs: 30000,
};

function getGlobalConfigPath(): string {
  return join(homedir(), '.config', 'onchain', 'config.json5');
}

function getLocalConfigPath(): string {
  return join(process.cwd(), '.onchainrc.json5');
}

function readConfigFile(path: string, warn: (message: string) => void): Partial<OnchainConfig> {
  if (!existsSync(path)) {
    return {};
  }
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON5.parse(raw) as Partial<OnchainConfig>;
    return parsed ?? {};
  } catch (error) {
    warn(`Failed to parse config at ${path}: ${error instanceof Error ? error.message : String(error)}`);
    return {};
  }
}

export function loadConfig(warn: (message: string) => void): OnchainConfig {
  const globalPath = getGlobalConfigPath();
  const localPath = getLocalConfigPath();

  return {
    ...DEFAULT_CONFIG,
    ...readConfigFile(globalPath, warn),
    ...readConfigFile(localPath, warn),
  };
}

export function saveConfig(config: Partial<OnchainConfig>, options?: { global?: boolean }): void {
  const path = options?.global ? getGlobalConfigPath() : getLocalConfigPath();
  const dir = dirname(path);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Load existing config and merge
  const existing = existsSync(path) ? readConfigFile(path, () => {}) : {};
  const merged = { ...existing, ...config };

  const content = JSON5.stringify(merged, null, 2);
  writeFileSync(path, content, 'utf8');
}

export function getConfigPath(options?: { global?: boolean }): string {
  return options?.global ? getGlobalConfigPath() : getLocalConfigPath();
}
