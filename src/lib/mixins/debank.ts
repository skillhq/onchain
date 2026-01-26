import type { AbstractConstructor, Mixin, OnchainClientBase } from '../onchain-client-base.js';
import type {
  BalanceResult,
  DefiPosition,
  DefiResult,
  EvmChain,
  HistoryResult,
  NftAsset,
  NftResult,
  TokenBalance,
  Transaction,
} from '../onchain-client-types.js';

const DEBANK_API_BASE = 'https://pro-openapi.debank.com/v1';

export interface DeBankMethods {
  getEvmBalances(address: string, chains?: EvmChain[]): Promise<BalanceResult>;
  getEvmNfts(address: string): Promise<NftResult>;
  getEvmDefiPositions(address: string): Promise<DefiResult>;
  getEvmHistory(
    address: string,
    options?: { chain?: EvmChain; limit?: number; cursor?: string },
  ): Promise<HistoryResult>;
  getEvmTotalBalance(
    address: string,
  ): Promise<{ success: true; totalValueUsd: number } | { success: false; error: string }>;
}

interface DeBankToken {
  id: string;
  chain: string;
  name: string;
  symbol: string;
  decimals: number;
  logo_url?: string;
  price?: number;
  amount: number;
  raw_amount?: number;
  raw_amount_hex_str?: string;
}

interface DeBankNft {
  id: string;
  contract_id: string;
  inner_id: string;
  chain: string;
  name?: string;
  content?: string;
  content_type?: string;
  thumbnail_url?: string;
  collection?: {
    id: string;
    name: string;
    floor_price?: number;
  };
}

interface DeBankProtocol {
  id: string;
  chain: string;
  name: string;
  site_url?: string;
  logo_url?: string;
  portfolio_item_list: Array<{
    name: string;
    detail_types: string[];
    detail: {
      supply_token_list?: DeBankToken[];
      borrow_token_list?: DeBankToken[];
      reward_token_list?: DeBankToken[];
      token_list?: DeBankToken[];
      description?: string;
      health_rate?: number;
    };
    stats: {
      asset_usd_value: number;
      debt_usd_value: number;
      net_usd_value: number;
    };
  }>;
}

interface DeBankHistoryItem {
  id: string;
  cate_id: string;
  chain: string;
  project_id?: string;
  tx?: {
    from_addr: string;
    to_addr: string;
    name: string;
    status: number;
    eth_gas_fee?: number;
    usd_gas_fee?: number;
  };
  time_at: number;
  sends?: Array<{
    token_id: string;
    amount: number;
  }>;
  receives?: Array<{
    token_id: string;
    amount: number;
  }>;
  token_approve?: {
    spender: string;
    token_id: string;
  };
}

interface DeBankTotalBalance {
  total_usd_value: number;
  chain_list: Array<{
    id: string;
    usd_value: number;
  }>;
}

export function withDeBank<TBase extends AbstractConstructor<OnchainClientBase>>(
  Base: TBase,
): Mixin<TBase, DeBankMethods> {
  abstract class DeBankMixin extends Base implements DeBankMethods {
    private getDeBankHeaders(): Record<string, string> {
      if (!this.debankApiKey) {
        throw new Error('DeBank API key required');
      }
      return {
        Accept: 'application/json',
        AccessKey: this.debankApiKey,
      };
    }

    async getEvmBalances(address: string, chains?: EvmChain[]): Promise<BalanceResult> {
      if (!this.debankApiKey) {
        return { success: false, error: 'DeBank API key not configured' };
      }

      try {
        const url = chains?.length
          ? `${DEBANK_API_BASE}/user/token_list?id=${address}&chain_ids=${chains.join(',')}&is_all=false`
          : `${DEBANK_API_BASE}/user/all_token_list?id=${address}&is_all=true`;

        const response = await this.fetchWithTimeout(url, {
          headers: this.getDeBankHeaders(),
        });

        if (!response.ok) {
          return { success: false, error: `DeBank API error: ${response.status}` };
        }

        const data = (await response.json()) as DeBankToken[];

        let totalValueUsd = 0;
        const balances: TokenBalance[] = data
          .filter((token) => token.amount > 0)
          .map((token) => {
            const valueUsd = token.price ? token.amount * token.price : null;
            if (valueUsd) {
              totalValueUsd += valueUsd;
            }
            return {
              symbol: token.symbol,
              name: token.name,
              chain: token.chain as EvmChain,
              contractAddress: token.id,
              balanceRaw: token.raw_amount_hex_str ?? String(token.raw_amount ?? 0),
              balanceFormatted: token.amount,
              decimals: token.decimals,
              priceUsd: token.price ?? null,
              valueUsd,
              logoUrl: token.logo_url,
            };
          })
          .sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0));

        return { success: true, balances, totalValueUsd };
      } catch (error) {
        return {
          success: false,
          error: `Failed to fetch EVM balances: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    async getEvmNfts(address: string): Promise<NftResult> {
      if (!this.debankApiKey) {
        return { success: false, error: 'DeBank API key not configured' };
      }

      try {
        const url = `${DEBANK_API_BASE}/user/all_nft_list?id=${address}`;

        const response = await this.fetchWithTimeout(url, {
          headers: this.getDeBankHeaders(),
        });

        if (!response.ok) {
          return { success: false, error: `DeBank API error: ${response.status}` };
        }

        const data = (await response.json()) as DeBankNft[];

        let totalEstimatedValueUsd = 0;
        const nfts: NftAsset[] = data.map((nft) => {
          const floorPrice = nft.collection?.floor_price;
          if (floorPrice) {
            totalEstimatedValueUsd += floorPrice;
          }
          return {
            id: nft.id,
            name: nft.name ?? `#${nft.inner_id}`,
            collection: nft.collection?.name ?? 'Unknown',
            chain: nft.chain as EvmChain,
            contractAddress: nft.contract_id,
            tokenId: nft.inner_id,
            imageUrl: nft.thumbnail_url ?? nft.content,
            floorPriceUsd: floorPrice,
          };
        });

        return { success: true, nfts, totalEstimatedValueUsd };
      } catch (error) {
        return {
          success: false,
          error: `Failed to fetch EVM NFTs: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    async getEvmDefiPositions(address: string): Promise<DefiResult> {
      if (!this.debankApiKey) {
        return { success: false, error: 'DeBank API key not configured' };
      }

      try {
        const url = `${DEBANK_API_BASE}/user/all_complex_protocol_list?id=${address}`;

        const response = await this.fetchWithTimeout(url, {
          headers: this.getDeBankHeaders(),
        });

        if (!response.ok) {
          return { success: false, error: `DeBank API error: ${response.status}` };
        }

        const data = (await response.json()) as DeBankProtocol[];

        let totalValueUsd = 0;
        const positions: DefiPosition[] = [];

        for (const protocol of data) {
          for (const item of protocol.portfolio_item_list) {
            const netValue = item.stats.net_usd_value;
            totalValueUsd += netValue;

            // Determine position type
            let type: DefiPosition['type'] = 'other';
            if (item.detail_types.includes('lending')) {
              type = 'lending';
            } else if (item.detail_types.includes('staked')) {
              type = 'staking';
            } else if (item.detail_types.includes('liquidity')) {
              type = 'liquidity';
            } else if (item.detail_types.includes('farming') || item.detail_types.includes('reward')) {
              type = 'farming';
            } else if (item.detail_types.includes('vesting') || item.detail_types.includes('locked')) {
              type = 'vesting';
            }

            // Collect all tokens from the position
            const allTokens = [
              ...(item.detail.supply_token_list ?? []),
              ...(item.detail.token_list ?? []),
              ...(item.detail.reward_token_list ?? []),
            ];

            const assets = allTokens.map((token) => ({
              symbol: token.symbol,
              amount: token.amount,
              valueUsd: token.price ? token.amount * token.price : null,
            }));

            positions.push({
              protocol: protocol.name,
              protocolLogoUrl: protocol.logo_url,
              chain: protocol.chain as EvmChain,
              type,
              assets,
              totalValueUsd: netValue,
              healthFactor: item.detail.health_rate,
            });
          }
        }

        return { success: true, positions, totalValueUsd };
      } catch (error) {
        return {
          success: false,
          error: `Failed to fetch DeFi positions: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    async getEvmHistory(
      address: string,
      options?: { chain?: EvmChain; limit?: number; cursor?: string },
    ): Promise<HistoryResult> {
      if (!this.debankApiKey) {
        return { success: false, error: 'DeBank API key not configured' };
      }

      try {
        const limit = options?.limit ?? 20;
        let url = `${DEBANK_API_BASE}/user/all_history_list?id=${address}&page_count=${limit}`;

        if (options?.chain) {
          url = `${DEBANK_API_BASE}/user/history_list?id=${address}&chain_id=${options.chain}&page_count=${limit}`;
        }

        if (options?.cursor) {
          url += `&start_time=${options.cursor}`;
        }

        const response = await this.fetchWithTimeout(url, {
          headers: this.getDeBankHeaders(),
        });

        if (!response.ok) {
          return { success: false, error: `DeBank API error: ${response.status}` };
        }

        const data = (await response.json()) as {
          history_list: DeBankHistoryItem[];
          cate_dict: Record<string, { id: string; name: string }>;
          token_dict: Record<string, { symbol: string; name: string; decimals: number; price?: number }>;
        };

        const transactions: Transaction[] = data.history_list.map((item) => {
          // Determine transaction type
          let type: Transaction['type'] = 'other';
          if (item.cate_id === 'send') {
            type = 'send';
          } else if (item.cate_id === 'receive') {
            type = 'receive';
          } else if (item.cate_id === 'swap' || item.cate_id === 'trade') {
            type = 'swap';
          } else if (item.cate_id === 'approve') {
            type = 'approve';
          }

          // Get token transfers
          const tokens: Transaction['tokens'] = [];
          if (item.sends) {
            for (const send of item.sends) {
              const tokenInfo = data.token_dict[send.token_id];
              tokens.push({
                symbol: tokenInfo?.symbol ?? 'UNKNOWN',
                amount: send.amount,
                direction: 'out',
                valueUsd: tokenInfo?.price ? send.amount * tokenInfo.price : undefined,
              });
            }
          }
          if (item.receives) {
            for (const receive of item.receives) {
              const tokenInfo = data.token_dict[receive.token_id];
              tokens.push({
                symbol: tokenInfo?.symbol ?? 'UNKNOWN',
                amount: receive.amount,
                direction: 'in',
                valueUsd: tokenInfo?.price ? receive.amount * tokenInfo.price : undefined,
              });
            }
          }

          return {
            id: item.id,
            hash: item.id.split('_')[0] ?? item.id,
            chain: item.chain as EvmChain,
            timestamp: item.time_at,
            type,
            status: item.tx?.status === 1 ? 'success' : 'failed',
            from: item.tx?.from_addr ?? '',
            to: item.tx?.to_addr ?? '',
            fee: item.tx?.usd_gas_fee
              ? {
                  amount: item.tx.eth_gas_fee ?? 0,
                  symbol: 'ETH',
                  valueUsd: item.tx.usd_gas_fee,
                }
              : undefined,
            tokens: tokens.length > 0 ? tokens : undefined,
          };
        });

        // Use the last item's timestamp as cursor for pagination
        const lastItem = data.history_list[data.history_list.length - 1];
        const nextCursor = lastItem ? String(lastItem.time_at) : undefined;

        return { success: true, transactions, nextCursor };
      } catch (error) {
        return {
          success: false,
          error: `Failed to fetch EVM history: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    async getEvmTotalBalance(
      address: string,
    ): Promise<{ success: true; totalValueUsd: number } | { success: false; error: string }> {
      if (!this.debankApiKey) {
        return { success: false, error: 'DeBank API key not configured' };
      }

      try {
        const url = `${DEBANK_API_BASE}/user/total_balance?id=${address}`;

        const response = await this.fetchWithTimeout(url, {
          headers: this.getDeBankHeaders(),
        });

        if (!response.ok) {
          return { success: false, error: `DeBank API error: ${response.status}` };
        }

        const data = (await response.json()) as DeBankTotalBalance;

        return { success: true, totalValueUsd: data.total_usd_value };
      } catch (error) {
        return {
          success: false,
          error: `Failed to fetch total balance: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
  }

  return DeBankMixin;
}
