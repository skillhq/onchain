import type { AbstractConstructor, Mixin, OnchainClientBase } from '../onchain-client-base.js';
import type {
  MarketOverview,
  MarketResult,
  PriceResult,
  PricesResult,
  TokenPrice,
  TokenSearchItem,
  TokenSearchResult,
} from '../onchain-client-types.js';

const COINGECKO_API_BASE = 'https://api.coingecko.com/api/v3';
const COINGECKO_PRO_API_BASE = 'https://pro-api.coingecko.com/api/v3';

// Common token ID mappings (symbol -> coingecko id)
const TOKEN_ID_MAP: Record<string, string> = {
  btc: 'bitcoin',
  eth: 'ethereum',
  sol: 'solana',
  bnb: 'binancecoin',
  xrp: 'ripple',
  ada: 'cardano',
  doge: 'dogecoin',
  dot: 'polkadot',
  matic: 'matic-network',
  shib: 'shiba-inu',
  avax: 'avalanche-2',
  link: 'chainlink',
  atom: 'cosmos',
  uni: 'uniswap',
  ltc: 'litecoin',
  xlm: 'stellar',
  etc: 'ethereum-classic',
  near: 'near',
  apt: 'aptos',
  arb: 'arbitrum',
  op: 'optimism',
  sui: 'sui',
  inj: 'injective-protocol',
  sei: 'sei-network',
  tia: 'celestia',
  jup: 'jupiter-exchange-solana',
  wif: 'dogwifcoin',
  pepe: 'pepe',
  bonk: 'bonk',
  usdt: 'tether',
  usdc: 'usd-coin',
  dai: 'dai',
  busd: 'binance-usd',
  wbtc: 'wrapped-bitcoin',
  weth: 'weth',
  steth: 'staked-ether',
};

export interface CoinGeckoMethods {
  getTokenPrice(tokenIdOrSymbol: string): Promise<PriceResult>;
  getTokenPrices(tokenIdsOrSymbols: string[]): Promise<PricesResult>;
  getMarketOverview(): Promise<MarketResult>;
  getTrendingTokens(): Promise<PricesResult>;
  searchTokens(query: string, limit?: number): Promise<TokenSearchResult>;
}

interface CoinGeckoMarketData {
  id: string;
  symbol: string;
  name: string;
  image?: string;
  current_price?: number;
  market_cap?: number;
  market_cap_rank?: number;
  total_volume?: number;
  price_change_percentage_1h_in_currency?: number;
  price_change_percentage_24h?: number;
  price_change_percentage_7d_in_currency?: number;
  price_change_percentage_30d_in_currency?: number;
  circulating_supply?: number;
  total_supply?: number;
  max_supply?: number;
  ath?: number;
  ath_date?: string;
  ath_change_percentage?: number;
  atl?: number;
  atl_date?: string;
  atl_change_percentage?: number;
  last_updated?: string;
}

interface CoinGeckoGlobal {
  data: {
    total_market_cap: { usd: number };
    total_volume: { usd: number };
    market_cap_percentage: { btc: number; eth?: number };
    market_cap_change_percentage_24h_usd?: number;
  };
}

interface CoinGeckoTrending {
  coins: Array<{
    item: {
      id: string;
      symbol: string;
      name: string;
      market_cap_rank?: number;
      price_btc?: number;
      data?: {
        price_change_percentage_24h?: { usd?: number };
      };
    };
  }>;
}

export function withCoinGecko<TBase extends AbstractConstructor<OnchainClientBase>>(
  Base: TBase,
): Mixin<TBase, CoinGeckoMethods> {
  abstract class CoinGeckoMixin extends Base implements CoinGeckoMethods {
    private getApiBase(): string {
      return this.coingeckoApiKey ? COINGECKO_PRO_API_BASE : COINGECKO_API_BASE;
    }

    private getApiHeaders(): Record<string, string> {
      const headers: Record<string, string> = {
        Accept: 'application/json',
      };
      if (this.coingeckoApiKey) {
        headers['x-cg-pro-api-key'] = this.coingeckoApiKey;
      }
      return headers;
    }

    private resolveTokenId(tokenIdOrSymbol: string): string {
      const lower = tokenIdOrSymbol.toLowerCase();
      return TOKEN_ID_MAP[lower] ?? lower;
    }

    async getTokenPrice(tokenIdOrSymbol: string): Promise<PriceResult> {
      try {
        const tokenId = this.resolveTokenId(tokenIdOrSymbol);
        const url = `${this.getApiBase()}/coins/${tokenId}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false`;

        const response = await this.fetchWithTimeout(url, {
          headers: this.getApiHeaders(),
        });

        if (!response.ok) {
          if (response.status === 404) {
            return { success: false, error: `Token "${tokenIdOrSymbol}" not found` };
          }
          return { success: false, error: `CoinGecko API error: ${response.status}` };
        }

        const data = (await response.json()) as {
          id: string;
          symbol: string;
          name: string;
          image?: { large?: string };
          market_data?: {
            current_price?: { usd?: number };
            price_change_percentage_1h_in_currency?: { usd?: number };
            price_change_percentage_24h?: number;
            price_change_percentage_7d?: number;
            price_change_percentage_30d?: number;
            market_cap?: { usd?: number };
            market_cap_rank?: number;
            total_volume?: { usd?: number };
            circulating_supply?: number;
            total_supply?: number;
            max_supply?: number;
            ath?: { usd?: number };
            ath_date?: { usd?: string };
            ath_change_percentage?: { usd?: number };
            atl?: { usd?: number };
            atl_date?: { usd?: string };
            atl_change_percentage?: { usd?: number };
          };
          last_updated?: string;
        };

        const token: TokenPrice = {
          id: data.id,
          symbol: data.symbol.toUpperCase(),
          name: data.name,
          priceUsd: data.market_data?.current_price?.usd ?? 0,
          priceChange1h: data.market_data?.price_change_percentage_1h_in_currency?.usd,
          priceChange24h: data.market_data?.price_change_percentage_24h,
          priceChange7d: data.market_data?.price_change_percentage_7d,
          priceChange30d: data.market_data?.price_change_percentage_30d,
          marketCap: data.market_data?.market_cap?.usd,
          marketCapRank: data.market_data?.market_cap_rank,
          volume24h: data.market_data?.total_volume?.usd,
          circulatingSupply: data.market_data?.circulating_supply,
          totalSupply: data.market_data?.total_supply,
          maxSupply: data.market_data?.max_supply,
          ath: data.market_data?.ath?.usd,
          athDate: data.market_data?.ath_date?.usd,
          athChangePercent: data.market_data?.ath_change_percentage?.usd,
          atl: data.market_data?.atl?.usd,
          atlDate: data.market_data?.atl_date?.usd,
          atlChangePercent: data.market_data?.atl_change_percentage?.usd,
          lastUpdated: data.last_updated,
          logoUrl: data.image?.large,
        };

        return { success: true, token };
      } catch (error) {
        return {
          success: false,
          error: `Failed to fetch token price: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    async getTokenPrices(tokenIdsOrSymbols: string[]): Promise<PricesResult> {
      try {
        const tokenIds = tokenIdsOrSymbols.map((t) => this.resolveTokenId(t));
        const url = `${this.getApiBase()}/coins/markets?vs_currency=usd&ids=${tokenIds.join(',')}&order=market_cap_desc&per_page=250&page=1&sparkline=false&price_change_percentage=1h,24h,7d,30d`;

        const response = await this.fetchWithTimeout(url, {
          headers: this.getApiHeaders(),
        });

        if (!response.ok) {
          return { success: false, error: `CoinGecko API error: ${response.status}` };
        }

        const data = (await response.json()) as CoinGeckoMarketData[];

        const tokens: TokenPrice[] = data.map((item) => ({
          id: item.id,
          symbol: item.symbol.toUpperCase(),
          name: item.name,
          priceUsd: item.current_price ?? 0,
          priceChange1h: item.price_change_percentage_1h_in_currency,
          priceChange24h: item.price_change_percentage_24h,
          priceChange7d: item.price_change_percentage_7d_in_currency,
          priceChange30d: item.price_change_percentage_30d_in_currency,
          marketCap: item.market_cap,
          marketCapRank: item.market_cap_rank,
          volume24h: item.total_volume,
          circulatingSupply: item.circulating_supply,
          totalSupply: item.total_supply,
          maxSupply: item.max_supply,
          ath: item.ath,
          athDate: item.ath_date,
          athChangePercent: item.ath_change_percentage,
          atl: item.atl,
          atlDate: item.atl_date,
          atlChangePercent: item.atl_change_percentage,
          lastUpdated: item.last_updated,
          logoUrl: item.image,
        }));

        return { success: true, tokens };
      } catch (error) {
        return {
          success: false,
          error: `Failed to fetch token prices: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    async getMarketOverview(): Promise<MarketResult> {
      try {
        const url = `${this.getApiBase()}/global`;

        const response = await this.fetchWithTimeout(url, {
          headers: this.getApiHeaders(),
        });

        if (!response.ok) {
          return { success: false, error: `CoinGecko API error: ${response.status}` };
        }

        const data = (await response.json()) as CoinGeckoGlobal;

        // Also get trending
        const trendingResult = await this.getTrendingTokens();
        const trending = trendingResult.success ? trendingResult.tokens.slice(0, 5) : undefined;

        const market: MarketOverview = {
          totalMarketCap: data.data.total_market_cap.usd,
          totalVolume24h: data.data.total_volume.usd,
          btcDominance: data.data.market_cap_percentage.btc,
          ethDominance: data.data.market_cap_percentage.eth,
          marketCapChange24h: data.data.market_cap_change_percentage_24h_usd,
          trending: trending?.map((t) => ({
            id: t.id,
            symbol: t.symbol,
            name: t.name,
            priceChange24h: t.priceChange24h,
            marketCapRank: t.marketCapRank,
          })),
        };

        return { success: true, market };
      } catch (error) {
        return {
          success: false,
          error: `Failed to fetch market overview: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    async getTrendingTokens(): Promise<PricesResult> {
      try {
        const url = `${this.getApiBase()}/search/trending`;

        const response = await this.fetchWithTimeout(url, {
          headers: this.getApiHeaders(),
        });

        if (!response.ok) {
          return { success: false, error: `CoinGecko API error: ${response.status}` };
        }

        const data = (await response.json()) as CoinGeckoTrending;

        const tokens: TokenPrice[] = data.coins.map((coin) => ({
          id: coin.item.id,
          symbol: coin.item.symbol.toUpperCase(),
          name: coin.item.name,
          priceUsd: 0, // Trending endpoint doesn't include USD price
          priceChange24h: coin.item.data?.price_change_percentage_24h?.usd,
          marketCapRank: coin.item.market_cap_rank,
        }));

        return { success: true, tokens };
      } catch (error) {
        return {
          success: false,
          error: `Failed to fetch trending tokens: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    async searchTokens(query: string, limit = 10): Promise<TokenSearchResult> {
      try {
        const url = `${this.getApiBase()}/search?query=${encodeURIComponent(query)}`;

        const response = await this.fetchWithTimeout(url, {
          headers: this.getApiHeaders(),
        });

        if (!response.ok) {
          return { success: false, error: `CoinGecko API error: ${response.status}` };
        }

        const data = (await response.json()) as {
          coins: Array<{
            id: string;
            symbol: string;
            name: string;
            market_cap_rank?: number;
            thumb?: string;
            large?: string;
          }>;
        };

        const tokens: TokenSearchItem[] = data.coins.slice(0, limit).map((coin) => ({
          id: coin.id,
          symbol: coin.symbol.toUpperCase(),
          name: coin.name,
          marketCapRank: coin.market_cap_rank,
          thumb: coin.thumb,
          large: coin.large,
        }));

        return { success: true, tokens };
      } catch (error) {
        return {
          success: false,
          error: `Failed to search tokens: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
  }

  return CoinGeckoMixin;
}
