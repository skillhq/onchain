/**
 * Transaction hash detection and validation utilities
 */

import type { EtherscanChain } from '../onchain-client-types.js';

export type TxHashType = 'evm' | 'solana' | 'unknown';

export interface ParsedTxInput {
  hash: string;
  chain?: EtherscanChain | 'solana';
  type: TxHashType;
}

// Explorer URL patterns mapped to chains
const EXPLORER_PATTERNS: Array<{ pattern: RegExp; chain: EtherscanChain | 'solana' }> = [
  // Ethereum
  { pattern: /^https?:\/\/(?:www\.)?etherscan\.io\/tx\/(0x[a-fA-F0-9]{64})/, chain: 'ethereum' },
  // Polygon
  { pattern: /^https?:\/\/(?:www\.)?polygonscan\.com\/tx\/(0x[a-fA-F0-9]{64})/, chain: 'polygon' },
  // BSC
  { pattern: /^https?:\/\/(?:www\.)?bscscan\.com\/tx\/(0x[a-fA-F0-9]{64})/, chain: 'bsc' },
  // Arbitrum
  { pattern: /^https?:\/\/(?:www\.)?arbiscan\.io\/tx\/(0x[a-fA-F0-9]{64})/, chain: 'arbitrum' },
  // Base
  { pattern: /^https?:\/\/(?:www\.)?basescan\.org\/tx\/(0x[a-fA-F0-9]{64})/, chain: 'base' },
  // Optimism
  { pattern: /^https?:\/\/(?:www\.)?optimistic\.etherscan\.io\/tx\/(0x[a-fA-F0-9]{64})/, chain: 'optimism' },
  // Avalanche
  { pattern: /^https?:\/\/(?:www\.)?snowtrace\.io\/tx\/(0x[a-fA-F0-9]{64})/, chain: 'avalanche' },
  // Fantom
  { pattern: /^https?:\/\/(?:www\.)?ftmscan\.com\/tx\/(0x[a-fA-F0-9]{64})/, chain: 'fantom' },
  // Solana (Solscan)
  { pattern: /^https?:\/\/(?:www\.)?solscan\.io\/tx\/([1-9A-HJ-NP-Za-km-z]{43,88})/, chain: 'solana' },
  // Solana (Explorer)
  { pattern: /^https?:\/\/(?:www\.)?explorer\.solana\.com\/tx\/([1-9A-HJ-NP-Za-km-z]{43,88})/, chain: 'solana' },
];

// EVM transaction hashes: 0x prefix + 64 hex characters
const EVM_TX_HASH_REGEX = /^0x[a-fA-F0-9]{64}$/;

// Solana signatures: Base58 encoded, 43-88 characters (length varies based on leading zeros)
// Base58 alphabet: 123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz
const SOLANA_BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{43,88}$/;

/**
 * Check if a string is a valid EVM transaction hash
 */
export function isEvmTxHash(hash: string): boolean {
  return EVM_TX_HASH_REGEX.test(hash);
}

/**
 * Check if a string is a valid Solana signature
 */
export function isSolanaSignature(signature: string): boolean {
  return SOLANA_BASE58_REGEX.test(signature);
}

/**
 * Detect the type of transaction hash/signature
 */
export function detectTxHashType(hash: string): TxHashType {
  if (isEvmTxHash(hash)) {
    return 'evm';
  }
  if (isSolanaSignature(hash)) {
    return 'solana';
  }
  return 'unknown';
}

/**
 * Truncate a hash for display (e.g., 0x1234...abcd or 5VERv8...xyz123)
 * Handles both EVM hashes (0x prefix) and Solana signatures (no prefix)
 */
export function truncateHash(hash: string, chars = 6): string {
  if (hash.length <= chars * 2 + 3) {
    return hash;
  }
  const prefixLen = hash.startsWith('0x') ? 2 : 0;
  return `${hash.slice(0, chars + prefixLen)}...${hash.slice(-chars)}`;
}

/**
 * Parse a transaction input which can be either:
 * - A raw transaction hash (EVM or Solana)
 * - A block explorer URL (etherscan, basescan, solscan, etc.)
 *
 * Returns the extracted hash and detected chain (if from URL)
 */
export function parseTxInput(input: string): ParsedTxInput {
  const trimmed = input.trim();

  // Check if it's a URL
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    for (const { pattern, chain } of EXPLORER_PATTERNS) {
      const match = trimmed.match(pattern);
      if (match?.[1]) {
        const hash = match[1];
        const type = chain === 'solana' ? 'solana' : 'evm';
        return { hash, chain, type };
      }
    }
    // URL didn't match any known pattern
    return { hash: trimmed, type: 'unknown' };
  }

  // It's a raw hash
  const type = detectTxHashType(trimmed);
  return { hash: trimmed, type };
}
