import { describe, expect, it } from 'vitest';
import { isNotConfiguredError, isRateLimitedError } from '../src/lib/utils/fallback.js';

describe('isRateLimitedError', () => {
  it('detects 429 status code', () => {
    expect(isRateLimitedError('CoinGecko API error: 429')).toBe(true);
  });

  it('detects "rate limit" phrase', () => {
    expect(isRateLimitedError('You have hit the rate limit')).toBe(true);
    expect(isRateLimitedError('rate-limit exceeded')).toBe(true);
  });

  it('detects "too many requests"', () => {
    expect(isRateLimitedError('Error: Too Many Requests')).toBe(true);
    expect(isRateLimitedError('too-many-requests')).toBe(true);
  });

  it('does not match unrelated errors', () => {
    expect(isRateLimitedError('Network timeout')).toBe(false);
    expect(isRateLimitedError('Token "foo" not found')).toBe(false);
    expect(isRateLimitedError('CoinGecko API error: 500')).toBe(false);
    expect(isRateLimitedError('')).toBe(false);
  });

  it('does not match 429 as a substring of a larger number', () => {
    // This is intentional: our regex uses \b429\b, so "4299" should not match.
    expect(isRateLimitedError('Error code: 4299')).toBe(false);
  });
});

describe('isNotConfiguredError', () => {
  it('detects "not configured"', () => {
    expect(isNotConfiguredError('CoinMarketCap API key not configured')).toBe(true);
  });

  it('detects "api key required"', () => {
    expect(isNotConfiguredError('CoinMarketCap API key required')).toBe(true);
  });

  it('does not match unrelated errors', () => {
    expect(isNotConfiguredError('Network timeout')).toBe(false);
    expect(isNotConfiguredError('429 rate limit')).toBe(false);
  });
});
