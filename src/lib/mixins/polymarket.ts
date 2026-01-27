import type { AbstractConstructor, Mixin, OnchainClientBase } from '../onchain-client-base.js';
import type {
  PolymarketDetailResult,
  PolymarketFilterOptions,
  PolymarketMarket,
  PolymarketResult,
  PolymarketSentiment,
  PolymarketSentimentResult,
  PolymarketSentimentSignal,
  PolymarketTag,
  PolymarketTagsResult,
} from '../onchain-client-types.js';

const POLYMARKET_API_BASE = 'https://gamma-api.polymarket.com';
const POLYMARKET_CLOB_API = 'https://clob.polymarket.com';

export interface PolymarketMethods {
  getPolymarketTags(options?: { popular?: boolean }): Promise<PolymarketTagsResult>;
  getPolymarketTrending(options?: PolymarketFilterOptions): Promise<PolymarketResult>;
  getPolymarketMarket(marketIdOrSlug: string): Promise<PolymarketDetailResult>;
  searchPolymarkets(query: string, options?: PolymarketFilterOptions): Promise<PolymarketResult>;
  getPolymarketSentiment(topic: string, options?: { limit?: number }): Promise<PolymarketSentimentResult>;
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
  tags?: Array<{ id: string; slug: string; label: string }>;
}

interface PolymarketApiTag {
  id: string;
  slug: string;
  label: string;
  forceShow?: boolean;
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

function eventMatchesTags(
  event: PolymarketEvent,
  options?: { excludeTags?: string[]; includeTags?: string[] },
): boolean {
  if (!options) {
    return true;
  }

  const eventTags = (event.tags ?? []).map((t) => t.slug.toLowerCase());
  const categoryTag = event.category?.toLowerCase();
  const allEventTags = categoryTag ? [...eventTags, categoryTag] : eventTags;

  // Check excludes first
  if (options.excludeTags && options.excludeTags.length > 0) {
    const excludeLower = options.excludeTags.map((t) => t.toLowerCase());
    for (const tag of allEventTags) {
      if (excludeLower.includes(tag)) {
        return false;
      }
    }
  }

  // Check includes (if specified, event must match at least one)
  if (options.includeTags && options.includeTags.length > 0) {
    const includeLower = options.includeTags.map((t) => t.toLowerCase());
    let hasMatch = false;
    for (const tag of allEventTags) {
      if (includeLower.includes(tag)) {
        hasMatch = true;
        break;
      }
    }
    if (!hasMatch) {
      return false;
    }
  }

  return true;
}

export function withPolymarket<TBase extends AbstractConstructor<OnchainClientBase>>(
  Base: TBase,
): Mixin<TBase, PolymarketMethods> {
  abstract class PolymarketMixin extends Base implements PolymarketMethods {
    async getPolymarketTags(options?: { popular?: boolean }): Promise<PolymarketTagsResult> {
      try {
        const url = `${POLYMARKET_API_BASE}/tags`;
        const response = await this.fetchWithTimeout(url, {
          headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
          return { success: false, error: `Polymarket API error: ${response.status}` };
        }

        const data = (await response.json()) as PolymarketApiTag[];

        // If popular, we need to count events per tag
        if (options?.popular) {
          const tagCounts: Map<string, { tag: PolymarketTag; count: number }> = new Map();

          // Initialize all tags with 0 count
          for (const tag of data) {
            tagCounts.set(tag.slug, {
              tag: { id: tag.id, slug: tag.slug, label: tag.label, eventCount: 0 },
              count: 0,
            });
          }

          // Fetch events to count by tag (get more to get better counts)
          const eventsUrl = `${POLYMARKET_API_BASE}/events?active=true&closed=false&limit=100&related_tags=true`;
          const eventsResponse = await this.fetchWithTimeout(eventsUrl, {
            headers: { Accept: 'application/json' },
          });

          if (eventsResponse.ok) {
            const events = (await eventsResponse.json()) as PolymarketEvent[];
            for (const event of events) {
              if (event.tags) {
                for (const eventTag of event.tags) {
                  const existing = tagCounts.get(eventTag.slug);
                  if (existing) {
                    existing.count++;
                    existing.tag.eventCount = existing.count;
                  }
                }
              }
            }
          }

          // Sort by count descending, filter out zero counts
          const tags = Array.from(tagCounts.values())
            .filter((t) => t.count > 0)
            .sort((a, b) => b.count - a.count)
            .map((t) => t.tag);

          return { success: true, tags };
        }

        // Return all tags sorted by label
        const tags: PolymarketTag[] = data
          .map((t) => ({ id: t.id, slug: t.slug, label: t.label }))
          .sort((a, b) => a.label.localeCompare(b.label));

        return { success: true, tags };
      } catch (error) {
        return {
          success: false,
          error: `Failed to fetch tags: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    async getPolymarketTrending(options?: PolymarketFilterOptions): Promise<PolymarketResult> {
      try {
        const limit = options?.limit ?? 10;
        const hasFilters =
          (options?.excludeTags && options.excludeTags.length > 0) ||
          (options?.includeTags && options.includeTags.length > 0);

        // Fetch more events if we need to filter client-side
        const fetchLimit = hasFilters ? Math.max(limit * 3, 50) : limit;
        const url = `${POLYMARKET_API_BASE}/events?active=true&closed=false&limit=${fetchLimit}&order=volume&ascending=false&related_tags=true`;

        const response = await this.fetchWithTimeout(url, {
          headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
          return { success: false, error: `Polymarket API error: ${response.status}` };
        }

        const data = (await response.json()) as PolymarketEvent[];

        const markets: PolymarketMarket[] = [];

        for (const event of data) {
          // Apply tag filters at the event level
          if (!eventMatchesTags(event, options)) {
            continue;
          }

          const eventMarkets = event.markets ?? [];
          for (const market of eventMarkets) {
            const volume = Number.parseFloat(market.volume ?? event.volume ?? '0');
            const liquidity = Number.parseFloat(market.liquidity ?? event.liquidity ?? '0');

            // Apply volume/liquidity filters
            if (options?.minVolume && volume < options.minVolume) {
              continue;
            }
            if (options?.minLiquidity && liquidity < options.minLiquidity) {
              continue;
            }

            const outcomes = parseOutcomes(market.outcomes);
            const outcomePrices = parseOutcomePrices(market.outcomePrices);

            markets.push({
              id: market.id,
              question: market.question || event.title,
              description: market.description || event.description,
              endDate: market.endDate || event.endDate,
              volume,
              liquidity,
              outcomes: outcomes.map((outcome, i) => ({
                name: outcome,
                price: outcomePrices[i] ?? 0.5,
              })),
              category: event.category,
              slug: event.slug,
              tags: event.tags?.map((t) => t.slug),
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

    async searchPolymarkets(query: string, options?: PolymarketFilterOptions): Promise<PolymarketResult> {
      try {
        const limit = options?.limit ?? 10;
        const hasFilters =
          (options?.excludeTags && options.excludeTags.length > 0) ||
          (options?.includeTags && options.includeTags.length > 0);

        // Fetch more events if we need to filter client-side
        const fetchLimit = hasFilters ? Math.max(limit * 3, 50) : limit;
        const url = `${POLYMARKET_API_BASE}/events?title_contains=${encodeURIComponent(query)}&active=true&closed=false&limit=${fetchLimit}&related_tags=true`;

        const response = await this.fetchWithTimeout(url, {
          headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
          return { success: false, error: `Polymarket API error: ${response.status}` };
        }

        const data = (await response.json()) as PolymarketEvent[];

        const markets: PolymarketMarket[] = [];

        for (const event of data) {
          // Apply tag filters at the event level
          if (!eventMatchesTags(event, options)) {
            continue;
          }

          const eventMarkets = event.markets ?? [];
          for (const market of eventMarkets) {
            const volume = Number.parseFloat(market.volume ?? event.volume ?? '0');
            const liquidity = Number.parseFloat(market.liquidity ?? event.liquidity ?? '0');

            // Apply volume/liquidity filters
            if (options?.minVolume && volume < options.minVolume) {
              continue;
            }
            if (options?.minLiquidity && liquidity < options.minLiquidity) {
              continue;
            }

            const outcomes = parseOutcomes(market.outcomes);
            const outcomePrices = parseOutcomePrices(market.outcomePrices);

            markets.push({
              id: market.id,
              question: market.question || event.title,
              description: market.description || event.description,
              endDate: market.endDate || event.endDate,
              volume,
              liquidity,
              outcomes: outcomes.map((outcome, i) => ({
                name: outcome,
                price: outcomePrices[i] ?? 0.5,
              })),
              category: event.category,
              slug: event.slug,
              tags: event.tags?.map((t) => t.slug),
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

    async getPolymarketSentiment(topic: string, options?: { limit?: number }): Promise<PolymarketSentimentResult> {
      try {
        const limit = options?.limit ?? 20;
        const topicLower = topic.toLowerCase();

        // Expand topic to better search terms for common queries
        const searchTerms = expandTopicToSearchTerms(topicLower);

        // Gather markets from multiple sources
        const allMarkets: PolymarketMarket[] = [];

        // Search for each expanded term
        for (const term of searchTerms) {
          const searchResult = await this.searchPolymarkets(term, { limit: 30 });
          if (searchResult.success) {
            for (const market of searchResult.markets) {
              // Avoid duplicates
              if (!allMarkets.some((m) => m.id === market.id)) {
                allMarkets.push(market);
              }
            }
          }
        }

        // Also check trending markets for the topic
        const trendingResult = await this.getPolymarketTrending({ limit: 50 });
        if (trendingResult.success) {
          for (const market of trendingResult.markets) {
            if (!allMarkets.some((m) => m.id === market.id)) {
              // Check if market is relevant to topic
              if (isMarketRelevantToTopic(market, topicLower, searchTerms)) {
                allMarkets.push(market);
              }
            }
          }
        }

        if (allMarkets.length === 0) {
          return {
            success: false,
            error: `No prediction markets found for "${topic}"`,
          };
        }

        const signals: PolymarketSentimentSignal[] = [];

        // Analyze each market to extract sentiment signals
        for (const market of allMarkets) {
          const signal = analyzeMarketSentiment(market, topicLower, searchTerms);
          if (signal) {
            signals.push(signal);
          }
        }

        if (signals.length === 0) {
          return {
            success: false,
            error: `Found markets for "${topic}" but couldn't extract sentiment signals`,
          };
        }

        // Sort by volume (most liquid markets first)
        signals.sort((a, b) => b.volume - a.volume);

        // Take top signals
        const topSignals = signals.slice(0, limit);

        // Calculate overall sentiment
        const sentiment = calculateOverallSentiment(topic, topSignals);

        return { success: true, sentiment };
      } catch (error) {
        return {
          success: false,
          error: `Failed to analyze sentiment: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
  }

  return PolymarketMixin;
}

// Topic expansion for better search results
const TOPIC_EXPANSIONS: Record<string, string[]> = {
  fed: ['fed', 'interest rate', 'fomc', 'federal reserve', 'rate cut', 'rate hike'],
  rates: ['interest rate', 'fed', 'fomc', 'rate cut', 'rate hike'],
  'interest rate': ['interest rate', 'fed', 'fomc', 'rate cut', 'rate hike'],
  btc: ['bitcoin', 'btc'],
  bitcoin: ['bitcoin', 'btc'],
  eth: ['ethereum', 'eth'],
  ethereum: ['ethereum', 'eth'],
  sol: ['solana', 'sol'],
  solana: ['solana', 'sol'],
  trump: ['trump', 'donald trump', 'president trump'],
  biden: ['biden', 'joe biden', 'president biden'],
  ai: ['artificial intelligence', 'ai', 'openai', 'chatgpt', 'gpt'],
  crypto: ['crypto', 'cryptocurrency', 'bitcoin', 'ethereum'],
  recession: ['recession', 'economy', 'gdp'],
  inflation: ['inflation', 'cpi', 'prices'],
};

// Keywords that indicate relevance for each topic
const TOPIC_KEYWORDS: Record<string, string[]> = {
  fed: ['fed', 'interest', 'rate', 'fomc', 'powell', 'monetary', 'bps', 'basis point'],
  rates: ['rate', 'interest', 'fed', 'fomc', 'bps', 'basis point'],
  'interest rate': ['rate', 'interest', 'fed', 'fomc', 'bps', 'basis point'],
  btc: ['bitcoin', 'btc', 'satoshi'],
  bitcoin: ['bitcoin', 'btc', 'satoshi'],
  eth: ['ethereum', 'eth', 'vitalik'],
  ethereum: ['ethereum', 'eth', 'vitalik'],
  sol: ['solana', 'sol'],
  solana: ['solana', 'sol'],
  trump: ['trump'],
  biden: ['biden'],
  ai: ['ai', 'artificial intelligence', 'openai', 'gpt', 'llm', 'chatgpt', 'claude', 'gemini'],
  crypto: ['crypto', 'bitcoin', 'ethereum', 'token', 'coin'],
  recession: ['recession', 'economy', 'gdp', 'contraction'],
  inflation: ['inflation', 'cpi', 'prices', 'deflation'],
};

function expandTopicToSearchTerms(topic: string): string[] {
  const expanded = TOPIC_EXPANSIONS[topic];
  if (expanded) {
    return expanded;
  }
  return [topic];
}

function isMarketRelevantToTopic(market: PolymarketMarket, topic: string, searchTerms: string[]): boolean {
  const questionLower = market.question.toLowerCase();
  const descLower = market.description?.toLowerCase() ?? '';
  const combined = `${questionLower} ${descLower}`;

  // Check if any search term appears
  for (const term of searchTerms) {
    if (combined.includes(term.toLowerCase())) {
      return true;
    }
  }

  // Check topic-specific keywords
  const keywords = TOPIC_KEYWORDS[topic] ?? [topic];
  for (const keyword of keywords) {
    if (combined.includes(keyword.toLowerCase())) {
      return true;
    }
  }

  return false;
}

// Patterns for detecting bullish/bearish market questions
const BULLISH_PATTERNS = [
  /above \$[\d,]+/i,
  /over \$[\d,]+/i,
  /reach \$[\d,]+/i,
  /hit \$[\d,]+/i,
  /exceed/i,
  /increase/i,
  /rise/i,
  /rally/i,
  /bull/i,
  /new all[- ]?time high/i,
  /ath/i,
  /rate cut/i,
  /decrease.*rate/i,
  /lower.*rate/i,
  /win/i,
  /approve/i,
  /pass/i,
  /launch/i,
  /release/i,
  /adopt/i,
  /accept/i,
  /buy/i,
  /acquire/i,
  /no change.*rate/i, // No change is neutral-bullish for markets
];

const BEARISH_PATTERNS = [
  /below \$[\d,]+/i,
  /under \$[\d,]+/i,
  /fall/i,
  /drop/i,
  /crash/i,
  /bear/i,
  /recession/i,
  /rate hike/i,
  /increase.*rate/i,
  /raise.*rate/i,
  /lose/i,
  /reject/i,
  /fail/i,
  /ban/i,
  /sell/i,
  /dump/i,
  /liquidat/i,
];

// Patterns that indicate neutral sentiment (informational, not directional)
const NEUTRAL_OVERRIDE_PATTERNS = [/who will/i, /which.*will/i, /when will/i, /what will/i];

function analyzeMarketSentiment(
  market: PolymarketMarket,
  topic: string,
  searchTerms: string[],
): PolymarketSentimentSignal | null {
  // Check relevance using search terms and keywords
  if (!isMarketRelevantToTopic(market, topic, searchTerms)) {
    return null;
  }

  // Skip questions that are purely informational
  for (const pattern of NEUTRAL_OVERRIDE_PATTERNS) {
    if (pattern.test(market.question)) {
      return null;
    }
  }

  // Find the "Yes" outcome probability
  const yesOutcome = market.outcomes.find((o) => o.name.toLowerCase() === 'yes' || o.name.toLowerCase() === 'true');
  const yesProbability = yesOutcome?.price ?? 0.5;

  // Determine if the question is bullish or bearish in nature
  let questionSentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';

  for (const pattern of BULLISH_PATTERNS) {
    if (pattern.test(market.question)) {
      questionSentiment = 'bullish';
      break;
    }
  }

  if (questionSentiment === 'neutral') {
    for (const pattern of BEARISH_PATTERNS) {
      if (pattern.test(market.question)) {
        questionSentiment = 'bearish';
        break;
      }
    }
  }

  // Calculate signal sentiment based on question type and probability
  let signalSentiment: 'bullish' | 'bearish' | 'neutral';
  let signalProbability: number;

  if (questionSentiment === 'bullish') {
    // For bullish questions, high "Yes" probability = bullish signal
    signalSentiment = yesProbability > 0.5 ? 'bullish' : yesProbability < 0.3 ? 'bearish' : 'neutral';
    signalProbability = yesProbability;
  } else if (questionSentiment === 'bearish') {
    // For bearish questions, high "Yes" probability = bearish signal
    signalSentiment = yesProbability > 0.5 ? 'bearish' : yesProbability < 0.3 ? 'bullish' : 'neutral';
    signalProbability = yesProbability;
  } else {
    // Neutral question - can't determine sentiment
    return null;
  }

  // Confidence is based on how extreme the probability is (away from 50%)
  const confidence = Math.abs(yesProbability - 0.5) * 200; // 0-100 scale

  return {
    question: market.question,
    sentiment: signalSentiment,
    confidence: Math.round(confidence),
    probability: signalProbability,
    volume: market.volume,
    slug: market.slug,
  };
}

function calculateOverallSentiment(topic: string, signals: PolymarketSentimentSignal[]): PolymarketSentiment {
  // Weight signals by volume
  let weightedBullish = 0;
  let weightedBearish = 0;
  let totalWeight = 0;

  for (const signal of signals) {
    const weight = Math.log10(signal.volume + 1); // Log scale for volume weighting
    totalWeight += weight;

    if (signal.sentiment === 'bullish') {
      weightedBullish += weight * (signal.confidence / 100);
    } else if (signal.sentiment === 'bearish') {
      weightedBearish += weight * (signal.confidence / 100);
    }
  }

  // Calculate sentiment score (-100 to +100)
  let sentimentScore = 0;
  if (totalWeight > 0) {
    const normalizedBullish = weightedBullish / totalWeight;
    const normalizedBearish = weightedBearish / totalWeight;
    sentimentScore = Math.round((normalizedBullish - normalizedBearish) * 100);
  }

  // Determine overall sentiment
  let overallSentiment: 'bullish' | 'bearish' | 'neutral' | 'mixed';
  if (sentimentScore > 20) {
    overallSentiment = 'bullish';
  } else if (sentimentScore < -20) {
    overallSentiment = 'bearish';
  } else if (weightedBullish > 0 && weightedBearish > 0) {
    overallSentiment = 'mixed';
  } else {
    overallSentiment = 'neutral';
  }

  // Calculate confidence based on signal agreement and volume
  const bullishCount = signals.filter((s) => s.sentiment === 'bullish').length;
  const bearishCount = signals.filter((s) => s.sentiment === 'bearish').length;
  const agreement = Math.abs(bullishCount - bearishCount) / signals.length;
  const avgConfidence = signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length;
  const confidence = Math.round(agreement * 50 + avgConfidence * 0.5);

  // Generate summary
  const topSignal = signals[0];
  let summary: string;

  if (overallSentiment === 'bullish') {
    summary = `Polymarket shows bullish expectations for ${topic}. Top signal: "${topSignal.question}" at ${Math.round(topSignal.probability * 100)}% probability.`;
  } else if (overallSentiment === 'bearish') {
    summary = `Polymarket shows bearish expectations for ${topic}. Top signal: "${topSignal.question}" at ${Math.round(topSignal.probability * 100)}% probability.`;
  } else if (overallSentiment === 'mixed') {
    summary = `Polymarket shows mixed sentiment for ${topic} with ${bullishCount} bullish and ${bearishCount} bearish signals.`;
  } else {
    summary = `Polymarket shows neutral expectations for ${topic} based on ${signals.length} markets analyzed.`;
  }

  return {
    topic,
    overallSentiment,
    sentimentScore,
    confidence,
    signals,
    summary,
  };
}
