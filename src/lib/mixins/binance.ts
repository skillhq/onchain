import { createHmac } from 'node:crypto';
import type { AbstractConstructor, Mixin, OnchainClientBase } from '../onchain-client-base.js';
import type { CexBalance, CexBalanceResult, CexHistoryResult, CexTrade } from '../onchain-client-types.js';

const BINANCE_API_BASE = 'https://api.binance.com';

export interface BinanceMethods {
  getBinanceBalances(): Promise<CexBalanceResult>;
  getBinanceHistory(options?: { symbol?: string; limit?: number; cursor?: string }): Promise<CexHistoryResult>;
}

interface BinanceBalance {
  asset: string;
  free: string;
  locked: string;
}

interface BinanceAccountInfo {
  balances: BinanceBalance[];
}

interface BinanceTrade {
  symbol: string;
  id: number;
  orderId: number;
  orderListId: number;
  price: string;
  qty: string;
  quoteQty: string;
  commission: string;
  commissionAsset: string;
  time: number;
  isBuyer: boolean;
  isMaker: boolean;
  isBestMatch: boolean;
}

interface BinancePrice {
  symbol: string;
  price: string;
}

export function withBinance<TBase extends AbstractConstructor<OnchainClientBase>>(
  Base: TBase,
): Mixin<TBase, BinanceMethods> {
  abstract class BinanceMixin extends Base implements BinanceMethods {
    private generateBinanceSignature(queryString: string): string {
      if (!this.binanceApiSecret) {
        throw new Error('Binance API secret required');
      }

      const hmac = createHmac('sha256', this.binanceApiSecret);
      hmac.update(queryString);
      return hmac.digest('hex');
    }

    private getBinanceHeaders(): Record<string, string> {
      if (!this.binanceApiKey) {
        throw new Error('Binance API key required');
      }

      return {
        'X-MBX-APIKEY': this.binanceApiKey,
        'Content-Type': 'application/json',
      };
    }

    private async getBinancePrices(): Promise<Map<string, number>> {
      try {
        const response = await this.fetchWithTimeout(`${BINANCE_API_BASE}/api/v3/ticker/price`);

        if (!response.ok) {
          return new Map();
        }

        const data = (await response.json()) as BinancePrice[];
        const prices = new Map<string, number>();

        for (const item of data) {
          // Extract base asset from trading pair (e.g., BTCUSDT -> BTC)
          if (item.symbol.endsWith('USDT')) {
            const asset = item.symbol.replace('USDT', '');
            prices.set(asset, Number.parseFloat(item.price));
          }
        }

        // Add stablecoin prices
        prices.set('USDT', 1);
        prices.set('USDC', 1);
        prices.set('BUSD', 1);
        prices.set('DAI', 1);

        return prices;
      } catch {
        return new Map();
      }
    }

    async getBinanceBalances(): Promise<CexBalanceResult> {
      if (!this.binanceApiKey || !this.binanceApiSecret) {
        return { success: false, error: 'Binance API credentials not configured' };
      }

      try {
        const timestamp = Date.now();
        const queryString = `timestamp=${timestamp}`;
        const signature = this.generateBinanceSignature(queryString);
        const url = `${BINANCE_API_BASE}/api/v3/account?${queryString}&signature=${signature}`;

        const response = await this.fetchWithTimeout(url, {
          headers: this.getBinanceHeaders(),
        });

        if (!response.ok) {
          const errorText = await response.text();
          return { success: false, error: `Binance API error: ${response.status} - ${errorText}` };
        }

        const data = (await response.json()) as BinanceAccountInfo;

        // Get prices for valuation
        const prices = await this.getBinancePrices();

        let totalValueUsd = 0;
        const balances: CexBalance[] = [];

        for (const balance of data.balances) {
          const free = Number.parseFloat(balance.free);
          const locked = Number.parseFloat(balance.locked);
          const total = free + locked;

          if (total <= 0) {
            continue;
          }

          const price = prices.get(balance.asset);
          const valueUsd = price ? total * price : undefined;

          if (valueUsd) {
            totalValueUsd += valueUsd;
          }

          balances.push({
            exchange: 'binance',
            asset: balance.asset,
            free,
            locked,
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
          error: `Failed to fetch Binance balances: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    async getBinanceHistory(options?: { symbol?: string; limit?: number; cursor?: string }): Promise<CexHistoryResult> {
      if (!this.binanceApiKey || !this.binanceApiSecret) {
        return { success: false, error: 'Binance API credentials not configured' };
      }

      try {
        const limit = options?.limit ?? 50;
        const timestamp = Date.now();

        // If no symbol specified, get trades from common pairs
        const symbols = options?.symbol ? [options.symbol] : ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];

        const allTrades: CexTrade[] = [];

        for (const symbol of symbols) {
          let queryString = `symbol=${symbol}&limit=${limit}&timestamp=${timestamp}`;

          if (options?.cursor) {
            queryString += `&fromId=${options.cursor}`;
          }

          const signature = this.generateBinanceSignature(queryString);
          const url = `${BINANCE_API_BASE}/api/v3/myTrades?${queryString}&signature=${signature}`;

          try {
            const response = await this.fetchWithTimeout(url, {
              headers: this.getBinanceHeaders(),
            });

            if (!response.ok) {
              continue;
            }

            const data = (await response.json()) as BinanceTrade[];

            for (const trade of data) {
              const price = Number.parseFloat(trade.price);
              const quantity = Number.parseFloat(trade.qty);
              const total = Number.parseFloat(trade.quoteQty);
              const fee = Number.parseFloat(trade.commission);

              allTrades.push({
                exchange: 'binance',
                id: String(trade.id),
                symbol: trade.symbol,
                side: trade.isBuyer ? 'buy' : 'sell',
                price,
                quantity,
                total,
                fee,
                feeAsset: trade.commissionAsset,
                timestamp: trade.time / 1000,
                orderId: String(trade.orderId),
              });
            }
          } catch {
            // Continue to next symbol on error
          }
        }

        // Sort by timestamp descending
        allTrades.sort((a, b) => b.timestamp - a.timestamp);

        // Limit results
        const limitedTrades = allTrades.slice(0, limit);
        const nextCursor = limitedTrades.length === limit ? limitedTrades[limitedTrades.length - 1]?.id : undefined;

        return { success: true, trades: limitedTrades, nextCursor };
      } catch (error) {
        return {
          success: false,
          error: `Failed to fetch Binance history: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
  }

  return BinanceMixin;
}
