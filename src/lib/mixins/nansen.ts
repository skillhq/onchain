import { execSync, spawnSync } from 'node:child_process';
import type { AbstractConstructor, Mixin, OnchainClientBase } from '../onchain-client-base.js';
import type { BalanceResult, SupportedChain, TokenBalance } from '../onchain-client-types.js';

// Regex for extracting entity name from fullname
const ENTITY_NAME_REGEX = /^[^\w]+/;

// Nansen CLI chain mapping
type NansenChain =
  | 'ethereum'
  | 'solana'
  | 'base'
  | 'bnb'
  | 'arbitrum'
  | 'polygon'
  | 'optimism'
  | 'avalanche'
  | 'linea'
  | 'scroll'
  | 'zksync'
  | 'mantle';

// Map onchain chain identifiers to Nansen chain names
const CHAIN_TO_NANSEN: Record<string, NansenChain> = {
  eth: 'ethereum',
  ethereum: 'ethereum',
  bsc: 'bnb',
  polygon: 'polygon',
  arb: 'arbitrum',
  op: 'optimism',
  avax: 'avalanche',
  base: 'base',
  zksync: 'zksync',
  linea: 'linea',
  scroll: 'scroll',
  mantle: 'mantle',
  solana: 'solana',
};

// Nansen API response types
interface NansenBalanceItem {
  chain: string;
  address: string;
  token_address: string;
  token_symbol: string;
  token_name: string;
  token_amount: number;
  price_usd: number;
  value_usd: number;
}

interface NansenBalanceResponse {
  success: boolean;
  data?: {
    pagination: { page: number; per_page: number; is_last_page: boolean };
    data: NansenBalanceItem[];
  };
  error?: string;
}

interface NansenLabel {
  label: string;
  category: string;
  definition: string;
  smEarnedDate: string | null;
  fullname: string;
}

interface NansenLabelsResponse {
  success: boolean;
  data?: NansenLabel[];
  error?: string;
}

interface NansenSmartMoneyHolding {
  chain: string;
  token_address: string;
  token_symbol: string;
  token_sectors: string[];
  value_usd: number;
  balance_24h_percent_change: number;
  holders_count: number;
  share_of_holdings_percent: number;
  token_age_days: number;
  market_cap_usd: number;
}

interface NansenSmartMoneyResponse {
  success: boolean;
  data?: {
    data: NansenSmartMoneyHolding[];
    pagination: { page: number; per_page: number; is_last_page: boolean };
  };
  error?: string;
}

interface NansenScreenerToken {
  chain: string;
  token_address: string;
  token_symbol: string;
  token_age_days: number;
  market_cap_usd: number;
  liquidity: number;
  price_usd: number;
  price_change: number;
  fdv: number;
  fdv_mc_ratio: number;
  buy_volume: number;
  sell_volume: number;
  volume: number;
  netflow: number;
  inflow_fdv_ratio: number;
  outflow_fdv_ratio: number;
}

interface NansenScreenerResponse {
  success: boolean;
  data?: {
    data: NansenScreenerToken[];
    pagination: { page: number; per_page: number; is_last_page: boolean };
  };
  error?: string;
}

// Result types for Nansen-specific methods
export interface NansenLabelItem {
  label: string;
  category: string;
  definition: string;
  isSmartMoney: boolean;
  smEarnedDate: string | null;
}

export type NansenLabelsResult =
  | { success: true; labels: NansenLabelItem[]; entity: string | null }
  | { success: false; error: string };

export interface NansenSmartMoneyHoldingItem {
  chain: string;
  tokenAddress: string;
  symbol: string;
  sectors: string[];
  valueUsd: number;
  change24hPercent: number;
  holdersCount: number;
  shareOfHoldingsPercent: number;
  tokenAgeDays: number;
  marketCapUsd: number;
}

export type NansenSmartMoneyResult =
  | { success: true; holdings: NansenSmartMoneyHoldingItem[] }
  | { success: false; error: string };

export interface NansenScreenerItem {
  chain: string;
  tokenAddress: string;
  symbol: string;
  tokenAgeDays: number;
  marketCapUsd: number;
  liquidity: number;
  priceUsd: number;
  priceChangePercent: number;
  fdv: number;
  buyVolume: number;
  sellVolume: number;
  volume: number;
  netflow: number;
}

export type NansenTokenScreenerResult =
  | { success: true; tokens: NansenScreenerItem[] }
  | { success: false; error: string };

export interface NansenMethods {
  isNansenAvailable(): boolean;
  getNansenBalances(address: string, chain: SupportedChain): Promise<BalanceResult>;
  getNansenLabels(address: string, chain: SupportedChain): Promise<NansenLabelsResult>;
  getNansenSmartMoneyHoldings(chain: SupportedChain, options?: { limit?: number }): Promise<NansenSmartMoneyResult>;
  getNansenTokenScreener(
    chain: SupportedChain,
    options?: { limit?: number; timeframe?: string },
  ): Promise<NansenTokenScreenerResult>;
}

export function withNansen<TBase extends AbstractConstructor<OnchainClientBase>>(
  Base: TBase,
): Mixin<TBase, NansenMethods> {
  abstract class NansenMixin extends Base implements NansenMethods {
    private _nansenAvailable: boolean | null = null;

    /**
     * Check if the Nansen CLI is installed and available
     */
    isNansenAvailable(): boolean {
      if (this._nansenAvailable !== null) {
        return this._nansenAvailable;
      }
      try {
        execSync('which nansen', { encoding: 'utf8', stdio: 'pipe' });
        this._nansenAvailable = true;
      } catch {
        this._nansenAvailable = false;
      }
      return this._nansenAvailable;
    }

    /**
     * Run the Nansen CLI with the given arguments
     */
    private runNansen(
      args: string[],
      timeoutMs = 30000,
    ): { success: true; data: unknown } | { success: false; error: string } {
      const result = spawnSync('nansen', args, {
        encoding: 'utf8',
        timeout: timeoutMs,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      if (result.error) {
        return { success: false, error: `Nansen CLI error: ${result.error.message}` };
      }

      if (result.status !== 0) {
        const errorMsg = result.stderr?.trim() || `Nansen CLI exited with code ${result.status}`;
        return { success: false, error: errorMsg };
      }

      try {
        // Parse stdout, ignoring deprecation warnings on stderr
        const data = JSON.parse(result.stdout.trim());
        return { success: true, data };
      } catch {
        return { success: false, error: `Failed to parse Nansen output: ${result.stdout}` };
      }
    }

    /**
     * Convert onchain chain identifier to Nansen chain name
     */
    private toNansenChain(chain: SupportedChain): NansenChain | null {
      return CHAIN_TO_NANSEN[chain] ?? null;
    }

    /**
     * Get wallet balances using Nansen CLI
     */
    async getNansenBalances(address: string, chain: SupportedChain): Promise<BalanceResult> {
      if (!this.isNansenAvailable()) {
        return { success: false, error: 'Nansen CLI not available' };
      }

      const nansenChain = this.toNansenChain(chain);
      if (!nansenChain) {
        return { success: false, error: `Chain ${chain} not supported by Nansen` };
      }

      // Fetch a large batch of balances (Nansen CLI uses --limit for result count)
      const args = ['profiler', 'balance', '--address', address, '--chain', nansenChain, '--limit', '100'];

      const result = this.runNansen(args);
      if (!result.success) {
        return { success: false, error: result.error };
      }

      const response = result.data as NansenBalanceResponse;
      if (!response.success || !response.data) {
        return { success: false, error: response.error ?? 'Unknown Nansen error' };
      }

      const balances: TokenBalance[] = [];
      let totalValueUsd = 0;

      for (const item of response.data.data) {
        const balance: TokenBalance = {
          symbol: item.token_symbol,
          name: item.token_name,
          chain: chain,
          contractAddress: item.token_address,
          balanceRaw: String(item.token_amount),
          balanceFormatted: item.token_amount,
          decimals: 18, // Nansen doesn't provide decimals, use default
          priceUsd: item.price_usd,
          valueUsd: item.value_usd,
        };
        balances.push(balance);
        totalValueUsd += item.value_usd;
      }

      // Sort by value descending
      balances.sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0));

      return { success: true, balances, totalValueUsd };
    }

    /**
     * Get wallet labels/entities using Nansen CLI
     */
    async getNansenLabels(address: string, chain: SupportedChain): Promise<NansenLabelsResult> {
      if (!this.isNansenAvailable()) {
        return { success: false, error: 'Nansen CLI not available' };
      }

      const nansenChain = this.toNansenChain(chain);
      if (!nansenChain) {
        return { success: false, error: `Chain ${chain} not supported by Nansen` };
      }

      const args = ['profiler', 'labels', '--address', address, '--chain', nansenChain];
      const result = this.runNansen(args);

      if (!result.success) {
        return { success: false, error: result.error };
      }

      const response = result.data as NansenLabelsResponse;
      if (!response.success || !response.data) {
        return { success: false, error: response.error ?? 'Unknown Nansen error' };
      }

      // Deduplicate labels by name
      const seen = new Set<string>();
      const labels: NansenLabelItem[] = [];
      let entity: string | null = null;

      for (const item of response.data) {
        // Extract entity name from fullname (usually formatted as "👤 Name")
        if (!entity && item.fullname) {
          entity = item.fullname.replace(ENTITY_NAME_REGEX, '').trim();
        }

        if (!seen.has(item.label)) {
          seen.add(item.label);
          labels.push({
            label: item.label,
            category: item.category,
            definition: item.definition,
            isSmartMoney: item.category === 'behavioral' && item.label.includes('Smart'),
            smEarnedDate: item.smEarnedDate,
          });
        }
      }

      return { success: true, labels, entity };
    }

    /**
     * Get Smart Money holdings using Nansen CLI
     */
    async getNansenSmartMoneyHoldings(
      chain: SupportedChain,
      options?: { limit?: number },
    ): Promise<NansenSmartMoneyResult> {
      if (!this.isNansenAvailable()) {
        return { success: false, error: 'Nansen CLI not available' };
      }

      const nansenChain = this.toNansenChain(chain);
      if (!nansenChain) {
        return { success: false, error: `Chain ${chain} not supported by Nansen` };
      }

      const args = ['smart-money', 'holdings', '--chain', nansenChain];
      if (options?.limit) {
        args.push('--limit', String(options.limit));
      }

      const result = this.runNansen(args);
      if (!result.success) {
        return { success: false, error: result.error };
      }

      const response = result.data as NansenSmartMoneyResponse;
      if (!response.success || !response.data) {
        return { success: false, error: response.error ?? 'Unknown Nansen error' };
      }

      const holdings: NansenSmartMoneyHoldingItem[] = response.data.data.map((item) => ({
        chain: item.chain,
        tokenAddress: item.token_address,
        symbol: item.token_symbol,
        sectors: item.token_sectors,
        valueUsd: item.value_usd,
        change24hPercent: item.balance_24h_percent_change * 100,
        holdersCount: item.holders_count,
        shareOfHoldingsPercent: item.share_of_holdings_percent * 100,
        tokenAgeDays: item.token_age_days,
        marketCapUsd: item.market_cap_usd,
      }));

      return { success: true, holdings };
    }

    /**
     * Get token screener data using Nansen CLI
     */
    async getNansenTokenScreener(
      chain: SupportedChain,
      options?: { limit?: number; timeframe?: string },
    ): Promise<NansenTokenScreenerResult> {
      if (!this.isNansenAvailable()) {
        return { success: false, error: 'Nansen CLI not available' };
      }

      const nansenChain = this.toNansenChain(chain);
      if (!nansenChain) {
        return { success: false, error: `Chain ${chain} not supported by Nansen` };
      }

      const args = ['token', 'screener', '--chain', nansenChain];
      if (options?.limit) {
        args.push('--limit', String(options.limit));
      }
      if (options?.timeframe) {
        args.push('--timeframe', options.timeframe);
      }

      const result = this.runNansen(args);
      if (!result.success) {
        return { success: false, error: result.error };
      }

      const response = result.data as NansenScreenerResponse;
      if (!response.success || !response.data) {
        return { success: false, error: response.error ?? 'Unknown Nansen error' };
      }

      const tokens: NansenScreenerItem[] = response.data.data.map((item) => ({
        chain: item.chain,
        tokenAddress: item.token_address,
        symbol: item.token_symbol,
        tokenAgeDays: item.token_age_days,
        marketCapUsd: item.market_cap_usd,
        liquidity: item.liquidity,
        priceUsd: item.price_usd,
        priceChangePercent: item.price_change * 100,
        fdv: item.fdv,
        buyVolume: item.buy_volume,
        sellVolume: item.sell_volume,
        volume: item.volume,
        netflow: item.netflow,
      }));

      return { success: true, tokens };
    }
  }

  return NansenMixin;
}
