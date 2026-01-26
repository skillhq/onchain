import { describe, expect, it } from 'vitest';
import {
  detectChainType,
  isEvmAddress,
  isSolanaAddress,
  normalizeEvmAddress,
  truncateAddress,
  validateAddress,
} from '../src/lib/utils/address.js';

describe('isEvmAddress', () => {
  it('returns true for valid EVM addresses', () => {
    expect(isEvmAddress('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045')).toBe(true);
    expect(isEvmAddress('0x0000000000000000000000000000000000000000')).toBe(true);
    expect(isEvmAddress('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF')).toBe(true);
  });

  it('returns false for invalid EVM addresses', () => {
    expect(isEvmAddress('0x123')).toBe(false);
    expect(isEvmAddress('d8dA6BF26964aF9D7eEd9e03E53415D37aA96045')).toBe(false);
    expect(isEvmAddress('0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG')).toBe(false);
    expect(isEvmAddress('')).toBe(false);
  });
});

describe('isSolanaAddress', () => {
  it('returns true for valid Solana addresses', () => {
    expect(isSolanaAddress('86xCnPeV69n6t3DnyGvkKobf9FdN2H9oiVDdaMpo2MMY')).toBe(true);
    expect(isSolanaAddress('So11111111111111111111111111111111111111112')).toBe(true);
  });

  it('returns false for invalid Solana addresses', () => {
    expect(isSolanaAddress('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045')).toBe(false);
    expect(isSolanaAddress('abc')).toBe(false);
    expect(isSolanaAddress('')).toBe(false);
    // Contains invalid base58 characters (0, O, I, l)
    expect(isSolanaAddress('0OIl111111111111111111111111111111111111111')).toBe(false);
  });
});

describe('detectChainType', () => {
  it('detects EVM addresses', () => {
    expect(detectChainType('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045')).toBe('evm');
  });

  it('detects Solana addresses', () => {
    expect(detectChainType('86xCnPeV69n6t3DnyGvkKobf9FdN2H9oiVDdaMpo2MMY')).toBe('solana');
  });

  it('returns null for invalid addresses', () => {
    expect(detectChainType('invalid')).toBe(null);
    expect(detectChainType('')).toBe(null);
  });
});

describe('validateAddress', () => {
  it('validates EVM addresses for evm chain type', () => {
    expect(validateAddress('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', 'evm')).toBe(true);
    expect(validateAddress('86xCnPeV69n6t3DnyGvkKobf9FdN2H9oiVDdaMpo2MMY', 'evm')).toBe(false);
  });

  it('validates Solana addresses for solana chain type', () => {
    expect(validateAddress('86xCnPeV69n6t3DnyGvkKobf9FdN2H9oiVDdaMpo2MMY', 'solana')).toBe(true);
    expect(validateAddress('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', 'solana')).toBe(false);
  });
});

describe('normalizeEvmAddress', () => {
  it('lowercases valid EVM addresses', () => {
    expect(normalizeEvmAddress('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045')).toBe(
      '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
    );
  });

  it('returns invalid addresses unchanged', () => {
    expect(normalizeEvmAddress('not-an-address')).toBe('not-an-address');
  });
});

describe('truncateAddress', () => {
  it('truncates long addresses', () => {
    expect(truncateAddress('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045')).toBe('0xd8dA...6045');
  });

  it('respects custom prefix and suffix lengths', () => {
    expect(truncateAddress('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', 10, 6)).toBe('0xd8dA6BF2...A96045');
  });

  it('returns short addresses unchanged', () => {
    expect(truncateAddress('0x1234', 6, 4)).toBe('0x1234');
  });
});
