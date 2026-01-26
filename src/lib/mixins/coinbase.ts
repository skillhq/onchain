import { createPrivateKey, createSign, randomBytes } from 'node:crypto';
import type { AbstractConstructor, Mixin, OnchainClientBase } from '../onchain-client-base.js';
import type { CexBalance, CexBalanceResult, CexHistoryResult, CexTrade } from '../onchain-client-types.js';

const COINBASE_API_BASE = 'https://api.coinbase.com';

export interface CoinbaseMethods {
  getCoinbaseBalances(): Promise<CexBalanceResult>;
  getCoinbaseHistory(options?: { limit?: number; cursor?: string }): Promise<CexHistoryResult>;
}

interface CoinbaseAccount {
  id: string;
  name: string;
  primary: boolean;
  type: string;
  currency: {
    code: string;
    name: string;
    color?: string;
    sort_index?: number;
    exponent?: number;
    type: string;
    address_regex?: string;
    asset_id?: string;
    slug?: string;
  };
  balance: {
    amount: string;
    currency: string;
  };
  created_at: string;
  updated_at: string;
  resource: string;
  resource_path: string;
  allow_deposits?: boolean;
  allow_withdrawals?: boolean;
}

interface CoinbaseTransaction {
  id: string;
  type: string;
  status: string;
  amount: {
    amount: string;
    currency: string;
  };
  native_amount: {
    amount: string;
    currency: string;
  };
  description?: string;
  created_at: string;
  updated_at: string;
  resource: string;
  resource_path: string;
  instant_exchange?: boolean;
  network?: {
    status: string;
    status_description?: string;
    hash?: string;
    transaction_url?: string;
    transaction_fee?: {
      amount: string;
      currency: string;
    };
    transaction_amount?: {
      amount: string;
      currency: string;
    };
    confirmations?: number;
  };
  to?: {
    resource: string;
    address?: string;
    currency?: string;
    address_info?: {
      address: string;
    };
  };
  from?: {
    resource: string;
    address?: string;
    currency?: string;
  };
  details?: {
    title?: string;
    subtitle?: string;
    header?: string;
    health?: string;
  };
  hide_native_amount?: boolean;
}

/**
 * Base64url encode a buffer or string
 */
function base64urlEncode(data: Buffer | string): string {
  const buffer = typeof data === 'string' ? Buffer.from(data) : data;
  return buffer.toString('base64url');
}

/**
 * Normalize a PEM key string by converting escaped newlines to actual newlines
 */
function normalizePem(pem: string): string {
  // Replace literal \n with actual newlines
  return pem.replace(/\\n/g, '\n');
}

/**
 * Generate a JWT for Coinbase CDP API authentication (ES256)
 * See: https://docs.cdp.coinbase.com/coinbase-app/docs/api-key-authentication
 */
function generateCoinbaseJwt(
  keyName: string,
  privateKeyPem: string,
  method: string,
  host: string,
  path: string,
): string {
  const now = Math.floor(Date.now() / 1000);
  const nonce = randomBytes(16).toString('hex');

  // JWT Header
  const header = {
    alg: 'ES256',
    kid: keyName,
    nonce,
    typ: 'JWT',
  };

  // JWT Payload
  const payload = {
    iss: 'cdp',
    nbf: now,
    exp: now + 120, // 2 minutes expiry
    sub: keyName,
    uri: `${method} ${host}${path}`,
  };

  // Encode header and payload
  const encodedHeader = base64urlEncode(JSON.stringify(header));
  const encodedPayload = base64urlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  // Normalize PEM (convert escaped \n to actual newlines)
  const normalizedPem = normalizePem(privateKeyPem);

  // Sign with ES256 (ECDSA with P-256 / secp256r1)
  const privateKey = createPrivateKey({
    key: normalizedPem,
    format: 'pem',
  });

  const sign = createSign('SHA256');
  sign.update(signingInput);
  const derSignature = sign.sign(privateKey);

  // Convert DER signature to raw R||S format (64 bytes)
  // DER format: 0x30 [total-length] 0x02 [r-length] [r] 0x02 [s-length] [s]
  const rLength = derSignature[3];
  const rStart = 4;
  let r = derSignature.subarray(rStart, rStart + rLength);

  const sLength = derSignature[rStart + rLength + 1];
  const sStart = rStart + rLength + 2;
  let s = derSignature.subarray(sStart, sStart + sLength);

  // Remove leading zeros if present (DER uses signed integers)
  if (r.length === 33 && r[0] === 0) {
    r = r.subarray(1);
  }
  if (s.length === 33 && s[0] === 0) {
    s = s.subarray(1);
  }

  // Pad to 32 bytes if needed
  if (r.length < 32) {
    r = Buffer.concat([Buffer.alloc(32 - r.length), r]);
  }
  if (s.length < 32) {
    s = Buffer.concat([Buffer.alloc(32 - s.length), s]);
  }

  const rawSignature = Buffer.concat([r, s]);
  const encodedSignature = base64urlEncode(rawSignature);

  return `${signingInput}.${encodedSignature}`;
}

export function withCoinbase<TBase extends AbstractConstructor<OnchainClientBase>>(
  Base: TBase,
): Mixin<TBase, CoinbaseMethods> {
  abstract class CoinbaseMixin extends Base implements CoinbaseMethods {
    private getCoinbaseHeaders(method: string, path: string): Record<string, string> {
      if (!this.coinbaseApiKeyId || !this.coinbaseApiKeySecret) {
        throw new Error('Coinbase CDP API credentials required');
      }

      const jwt = generateCoinbaseJwt(
        this.coinbaseApiKeyId,
        this.coinbaseApiKeySecret,
        method,
        'api.coinbase.com',
        path,
      );

      return {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      };
    }

    async getCoinbaseBalances(): Promise<CexBalanceResult> {
      if (!this.coinbaseApiKeyId || !this.coinbaseApiKeySecret) {
        return { success: false, error: 'Coinbase CDP API credentials not configured' };
      }

      try {
        // Use the v2 Coinbase App API for consumer wallet balances
        const path = '/v2/accounts';
        const url = `${COINBASE_API_BASE}${path}?limit=300`;

        const response = await this.fetchWithTimeout(url, {
          headers: this.getCoinbaseHeaders('GET', path),
        });

        if (!response.ok) {
          const errorText = await response.text();
          return { success: false, error: `Coinbase API error: ${response.status} - ${errorText}` };
        }

        const data = (await response.json()) as {
          data: CoinbaseAccount[];
          pagination?: {
            ending_before?: string;
            starting_after?: string;
            limit?: number;
            order?: string;
            previous_uri?: string;
            next_uri?: string;
          };
        };

        let totalValueUsd = 0;
        const balances: CexBalance[] = [];

        // We need to get prices to calculate USD values for crypto
        const cryptoAssets = new Set<string>();
        for (const account of data.data) {
          const total = Number.parseFloat(account.balance.amount);
          if (total > 0 && account.currency.type === 'crypto') {
            cryptoAssets.add(account.currency.code);
          }
        }

        // Fetch spot prices for crypto assets
        const prices = new Map<string, number>();
        for (const asset of cryptoAssets) {
          try {
            const pricePath = `/v2/prices/${asset}-USD/spot`;
            const priceResponse = await this.fetchWithTimeout(`${COINBASE_API_BASE}${pricePath}`, {
              headers: this.getCoinbaseHeaders('GET', pricePath),
            });
            if (priceResponse.ok) {
              const priceData = (await priceResponse.json()) as {
                data: { base: string; currency: string; amount: string };
              };
              prices.set(asset, Number.parseFloat(priceData.data.amount));
            }
          } catch {
            // Skip assets without prices
          }
        }

        for (const account of data.data) {
          const total = Number.parseFloat(account.balance.amount);

          if (total <= 0) {
            continue;
          }

          let valueUsd: number | undefined;

          if (account.currency.type === 'fiat' && account.currency.code === 'USD') {
            // USD fiat account
            valueUsd = total;
          } else if (account.currency.type === 'fiat') {
            // Other fiat - we'd need exchange rates, skip USD value for now
            valueUsd = undefined;
          } else {
            // Crypto - use fetched price
            const price = prices.get(account.currency.code);
            valueUsd = price ? total * price : undefined;
          }

          if (valueUsd !== undefined) {
            totalValueUsd += valueUsd;
          }

          balances.push({
            exchange: 'coinbase',
            asset: account.currency.code,
            free: total, // Coinbase v2 API doesn't separate free/locked
            locked: 0,
            total,
            valueUsd,
          });
        }

        // Sort by value descending
        balances.sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0));

        return { success: true, balances, totalValueUsd };
      } catch (error) {
        return {
          success: false,
          error: `Failed to fetch Coinbase balances: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    async getCoinbaseHistory(options?: { limit?: number; cursor?: string }): Promise<CexHistoryResult> {
      if (!this.coinbaseApiKeyId || !this.coinbaseApiKeySecret) {
        return { success: false, error: 'Coinbase CDP API credentials not configured' };
      }

      try {
        // First get accounts to fetch transactions from each
        const accountsPath = '/v2/accounts';
        const accountsResponse = await this.fetchWithTimeout(`${COINBASE_API_BASE}${accountsPath}?limit=300`, {
          headers: this.getCoinbaseHeaders('GET', accountsPath),
        });

        if (!accountsResponse.ok) {
          return { success: false, error: `Coinbase API error: ${accountsResponse.status}` };
        }

        const accountsData = (await accountsResponse.json()) as { data: CoinbaseAccount[] };

        const trades: CexTrade[] = [];
        const limit = options?.limit ?? 20;

        // Get transactions from accounts with balance or that are crypto type
        for (const account of accountsData.data) {
          const hasBalance = Number.parseFloat(account.balance.amount) > 0;
          const isCrypto = account.currency.type === 'crypto';

          if (!hasBalance && !isCrypto) {
            continue;
          }

          const txPath = `/v2/accounts/${account.id}/transactions`;
          let txUrl = `${COINBASE_API_BASE}${txPath}?limit=${Math.min(limit, 25)}`;

          if (options?.cursor) {
            txUrl += `&starting_after=${options.cursor}`;
          }

          try {
            const txResponse = await this.fetchWithTimeout(txUrl, {
              headers: this.getCoinbaseHeaders('GET', txPath),
            });

            if (!txResponse.ok) {
              continue;
            }

            const txData = (await txResponse.json()) as {
              data: CoinbaseTransaction[];
              pagination?: {
                next_uri?: string;
                starting_after?: string;
              };
            };

            for (const tx of txData.data) {
              // Include buy, sell, trade, send, and receive transactions
              const validTypes = ['buy', 'sell', 'trade', 'send', 'receive', 'fiat_deposit', 'fiat_withdrawal'];
              if (!validTypes.includes(tx.type)) {
                continue;
              }

              const amount = Math.abs(Number.parseFloat(tx.amount.amount));
              const nativeAmount = Math.abs(Number.parseFloat(tx.native_amount.amount));
              const price = amount > 0 ? nativeAmount / amount : 0;

              // Determine side based on transaction type and amount sign
              let side: 'buy' | 'sell';
              if (tx.type === 'sell' || tx.type === 'send' || tx.type === 'fiat_withdrawal') {
                side = 'sell';
              } else if (tx.type === 'buy' || tx.type === 'receive' || tx.type === 'fiat_deposit') {
                side = 'buy';
              } else {
                // For 'trade' type, check amount sign
                side = Number.parseFloat(tx.amount.amount) < 0 ? 'sell' : 'buy';
              }

              trades.push({
                exchange: 'coinbase',
                id: tx.id,
                symbol: `${tx.amount.currency}/${tx.native_amount.currency}`,
                side,
                price,
                quantity: amount,
                total: nativeAmount,
                timestamp: new Date(tx.created_at).getTime() / 1000,
              });
            }
          } catch {
            // Continue to next account on error
          }
        }

        // Sort by timestamp descending
        trades.sort((a, b) => b.timestamp - a.timestamp);

        // Limit results
        const limitedTrades = trades.slice(0, limit);
        const nextCursor = limitedTrades.length === limit ? limitedTrades[limitedTrades.length - 1]?.id : undefined;

        return { success: true, trades: limitedTrades, nextCursor };
      } catch (error) {
        return {
          success: false,
          error: `Failed to fetch Coinbase history: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
  }

  return CoinbaseMixin;
}
