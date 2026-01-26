import type { OnchainClientOptions } from './onchain-client-types.js';

// biome-ignore lint/suspicious/noExplicitAny: TS mixin base constructor requirement.
export type Constructor<T = object> = new (...args: any[]) => T;
// biome-ignore lint/suspicious/noExplicitAny: TS mixin base constructor requirement.
export type AbstractConstructor<T = object> = abstract new (...args: any[]) => T;
export type Mixin<TBase extends AbstractConstructor<OnchainClientBase>, TAdded> = abstract new (
  ...args: ConstructorParameters<TBase>
) => OnchainClientBase & TAdded;

export abstract class OnchainClientBase {
  protected debankApiKey?: string;
  protected heliusApiKey?: string;
  protected coinbaseApiKeyId?: string;
  protected coinbaseApiKeySecret?: string;
  protected binanceApiKey?: string;
  protected binanceApiSecret?: string;
  protected coingeckoApiKey?: string;
  protected coinmarketcapApiKey?: string;
  protected timeoutMs?: number;

  constructor(options: OnchainClientOptions = {}) {
    this.debankApiKey = options.debankApiKey;
    this.heliusApiKey = options.heliusApiKey;
    this.coinbaseApiKeyId = options.coinbaseApiKeyId;
    this.coinbaseApiKeySecret = options.coinbaseApiKeySecret;
    this.binanceApiKey = options.binanceApiKey;
    this.binanceApiSecret = options.binanceApiSecret;
    this.coingeckoApiKey = options.coingeckoApiKey;
    this.coinmarketcapApiKey = options.coinmarketcapApiKey;
    this.timeoutMs = options.timeoutMs;
  }

  protected async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  protected async fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
    if (!this.timeoutMs || this.timeoutMs <= 0) {
      return fetch(url, init);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  protected getJsonHeaders(): Record<string, string> {
    return {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
  }
}
