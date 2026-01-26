import { describe, expect, it } from 'vitest';
import {
  detectTxHashType,
  isEvmTxHash,
  isSolanaSignature,
  parseTxInput,
  truncateHash,
} from '../src/lib/utils/tx-hash.js';

describe('isEvmTxHash', () => {
  it('returns true for valid EVM transaction hashes', () => {
    expect(isEvmTxHash('0xd757e7e4cdb424e22319cbf63bbcfcd4b26c93ebef31d1458ab7d5e986375f31')).toBe(true);
    expect(isEvmTxHash('0x0000000000000000000000000000000000000000000000000000000000000000')).toBe(true);
    expect(isEvmTxHash('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF')).toBe(true);
  });

  it('returns false for invalid EVM transaction hashes', () => {
    expect(isEvmTxHash('0x123')).toBe(false); // Too short
    expect(isEvmTxHash('d757e7e4cdb424e22319cbf63bbcfcd4b26c93ebef31d1458ab7d5e986375f31')).toBe(false); // Missing 0x
    expect(isEvmTxHash('0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG')).toBe(false); // Invalid hex
    expect(isEvmTxHash('')).toBe(false);
  });
});

describe('isSolanaSignature', () => {
  it('returns true for valid Solana signatures (87-88 chars)', () => {
    // 88 character signature
    expect(
      isSolanaSignature('5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW'),
    ).toBe(true);
    // 87 character signature
    expect(
      isSolanaSignature('4siLxDHq5zXgE7E9gxpVQxjKhVVPJ9VCDZ3EvMYpWHKgHvPMQsHZzCqXAQvjDLFnJznLiK8cCu8N8hMvTwTnvEw'),
    ).toBe(true);
  });

  it('returns true for shorter valid Solana signatures (43+ chars)', () => {
    // Shorter signatures are valid (leading zeros in base58 can shorten the result)
    expect(isSolanaSignature('1111111111111111111111111111111111111111111')).toBe(true); // 43 chars
    expect(isSolanaSignature('11111111111111111111111111111111111111111111111111')).toBe(true); // 50 chars
  });

  it('returns false for invalid Solana signatures', () => {
    expect(isSolanaSignature('0xd757e7e4cdb424e22319cbf63bbcfcd4b26c93ebef31d1458ab7d5e986375f31')).toBe(false); // EVM hash
    expect(isSolanaSignature('abc')).toBe(false); // Too short
    expect(isSolanaSignature('')).toBe(false);
    // Contains invalid base58 characters (0, O, I, l)
    expect(
      isSolanaSignature('0OIl11111111111111111111111111111111111111111111111111111111111111111111111111111111111111'),
    ).toBe(false);
  });
});

describe('detectTxHashType', () => {
  it('detects EVM transaction hashes', () => {
    expect(detectTxHashType('0xd757e7e4cdb424e22319cbf63bbcfcd4b26c93ebef31d1458ab7d5e986375f31')).toBe('evm');
  });

  it('detects Solana signatures', () => {
    expect(
      detectTxHashType('5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW'),
    ).toBe('solana');
  });

  it('returns unknown for invalid hashes', () => {
    expect(detectTxHashType('invalid')).toBe('unknown');
    expect(detectTxHashType('')).toBe('unknown');
    expect(detectTxHashType('0x123')).toBe('unknown');
  });
});

describe('truncateHash', () => {
  it('truncates EVM hashes correctly (preserving 0x prefix)', () => {
    expect(truncateHash('0xd757e7e4cdb424e22319cbf63bbcfcd4b26c93ebef31d1458ab7d5e986375f31')).toBe(
      '0xd757e7...375f31',
    );
  });

  it('truncates Solana signatures correctly (no prefix)', () => {
    expect(
      truncateHash('5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW'),
    ).toBe('5VERv8...SZkQUW');
  });

  it('respects custom char count', () => {
    expect(truncateHash('0xd757e7e4cdb424e22319cbf63bbcfcd4b26c93ebef31d1458ab7d5e986375f31', 4)).toBe('0xd757...5f31');
  });

  it('returns short strings unchanged', () => {
    expect(truncateHash('0x1234', 6)).toBe('0x1234');
    expect(truncateHash('short', 6)).toBe('short');
  });
});

describe('parseTxInput', () => {
  describe('raw hashes', () => {
    it('parses EVM transaction hash', () => {
      const result = parseTxInput('0xd757e7e4cdb424e22319cbf63bbcfcd4b26c93ebef31d1458ab7d5e986375f31');
      expect(result.type).toBe('evm');
      expect(result.hash).toBe('0xd757e7e4cdb424e22319cbf63bbcfcd4b26c93ebef31d1458ab7d5e986375f31');
      expect(result.chain).toBeUndefined();
    });

    it('parses Solana signature', () => {
      const result = parseTxInput(
        '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW',
      );
      expect(result.type).toBe('solana');
      expect(result.hash).toBe(
        '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW',
      );
      expect(result.chain).toBeUndefined();
    });

    it('returns unknown for invalid input', () => {
      const result = parseTxInput('invalid');
      expect(result.type).toBe('unknown');
    });

    it('trims whitespace', () => {
      const result = parseTxInput('  0xd757e7e4cdb424e22319cbf63bbcfcd4b26c93ebef31d1458ab7d5e986375f31  ');
      expect(result.type).toBe('evm');
      expect(result.hash).toBe('0xd757e7e4cdb424e22319cbf63bbcfcd4b26c93ebef31d1458ab7d5e986375f31');
    });
  });

  describe('explorer URLs', () => {
    it('parses Etherscan URL', () => {
      const result = parseTxInput(
        'https://etherscan.io/tx/0xd757e7e4cdb424e22319cbf63bbcfcd4b26c93ebef31d1458ab7d5e986375f31',
      );
      expect(result.type).toBe('evm');
      expect(result.hash).toBe('0xd757e7e4cdb424e22319cbf63bbcfcd4b26c93ebef31d1458ab7d5e986375f31');
      expect(result.chain).toBe('ethereum');
    });

    it('parses Basescan URL', () => {
      const result = parseTxInput(
        'https://basescan.org/tx/0xd757e7e4cdb424e22319cbf63bbcfcd4b26c93ebef31d1458ab7d5e986375f31',
      );
      expect(result.type).toBe('evm');
      expect(result.hash).toBe('0xd757e7e4cdb424e22319cbf63bbcfcd4b26c93ebef31d1458ab7d5e986375f31');
      expect(result.chain).toBe('base');
    });

    it('parses Polygonscan URL', () => {
      const result = parseTxInput(
        'https://polygonscan.com/tx/0xd757e7e4cdb424e22319cbf63bbcfcd4b26c93ebef31d1458ab7d5e986375f31',
      );
      expect(result.type).toBe('evm');
      expect(result.hash).toBe('0xd757e7e4cdb424e22319cbf63bbcfcd4b26c93ebef31d1458ab7d5e986375f31');
      expect(result.chain).toBe('polygon');
    });

    it('parses Arbiscan URL', () => {
      const result = parseTxInput(
        'https://arbiscan.io/tx/0xd757e7e4cdb424e22319cbf63bbcfcd4b26c93ebef31d1458ab7d5e986375f31',
      );
      expect(result.type).toBe('evm');
      expect(result.hash).toBe('0xd757e7e4cdb424e22319cbf63bbcfcd4b26c93ebef31d1458ab7d5e986375f31');
      expect(result.chain).toBe('arbitrum');
    });

    it('parses Optimism Etherscan URL', () => {
      const result = parseTxInput(
        'https://optimistic.etherscan.io/tx/0xd757e7e4cdb424e22319cbf63bbcfcd4b26c93ebef31d1458ab7d5e986375f31',
      );
      expect(result.type).toBe('evm');
      expect(result.hash).toBe('0xd757e7e4cdb424e22319cbf63bbcfcd4b26c93ebef31d1458ab7d5e986375f31');
      expect(result.chain).toBe('optimism');
    });

    it('parses BSCscan URL', () => {
      const result = parseTxInput(
        'https://bscscan.com/tx/0xd757e7e4cdb424e22319cbf63bbcfcd4b26c93ebef31d1458ab7d5e986375f31',
      );
      expect(result.type).toBe('evm');
      expect(result.hash).toBe('0xd757e7e4cdb424e22319cbf63bbcfcd4b26c93ebef31d1458ab7d5e986375f31');
      expect(result.chain).toBe('bsc');
    });

    it('parses Snowtrace (Avalanche) URL', () => {
      const result = parseTxInput(
        'https://snowtrace.io/tx/0xd757e7e4cdb424e22319cbf63bbcfcd4b26c93ebef31d1458ab7d5e986375f31',
      );
      expect(result.type).toBe('evm');
      expect(result.hash).toBe('0xd757e7e4cdb424e22319cbf63bbcfcd4b26c93ebef31d1458ab7d5e986375f31');
      expect(result.chain).toBe('avalanche');
    });

    it('parses FTMscan (Fantom) URL', () => {
      const result = parseTxInput(
        'https://ftmscan.com/tx/0xd757e7e4cdb424e22319cbf63bbcfcd4b26c93ebef31d1458ab7d5e986375f31',
      );
      expect(result.type).toBe('evm');
      expect(result.hash).toBe('0xd757e7e4cdb424e22319cbf63bbcfcd4b26c93ebef31d1458ab7d5e986375f31');
      expect(result.chain).toBe('fantom');
    });

    it('parses Solscan URL', () => {
      const result = parseTxInput(
        'https://solscan.io/tx/5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW',
      );
      expect(result.type).toBe('solana');
      expect(result.hash).toBe(
        '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW',
      );
      expect(result.chain).toBe('solana');
    });

    it('parses Solana Explorer URL', () => {
      const result = parseTxInput(
        'https://explorer.solana.com/tx/5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW',
      );
      expect(result.type).toBe('solana');
      expect(result.hash).toBe(
        '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW',
      );
      expect(result.chain).toBe('solana');
    });

    it('handles www prefix', () => {
      const result = parseTxInput(
        'https://www.etherscan.io/tx/0xd757e7e4cdb424e22319cbf63bbcfcd4b26c93ebef31d1458ab7d5e986375f31',
      );
      expect(result.type).toBe('evm');
      expect(result.chain).toBe('ethereum');
    });

    it('handles http (non-https) URLs', () => {
      const result = parseTxInput(
        'http://etherscan.io/tx/0xd757e7e4cdb424e22319cbf63bbcfcd4b26c93ebef31d1458ab7d5e986375f31',
      );
      expect(result.type).toBe('evm');
      expect(result.chain).toBe('ethereum');
    });

    it('returns unknown for unrecognized URLs', () => {
      const result = parseTxInput('https://unknown-explorer.com/tx/0x1234');
      expect(result.type).toBe('unknown');
    });
  });
});
