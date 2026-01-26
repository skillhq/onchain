import type { AbstractConstructor, Mixin, OnchainClientBase } from '../onchain-client-base.js';
import type { PolymarketDetailResult, PolymarketMarket, PolymarketResult } from '../onchain-client-types.js';

const POLYMARKET_API_BASE = 'https://gamma-api.polymarket.com';
const POLYMARKET_CLOB_API = 'https://clob.polymarket.com';

export interface PolymarketMethods {
  getPolymarketTrending(options?: { limit?: number }): Promise<PolymarketResult>;
  getPolymarketMarket(marketIdOrSlug: string): Promise<PolymarketDetailResult>;
  searchPolymarkets(query: string, options?: { limit?: number }): Promise<PolymarketResult>;
}

interface PolymarketEvent {
  id: string;
  slug: string;
  title: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  markets?: Array<{
    id: string;
    question: string;
    description?: string;
    outcomes?: string | string[]; // Can be JSON string or array
    outcomePrices?: string | string[]; // Can be JSON string or array
    volume?: string;
    liquidity?: string;
    endDate?: string;
    clobTokenIds?: string[];
  }>;
  volume?: string;
  liquidity?: string;
  category?: string;
}

function parseOutcomes(outcomes: string | string[] | undefined): string[] {
  if (!outcomes) {
    return ['Yes', 'No'];
  }
  if (Array.isArray(outcomes)) {
    return outcomes;
  }
  try {
    return JSON.parse(outcomes) as string[];
  } catch {
    return ['Yes', 'No'];
  }
}

function parseOutcomePrices(prices: string | string[] | undefined): number[] {
  if (!prices) {
    return [0.5, 0.5];
  }
  if (Array.isArray(prices)) {
    return prices.map((p) => Number.parseFloat(p));
  }
  try {
    const parsed = JSON.parse(prices) as string[];
    return parsed.map((p) => Number.parseFloat(p));
  } catch {
    return [0.5, 0.5];
  }
}

interface ClobMarketData {
  condition_id: string;
  question: string;
  description?: string;
  end_date_iso?: string;
  tokens: Array<{
    token_id: string;
    outcome: string;
    price: number;
  }>;
}

export function withPolymarket<TBase extends AbstractConstructor<OnchainClientBase>>(
  Base: TBase,
): Mixin<TBase, PolymarketMethods> {
  abstract class PolymarketMixin extends Base implements PolymarketMethods {
    async getPolymarketTrending(options?: { limit?: number }): Promise<PolymarketResult> {
      try {
        const limit = options?.limit ?? 10;
        const url = `${POLYMARKET_API_BASE}/events?active=true&closed=false&limit=${limit}&order=volume&ascending=false`;

        const response = await this.fetchWithTimeout(url, {
          headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
          return { success: false, error: `Polymarket API error: ${response.status}` };
        }

        const data = (await response.json()) as PolymarketEvent[];

        const markets: PolymarketMarket[] = [];

        for (const event of data) {
          const eventMarkets = event.markets ?? [];
          for (const market of eventMarkets) {
            const outcomes = parseOutcomes(market.outcomes);
            const outcomePrices = parseOutcomePrices(market.outcomePrices);

            markets.push({
              id: market.id,
              question: market.question || event.title,
              description: market.description || event.description,
              endDate: market.endDate || event.endDate,
              volume: Number.parseFloat(market.volume ?? event.volume ?? '0'),
              liquidity: Number.parseFloat(market.liquidity ?? event.liquidity ?? '0'),
              outcomes: outcomes.map((outcome, i) => ({
                name: outcome,
                price: outcomePrices[i] ?? 0.5,
              })),
              category: event.category,
              slug: event.slug,
            });
          }
        }

        return { success: true, markets: markets.slice(0, limit) };
      } catch (error) {
        return {
          success: false,
          error: `Failed to fetch trending markets: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    async getPolymarketMarket(marketIdOrSlug: string): Promise<PolymarketDetailResult> {
      try {
        // Try fetching as event slug first
        let url = `${POLYMARKET_API_BASE}/events?slug=${encodeURIComponent(marketIdOrSlug)}`;

        let response = await this.fetchWithTimeout(url, {
          headers: { Accept: 'application/json' },
        });

        if (response.ok) {
          const data = (await response.json()) as PolymarketEvent[];

          if (data.length > 0 && (data[0].markets ?? []).length > 0) {
            const event = data[0];
            const market = (event.markets ?? [])[0];
            const outcomes = parseOutcomes(market.outcomes);
            const outcomePrices = parseOutcomePrices(market.outcomePrices);

            return {
              success: true,
              market: {
                id: market.id,
                question: market.question || event.title,
                description: market.description || event.description,
                endDate: market.endDate || event.endDate,
                volume: Number.parseFloat(market.volume ?? event.volume ?? '0'),
                liquidity: Number.parseFloat(market.liquidity ?? event.liquidity ?? '0'),
                outcomes: outcomes.map((outcome, i) => ({
                  name: outcome,
                  price: outcomePrices[i] ?? 0.5,
                })),
                category: event.category,
                slug: event.slug,
              },
            };
          }
        }

        // Try fetching from CLOB API by condition ID
        url = `${POLYMARKET_CLOB_API}/markets/${marketIdOrSlug}`;
        response = await this.fetchWithTimeout(url, {
          headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
          return { success: false, error: `Market "${marketIdOrSlug}" not found` };
        }

        const clobData = (await response.json()) as ClobMarketData;

        return {
          success: true,
          market: {
            id: clobData.condition_id,
            question: clobData.question,
            description: clobData.description,
            endDate: clobData.end_date_iso,
            volume: 0,
            liquidity: 0,
            outcomes: clobData.tokens.map((token) => ({
              name: token.outcome,
              price: token.price,
            })),
          },
        };
      } catch (error) {
        return {
          success: false,
          error: `Failed to fetch market: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    async searchPolymarkets(query: string, options?: { limit?: number }): Promise<PolymarketResult> {
      try {
        const limit = options?.limit ?? 10;
        const url = `${POLYMARKET_API_BASE}/events?title_contains=${encodeURIComponent(query)}&active=true&closed=false&limit=${limit}`;

        const response = await this.fetchWithTimeout(url, {
          headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
          return { success: false, error: `Polymarket API error: ${response.status}` };
        }

        const data = (await response.json()) as PolymarketEvent[];

        const markets: PolymarketMarket[] = [];

        for (const event of data) {
          const eventMarkets = event.markets ?? [];
          for (const market of eventMarkets) {
            const outcomes = parseOutcomes(market.outcomes);
            const outcomePrices = parseOutcomePrices(market.outcomePrices);

            markets.push({
              id: market.id,
              question: market.question || event.title,
              description: market.description || event.description,
              endDate: market.endDate || event.endDate,
              volume: Number.parseFloat(market.volume ?? event.volume ?? '0'),
              liquidity: Number.parseFloat(market.liquidity ?? event.liquidity ?? '0'),
              outcomes: outcomes.map((outcome, i) => ({
                name: outcome,
                price: outcomePrices[i] ?? 0.5,
              })),
              category: event.category,
              slug: event.slug,
            });
          }
        }

        return { success: true, markets: markets.slice(0, limit) };
      } catch (error) {
        return {
          success: false,
          error: `Failed to search markets: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
  }

  return PolymarketMixin;
}
