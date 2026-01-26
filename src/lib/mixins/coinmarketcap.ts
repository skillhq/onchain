import type { AbstractConstructor, Mixin, OnchainClientBase } from '../onchain-client-base.js';
import type { MarketOverview, MarketResult, PriceResult, PricesResult, TokenPrice } from '../onchain-client-types.js';

const CMC_API_BASE = 'https://pro-api.coinmarketcap.com/v1';

export interface CoinMarketCapMethods {
  cmcGetTokenPrice(symbolOrSlug: string): Promise<PriceResult>;
  cmcGetTokenPrices(symbols: string[]): Promise<PricesResult>;
  cmcGetMarketOverview(): Promise<MarketResult>;
}

interface CmcQuote {
  price: number;
  volume_24h: number;
  percent_change_1h: number;
  percent_change_24h: number;
  percent_change_7d: number;
  percent_change_30d: number;
  market_cap: number;
  last_updated: string;
}

interface CmcCoinData {
  id: number;
  name: string;
  symbol: string;
  slug: string;
  cmc_rank?: number;
  circulating_supply?: number;
  total_supply?: number;
  max_supply?: number;
  quote: {
    USD: CmcQuote;
  };
}

interface CmcQuoteResponse {
  status: { error_code: number; error_message?: string };
  data: Record<string, CmcCoinData>;
}

interface CmcGlobalMetricsResponse {
  status: { error_code: number; error_message?: string };
  data: {
    total_market_cap: number;
    total_volume_24h: number;
    btc_dominance: number;
    eth_dominance?: number;
    total_market_cap_yesterday_percentage_change?: number;
  };
}

export function withCoinMarketCap<TBase extends AbstractConstructor<OnchainClientBase>>(
  Base: TBase,
): Mixin<TBase, CoinMarketCapMethods> {
  abstract class CoinMarketCapMixin extends Base implements CoinMarketCapMethods {
    private getCmcHeaders(): Record<string, string> {
      if (!this.coinmarketcapApiKey) {
        throw new Error('CoinMarketCap API key required');
      }
      return {
        Accept: 'application/json',
        'X-CMC_PRO_API_KEY': this.coinmarketcapApiKey,
      };
    }

    async cmcGetTokenPrice(symbolOrSlug: string): Promise<PriceResult> {
      if (!this.coinmarketcapApiKey) {
        return { success: false, error: 'CoinMarketCap API key not configured' };
      }

      try {
        const symbol = symbolOrSlug.toUpperCase();
        const url = `${CMC_API_BASE}/cryptocurrency/quotes/latest?symbol=${symbol}&convert=USD`;

        const response = await this.fetchWithTimeout(url, {
          headers: this.getCmcHeaders(),
        });

        if (!response.ok) {
          return { success: false, error: `CoinMarketCap API error: ${response.status}` };
        }

        const data = (await response.json()) as CmcQuoteResponse;

        if (data.status.error_code !== 0) {
          return { success: false, error: data.status.error_message ?? 'Unknown error' };
        }

        const coinData = data.data[symbol];
        if (!coinData) {
          return { success: false, error: `Token "${symbolOrSlug}" not found` };
        }

        const quote = coinData.quote.USD;

        const token: TokenPrice = {
          id: coinData.slug,
          symbol: coinData.symbol,
          name: coinData.name,
          priceUsd: quote.price,
          priceChange1h: quote.percent_change_1h,
          priceChange24h: quote.percent_change_24h,
          priceChange7d: quote.percent_change_7d,
          priceChange30d: quote.percent_change_30d,
          marketCap: quote.market_cap,
          marketCapRank: coinData.cmc_rank,
          volume24h: quote.volume_24h,
          circulatingSupply: coinData.circulating_supply,
          totalSupply: coinData.total_supply,
          maxSupply: coinData.max_supply,
          lastUpdated: quote.last_updated,
        };

        return { success: true, token };
      } catch (error) {
        return {
          success: false,
          error: `Failed to fetch token price: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    async cmcGetTokenPrices(symbols: string[]): Promise<PricesResult> {
      if (!this.coinmarketcapApiKey) {
        return { success: false, error: 'CoinMarketCap API key not configured' };
      }

      try {
        const symbolList = symbols.map((s) => s.toUpperCase()).join(',');
        const url = `${CMC_API_BASE}/cryptocurrency/quotes/latest?symbol=${symbolList}&convert=USD`;

        const response = await this.fetchWithTimeout(url, {
          headers: this.getCmcHeaders(),
        });

        if (!response.ok) {
          return { success: false, error: `CoinMarketCap API error: ${response.status}` };
        }

        const data = (await response.json()) as CmcQuoteResponse;

        if (data.status.error_code !== 0) {
          return { success: false, error: data.status.error_message ?? 'Unknown error' };
        }

        const tokens: TokenPrice[] = Object.values(data.data).map((coinData) => {
          const quote = coinData.quote.USD;
          return {
            id: coinData.slug,
            symbol: coinData.symbol,
            name: coinData.name,
            priceUsd: quote.price,
            priceChange1h: quote.percent_change_1h,
            priceChange24h: quote.percent_change_24h,
            priceChange7d: quote.percent_change_7d,
            priceChange30d: quote.percent_change_30d,
            marketCap: quote.market_cap,
            marketCapRank: coinData.cmc_rank,
            volume24h: quote.volume_24h,
            circulatingSupply: coinData.circulating_supply,
            totalSupply: coinData.total_supply,
            maxSupply: coinData.max_supply,
            lastUpdated: quote.last_updated,
          };
        });

        return { success: true, tokens };
      } catch (error) {
        return {
          success: false,
          error: `Failed to fetch token prices: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    async cmcGetMarketOverview(): Promise<MarketResult> {
      if (!this.coinmarketcapApiKey) {
        return { success: false, error: 'CoinMarketCap API key not configured' };
      }

      try {
        const url = `${CMC_API_BASE}/global-metrics/quotes/latest?convert=USD`;

        const response = await this.fetchWithTimeout(url, {
          headers: this.getCmcHeaders(),
        });

        if (!response.ok) {
          return { success: false, error: `CoinMarketCap API error: ${response.status}` };
        }

        const data = (await response.json()) as CmcGlobalMetricsResponse;

        if (data.status.error_code !== 0) {
          return { success: false, error: data.status.error_message ?? 'Unknown error' };
        }

        const market: MarketOverview = {
          totalMarketCap: data.data.total_market_cap,
          totalVolume24h: data.data.total_volume_24h,
          btcDominance: data.data.btc_dominance,
          ethDominance: data.data.eth_dominance,
          marketCapChange24h: data.data.total_market_cap_yesterday_percentage_change,
        };

        return { success: true, market };
      } catch (error) {
        return {
          success: false,
          error: `Failed to fetch market overview: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
  }

  return CoinMarketCapMixin;
}
