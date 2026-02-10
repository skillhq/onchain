import type { AbstractConstructor, Mixin, OnchainClientBase } from '../onchain-client-base.js';
import type {
  BalanceResult,
  HistoryResult,
  SupportedChain,
  TokenBalance,
  Transaction,
} from '../onchain-client-types.js';

const ZERION_API_BASE = 'https://api.zerion.io/v1';

// Map from Zerion chain IDs to codebase chain IDs
const ZERION_TO_CHAIN: Record<string, SupportedChain> = {
  ethereum: 'eth',
  'binance-smart-chain': 'bsc',
  polygon: 'polygon',
  arbitrum: 'arb',
  optimism: 'op',
  avalanche: 'avax',
  base: 'base',
  'zksync-era': 'zksync',
  linea: 'linea',
  scroll: 'scroll',
  blast: 'blast',
  mantle: 'mantle',
  manta: 'manta',
  mode: 'mode',
  gnosis: 'gnosis',
  fantom: 'fantom',
  celo: 'celo',
  aurora: 'aurora',
  moonbeam: 'moonbeam',
  moonriver: 'moonriver',
  cronos: 'cronos',
  harmony: 'harmony',
  metis: 'metis',
  boba: 'boba',
  solana: 'solana',
};

// Reverse mapping for chain-to-Zerion lookups
const CHAIN_TO_ZERION: Record<string, string> = {};
for (const [zerionId, chainId] of Object.entries(ZERION_TO_CHAIN)) {
  CHAIN_TO_ZERION[chainId] = zerionId;
}

function reverseMapChain(zerionChainId: string): SupportedChain {
  return ZERION_TO_CHAIN[zerionChainId] ?? 'eth';
}

export interface ZerionPortfolioSummary {
  totalValueUsd: number;
  absoluteChange24h: number;
  relativeChange24h: number;
}

export type ZerionPortfolioResult =
  | { success: true; portfolio: ZerionPortfolioSummary }
  | { success: false; error: string };

export interface ZerionMethods {
  getZerionBalances(address: string, chains?: SupportedChain[]): Promise<BalanceResult>;
  getZerionHistory(address: string, options?: { limit?: number; cursor?: string }): Promise<HistoryResult>;
  getZerionPortfolio(address: string): Promise<ZerionPortfolioResult>;
}

// Zerion API response types
interface ZerionPosition {
  id: string;
  type: string;
  attributes: {
    parent: unknown;
    protocol: unknown;
    name: string;
    position_type: string;
    quantity: {
      int: string;
      decimals: number;
      float: number;
      numeric: string;
    };
    value: number | null;
    price: number;
    changes: unknown;
    fungible_info: {
      name: string;
      symbol: string;
      icon: {
        url: string | null;
      } | null;
      flags: unknown;
      implementations: Array<{
        chain_id: string;
        address: string | null;
        decimals: number;
      }>;
    };
    flags: unknown;
    updated_at: string;
    updated_at_block: number;
  };
}

interface ZerionTransaction {
  id: string;
  type: string;
  attributes: {
    operation_type: string;
    hash: string;
    mined_at: string;
    sent_from: string;
    sent_to: string;
    status: string;
    nonce: number;
    fee: {
      fungible_info: {
        name: string;
        symbol: string;
        icon: { url: string | null } | null;
        implementations: Array<{
          chain_id: string;
          address: string | null;
          decimals: number;
        }>;
      };
      quantity: {
        int: string;
        decimals: number;
        float: number;
        numeric: string;
      };
      price: number;
      value: number;
    } | null;
    transfers: Array<{
      fungible_info: {
        name: string;
        symbol: string;
        icon: { url: string | null } | null;
        implementations: Array<{
          chain_id: string;
          address: string | null;
          decimals: number;
        }>;
      };
      direction: 'in' | 'out';
      quantity: {
        int: string;
        decimals: number;
        float: number;
        numeric: string;
      };
      value: number | null;
      price: number;
      fungible_id: string;
    }>;
    approvals: unknown[];
    application_metadata: unknown;
    flags: unknown;
  };
  relationships: {
    chain: {
      data: {
        type: string;
        id: string;
      };
    };
  };
}

interface ZerionPortfolioResponse {
  data: {
    type: string;
    id: string;
    attributes: {
      positions_distribution_by_type: unknown;
      positions_distribution_by_chain: unknown;
      total: {
        positions: number;
      };
      changes: {
        absolute_1d: number;
        percent_1d: number;
      };
    };
  };
}

export function withZerion<TBase extends AbstractConstructor<OnchainClientBase>>(
  Base: TBase,
): Mixin<TBase, ZerionMethods> {
  abstract class ZerionMixin extends Base implements ZerionMethods {
    private getZerionAuthHeader(): Record<string, string> {
      if (!this.zerionApiKey) {
        throw new Error('Zerion API key required');
      }
      const encoded = Buffer.from(`${this.zerionApiKey}:`).toString('base64');
      return {
        Accept: 'application/json',
        Authorization: `Basic ${encoded}`,
      };
    }

    async getZerionBalances(address: string, chains?: SupportedChain[]): Promise<BalanceResult> {
      if (!this.zerionApiKey) {
        return { success: false, error: 'Zerion API key not configured' };
      }

      try {
        let url =
          `${ZERION_API_BASE}/wallets/${address}/positions/` +
          '?filter[positions]=only_simple&currency=usd&filter[trash]=only_non_trash&sort=-value';

        if (chains?.length) {
          const zerionChains = chains.map((c) => CHAIN_TO_ZERION[c]).filter(Boolean);
          if (zerionChains.length > 0) {
            url += `&filter[chain_ids]=${zerionChains.join(',')}`;
          }
        }

        const response = await this.fetchWithTimeout(url, {
          headers: this.getZerionAuthHeader(),
        });

        if (!response.ok) {
          return { success: false, error: `Zerion API error: ${response.status}` };
        }

        const data = (await response.json()) as { data: ZerionPosition[] };

        let totalValueUsd = 0;
        const balances: TokenBalance[] = [];

        for (const position of data.data) {
          const attrs = position.attributes;
          const info = attrs.fungible_info;
          const impl = info.implementations[0];

          const valueUsd = attrs.value;
          if (valueUsd) {
            totalValueUsd += valueUsd;
          }

          const chain = impl ? reverseMapChain(impl.chain_id) : 'eth';

          balances.push({
            symbol: info.symbol,
            name: info.name,
            chain,
            contractAddress: impl?.address ?? undefined,
            balanceRaw: attrs.quantity.int,
            balanceFormatted: attrs.quantity.float,
            decimals: attrs.quantity.decimals,
            priceUsd: attrs.price,
            valueUsd: valueUsd ?? null,
            logoUrl: info.icon?.url ?? undefined,
          });
        }

        // Sort by value descending, nulls last (API puts nulls first with sort=-value)
        balances.sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0));

        return { success: true, balances, totalValueUsd };
      } catch (error) {
        return {
          success: false,
          error: `Failed to fetch Zerion balances: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    async getZerionHistory(address: string, options?: { limit?: number; cursor?: string }): Promise<HistoryResult> {
      if (!this.zerionApiKey) {
        return { success: false, error: 'Zerion API key not configured' };
      }

      try {
        const limit = options?.limit ?? 20;
        let url = `${ZERION_API_BASE}/wallets/${address}/transactions/` + `?currency=usd&page[size]=${limit}`;

        if (options?.cursor) {
          url += `&page[after]=${options.cursor}`;
        }

        const response = await this.fetchWithTimeout(url, {
          headers: this.getZerionAuthHeader(),
        });

        if (!response.ok) {
          return { success: false, error: `Zerion API error: ${response.status}` };
        }

        const data = (await response.json()) as {
          data: ZerionTransaction[];
          links?: { next?: string };
        };

        const transactions: Transaction[] = data.data.map((tx) => {
          const attrs = tx.attributes;

          // Map operation type
          let type: Transaction['type'] = 'other';
          const opType = attrs.operation_type;
          if (opType === 'send') {
            type = 'send';
          } else if (opType === 'receive') {
            type = 'receive';
          } else if (opType === 'trade') {
            type = 'swap';
          } else if (opType === 'approve') {
            type = 'approve';
          } else if (opType === 'execute' || opType === 'deploy' || opType === 'mint' || opType === 'burn') {
            type = 'contract';
          }

          // Map status
          let status: Transaction['status'] = 'pending';
          if (attrs.status === 'confirmed') {
            status = 'success';
          } else if (attrs.status === 'failed') {
            status = 'failed';
          }

          // Map chain
          const chain = reverseMapChain(tx.relationships.chain.data.id);

          // Map fee
          const fee = attrs.fee
            ? {
                amount: attrs.fee.quantity.float,
                symbol: attrs.fee.fungible_info.symbol,
                valueUsd: attrs.fee.value,
              }
            : undefined;

          // Map token transfers
          const tokens: Transaction['tokens'] = attrs.transfers.map((transfer) => ({
            symbol: transfer.fungible_info.symbol,
            amount: transfer.quantity.float,
            direction: transfer.direction,
            valueUsd: transfer.value ?? undefined,
          }));

          // Calculate total value from transfers
          let valueUsd: number | undefined;
          const outTransfers = attrs.transfers.filter((t) => t.direction === 'out');
          if (outTransfers.length > 0) {
            valueUsd = outTransfers.reduce((sum, t) => sum + (t.value ?? 0), 0);
          }

          return {
            id: tx.id,
            hash: attrs.hash,
            chain,
            timestamp: Math.floor(new Date(attrs.mined_at).getTime() / 1000),
            type,
            status,
            from: attrs.sent_from,
            to: attrs.sent_to,
            valueUsd,
            fee,
            tokens: tokens.length > 0 ? tokens : undefined,
          };
        });

        // Extract cursor from links.next URL
        let nextCursor: string | undefined;
        if (data.links?.next) {
          try {
            const nextUrl = new URL(data.links.next, ZERION_API_BASE);
            nextCursor = nextUrl.searchParams.get('page[after]') ?? undefined;
          } catch {
            // Ignore parse errors
          }
        }

        return { success: true, transactions, nextCursor };
      } catch (error) {
        return {
          success: false,
          error: `Failed to fetch Zerion history: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    async getZerionPortfolio(address: string): Promise<ZerionPortfolioResult> {
      if (!this.zerionApiKey) {
        return { success: false, error: 'Zerion API key not configured' };
      }

      try {
        const url = `${ZERION_API_BASE}/wallets/${address}/portfolio?currency=usd`;

        const response = await this.fetchWithTimeout(url, {
          headers: this.getZerionAuthHeader(),
        });

        if (!response.ok) {
          return { success: false, error: `Zerion API error: ${response.status}` };
        }

        const data = (await response.json()) as ZerionPortfolioResponse;
        const attrs = data.data.attributes;

        // Calculate total from positions balance result (portfolio endpoint doesn't include total USD directly)
        // We'll use the balances endpoint for the total, but this gives us change data
        return {
          success: true,
          portfolio: {
            totalValueUsd: 0, // Caller should use getZerionBalances for total
            absoluteChange24h: attrs.changes.absolute_1d,
            relativeChange24h: attrs.changes.percent_1d,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: `Failed to fetch Zerion portfolio: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
  }

  return ZerionMixin;
}
