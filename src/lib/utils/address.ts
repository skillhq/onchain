import type { ChainType } from '../onchain-client-types.js';

const EVM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Check if the address is a valid EVM address (0x prefixed, 40 hex chars)
 */
export function isEvmAddress(address: string): boolean {
  return EVM_ADDRESS_REGEX.test(address);
}

/**
 * Check if the address is a valid Solana address (base58, 32-44 chars)
 */
export function isSolanaAddress(address: string): boolean {
  // Exclude EVM addresses that might match the pattern
  if (address.startsWith('0x')) {
    return false;
  }
  return SOLANA_ADDRESS_REGEX.test(address);
}

/**
 * Detect the chain type based on address format
 */
export function detectChainType(address: string): ChainType | null {
  if (isEvmAddress(address)) {
    return 'evm';
  }
  if (isSolanaAddress(address)) {
    return 'solana';
  }
  return null;
}

/**
 * Validate an address for a specific chain type
 */
export function validateAddress(address: string, chainType: ChainType): boolean {
  if (chainType === 'evm') {
    return isEvmAddress(address);
  }
  if (chainType === 'solana') {
    return isSolanaAddress(address);
  }
  return false;
}

/**
 * Normalize EVM address to checksum format (lowercase for now)
 */
export function normalizeEvmAddress(address: string): string {
  if (!isEvmAddress(address)) {
    return address;
  }
  return address.toLowerCase();
}

/**
 * Truncate address for display (0x1234...5678)
 */
export function truncateAddress(address: string, prefixLen = 6, suffixLen = 4): string {
  if (address.length <= prefixLen + suffixLen + 3) {
    return address;
  }
  return `${address.slice(0, prefixLen)}...${address.slice(-suffixLen)}`;
}
