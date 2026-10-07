import { execFileSync } from 'node:child_process';
import type { OnchainConfig } from './config.js';

// All secrets live in one macOS Keychain item as a JSON object, so resolving
// credentials costs a single `security` call instead of one per provider.
const SERVICE = 'onchain';
const ACCOUNT = 'credentials';
const HEX_RE = /^[0-9a-fA-F]+$/;

export const SECRET_FIELDS = [
  'debankApiKey',
  'heliusApiKey',
  'coinbaseApiKeyId',
  'coinbaseApiKeySecret',
  'binanceApiKey',
  'binanceApiSecret',
  'coingeckoApiKey',
  'coinmarketcapApiKey',
  'etherscanApiKey',
  'solscanApiKey',
  'walletConnectProjectId',
  'zerionApiKey',
] as const;

export type SecretField = (typeof SECRET_FIELDS)[number];
export type KeychainSecrets = Partial<Pick<OnchainConfig, SecretField>>;

let cache: KeychainSecrets | undefined;

export function isKeychainAvailable(): boolean {
  return process.platform === 'darwin';
}

export function pickSecrets(config: Partial<OnchainConfig>): KeychainSecrets {
  const secrets: KeychainSecrets = {};
  for (const field of SECRET_FIELDS) {
    const value = config[field];
    if (typeof value === 'string' && value.length > 0) {
      secrets[field] = value;
    }
  }
  return secrets;
}

export function omitSecrets<T extends Partial<OnchainConfig>>(config: T): T {
  const rest = { ...config };
  for (const field of SECRET_FIELDS) {
    delete rest[field];
  }
  return rest;
}

export function readKeychainSecrets(): KeychainSecrets {
  if (cache) {
    return cache;
  }
  if (!isKeychainAvailable()) {
    cache = {};
    return cache;
  }
  try {
    const raw = execFileSync('security', ['find-generic-password', '-s', SERVICE, '-a', ACCOUNT, '-w'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    // `security -w` prints the value as hex when it holds non-printable bytes
    const json = raw.startsWith('{') || !HEX_RE.test(raw) ? raw : Buffer.from(raw, 'hex').toString('utf8');
    cache = pickSecrets(JSON.parse(json) as Partial<OnchainConfig>);
  } catch {
    // Missing item (exit 44) or unreadable value: treat as no keychain secrets
    cache = {};
  }
  return cache;
}

// Merges `updates` into the stored secrets. The value goes in through stdin as
// hex (`security -i` + `-X`) so it never appears in argv or the process list.
export function writeKeychainSecrets(updates: KeychainSecrets): void {
  if (!isKeychainAvailable()) {
    throw new Error('macOS Keychain is not available on this platform');
  }
  const merged = { ...readKeychainSecrets(), ...pickSecrets(updates) };
  const hex = Buffer.from(JSON.stringify(merged), 'utf8').toString('hex');
  execFileSync('security', ['-i'], {
    input: `add-generic-password -U -s ${SERVICE} -a ${ACCOUNT} -l "onchain CLI credentials" -X ${hex}\n`,
    stdio: ['pipe', 'ignore', 'pipe'],
  });
  cache = undefined;
  const stored = readKeychainSecrets();
  for (const field of Object.keys(merged) as SecretField[]) {
    if (stored[field] !== merged[field]) {
      throw new Error(`Keychain write did not persist ${field}`);
    }
  }
}
