import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import JSON5 from 'json5';
import { isKeychainAvailable, omitSecrets, pickSecrets, SECRET_FIELDS, writeKeychainSecrets } from './keychain.js';

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
  // WalletConnect
  walletConnectProjectId?: string;
  // Zerion (unified EVM + Solana portfolio & history)
  zerionApiKey?: string;
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

  // On macOS secrets go to the Keychain and never touch the config file
  let fileUpdates = config;
  if (isKeychainAvailable()) {
    const secrets = pickSecrets(config);
    if (Object.keys(secrets).length > 0) {
      writeKeychainSecrets(secrets);
    }
    fileUpdates = omitSecrets(config);
  }

  // Load existing config and merge
  const existing = existsSync(path) ? readConfigFile(path, () => {}) : {};
  writeConfigFile(path, { ...existing, ...fileUpdates });
}

function writeConfigFile(path: string, config: Partial<OnchainConfig>): void {
  writeFileSync(path, JSON5.stringify(config, null, 2), { encoding: 'utf8', mode: 0o600 });
  chmodSync(path, 0o600);
}

// Moves every secret out of the global and local config files into the Keychain.
// Returns the field names moved per file; values are never returned.
export function migrateSecretsToKeychain(): { path: string; fields: string[] }[] {
  if (!isKeychainAvailable()) {
    throw new Error('macOS Keychain is not available on this platform');
  }
  const results: { path: string; fields: string[] }[] = [];
  // Global first so a local override wins in the Keychain, matching load order
  for (const path of [getGlobalConfigPath(), getLocalConfigPath()]) {
    if (!existsSync(path)) {
      continue;
    }
    const raw = readConfigFile(path, (message) => {
      throw new Error(message);
    });
    const secrets = pickSecrets(raw);
    const fields = SECRET_FIELDS.filter((field) => field in raw);
    if (fields.length === 0) {
      continue;
    }
    // Keychain write is verified before the file loses its copy
    if (Object.keys(secrets).length > 0) {
      writeKeychainSecrets(secrets);
    }
    writeConfigFile(path, omitSecrets(raw));
    results.push({ path, fields });
  }
  return results;
}

export function getConfigPath(options?: { global?: boolean }): string {
  return options?.global ? getGlobalConfigPath() : getLocalConfigPath();
}
