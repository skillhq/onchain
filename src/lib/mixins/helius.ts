import type { AbstractConstructor, Mixin, OnchainClientBase } from '../onchain-client-base.js';
import type {
  BalanceResult,
  HistoryResult,
  NftAsset,
  NftResult,
  TokenBalance,
  Transaction,
} from '../onchain-client-types.js';

const HELIUS_API_BASE = 'https://api.helius.xyz/v0';
const HELIUS_RPC_BASE = 'https://mainnet.helius-rpc.com';

export interface HeliusMethods {
  getSolanaBalances(address: string): Promise<BalanceResult>;
  getSolanaNfts(address: string): Promise<NftResult>;
  getSolanaHistory(address: string, options?: { limit?: number; cursor?: string }): Promise<HistoryResult>;
}

interface HeliusTokenMetadata {
  mint: string;
  onChainMetadata?: {
    metadata?: {
      data?: {
        name?: string;
        symbol?: string;
        uri?: string;
      };
    };
  };
  offChainMetadata?: {
    metadata?: {
      name?: string;
      symbol?: string;
      image?: string;
    };
  };
  legacyMetadata?: {
    name?: string;
    symbol?: string;
    logoURI?: string;
  };
}

interface HeliusNft {
  id: string;
  content?: {
    metadata?: {
      name?: string;
      symbol?: string;
    };
    links?: {
      image?: string;
    };
    json_uri?: string;
  };
  grouping?: Array<{
    group_key: string;
    group_value: string;
    collection_metadata?: {
      name?: string;
    };
  }>;
  token_info?: {
    decimals: number;
    supply: number;
  };
}

interface HeliusTransaction {
  signature: string;
  type: string;
  source: string;
  timestamp: number;
  fee: number;
  feePayer: string;
  slot: number;
  nativeTransfers?: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    amount: number;
  }>;
  tokenTransfers?: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    tokenAmount: number;
    mint: string;
    tokenStandard?: string;
  }>;
  accountData?: Array<{
    account: string;
    nativeBalanceChange: number;
    tokenBalanceChanges?: Array<{
      mint: string;
      userAccount: string;
      rawTokenAmount: {
        tokenAmount: string;
        decimals: number;
      };
    }>;
  }>;
  description?: string;
  transactionError?: {
    error?: string;
  };
}

// Jupiter price API for token prices
const JUPITER_PRICE_API = 'https://price.jup.ag/v6/price';

interface JupiterPrice {
  id: string;
  mintSymbol: string;
  vsToken: string;
  vsTokenSymbol: string;
  price: number;
}

export function withHelius<TBase extends AbstractConstructor<OnchainClientBase>>(
  Base: TBase,
): Mixin<TBase, HeliusMethods> {
  abstract class HeliusMixin extends Base implements HeliusMethods {
    private getHeliusUrl(endpoint: string): string {
      if (!this.heliusApiKey) {
        throw new Error('Helius API key required');
      }
      return `${HELIUS_API_BASE}${endpoint}?api-key=${this.heliusApiKey}`;
    }

    private getHeliusRpcUrl(): string {
      if (!this.heliusApiKey) {
        throw new Error('Helius API key required');
      }
      return `${HELIUS_RPC_BASE}/?api-key=${this.heliusApiKey}`;
    }

    private async getTokenPrices(mints: string[]): Promise<Map<string, number>> {
      try {
        const url = `${JUPITER_PRICE_API}?ids=${mints.join(',')}`;
        const response = await this.fetchWithTimeout(url);

        if (!response.ok) {
          return new Map();
        }

        const data = (await response.json()) as { data: Record<string, JupiterPrice> };
        const prices = new Map<string, number>();

        for (const [mint, priceData] of Object.entries(data.data)) {
          prices.set(mint, priceData.price);
        }

        return prices;
      } catch {
        return new Map();
      }
    }

    async getSolanaBalances(address: string): Promise<BalanceResult> {
      if (!this.heliusApiKey) {
        return { success: false, error: 'Helius API key not configured' };
      }

      try {
        // Get SOL balance via RPC
        const rpcResponse = await this.fetchWithTimeout(this.getHeliusRpcUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getBalance',
            params: [address],
          }),
        });

        const solBalanceData = (await rpcResponse.json()) as {
          result?: { value: number };
          error?: { message: string };
        };

        // Get token balances
        const tokensResponse = await this.fetchWithTimeout(this.getHeliusRpcUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: 'getTokenAccountsByOwner',
            params: [address, { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' }, { encoding: 'jsonParsed' }],
          }),
        });

        const tokensData = (await tokensResponse.json()) as {
          result?: {
            value: Array<{
              pubkey: string;
              account: {
                data: {
                  parsed: {
                    info: {
                      mint: string;
                      tokenAmount: {
                        amount: string;
                        decimals: number;
                        uiAmount: number;
                      };
                    };
                  };
                };
              };
            }>;
          };
        };

        const balances: TokenBalance[] = [];
        let totalValueUsd = 0;

        // Add SOL balance
        const solBalance = solBalanceData.result?.value ?? 0;
        const solFormatted = solBalance / 1e9;

        // Get SOL price from Jupiter
        const solPrices = await this.getTokenPrices(['So11111111111111111111111111111111111111112']);
        const solPrice = solPrices.get('So11111111111111111111111111111111111111112') ?? null;
        const solValue = solPrice ? solFormatted * solPrice : null;

        if (solValue) {
          totalValueUsd += solValue;
        }

        balances.push({
          symbol: 'SOL',
          name: 'Solana',
          chain: 'solana',
          balanceRaw: String(solBalance),
          balanceFormatted: solFormatted,
          decimals: 9,
          priceUsd: solPrice,
          valueUsd: solValue,
        });

        // Process token balances
        const tokenAccounts = tokensData.result?.value ?? [];
        const mints = tokenAccounts
          .filter((ta) => ta.account.data.parsed.info.tokenAmount.uiAmount > 0)
          .map((ta) => ta.account.data.parsed.info.mint);

        // Get prices for all tokens
        const tokenPrices = mints.length > 0 ? await this.getTokenPrices(mints) : new Map();

        // Get token metadata
        const tokenMetadata = new Map<string, HeliusTokenMetadata>();
        if (mints.length > 0) {
          try {
            const metadataResponse = await this.fetchWithTimeout(this.getHeliusUrl('/token-metadata'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ mintAccounts: mints }),
            });

            if (metadataResponse.ok) {
              const metadataData = (await metadataResponse.json()) as HeliusTokenMetadata[];
              for (const meta of metadataData) {
                tokenMetadata.set(meta.mint, meta);
              }
            }
          } catch {
            // Continue without metadata
          }
        }

        for (const tokenAccount of tokenAccounts) {
          const info = tokenAccount.account.data.parsed.info;
          const amount = info.tokenAmount.uiAmount;

          if (amount <= 0) {
            continue;
          }

          const mint = info.mint;
          const meta = tokenMetadata.get(mint);
          const price = tokenPrices.get(mint) ?? null;
          const value = price ? amount * price : null;

          if (value) {
            totalValueUsd += value;
          }

          const symbol =
            meta?.offChainMetadata?.metadata?.symbol ??
            meta?.onChainMetadata?.metadata?.data?.symbol ??
            meta?.legacyMetadata?.symbol ??
            'UNKNOWN';

          const name =
            meta?.offChainMetadata?.metadata?.name ??
            meta?.onChainMetadata?.metadata?.data?.name ??
            meta?.legacyMetadata?.name ??
            'Unknown Token';

          const logoUrl = meta?.offChainMetadata?.metadata?.image ?? meta?.legacyMetadata?.logoURI;

          balances.push({
            symbol,
            name,
            chain: 'solana',
            contractAddress: mint,
            balanceRaw: info.tokenAmount.amount,
            balanceFormatted: amount,
            decimals: info.tokenAmount.decimals,
            priceUsd: price,
            valueUsd: value,
            logoUrl,
          });
        }

        // Sort by value descending
        balances.sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0));

        return { success: true, balances, totalValueUsd };
      } catch (error) {
        return {
          success: false,
          error: `Failed to fetch Solana balances: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    async getSolanaNfts(address: string): Promise<NftResult> {
      if (!this.heliusApiKey) {
        return { success: false, error: 'Helius API key not configured' };
      }

      try {
        const url = this.getHeliusUrl(`/addresses/${address}/nfts`);
        const response = await this.fetchWithTimeout(url);

        if (!response.ok) {
          return { success: false, error: `Helius API error: ${response.status}` };
        }

        const data = (await response.json()) as { nfts: HeliusNft[] };

        const nfts: NftAsset[] = (data.nfts ?? []).map((nft) => {
          const collection = nft.grouping?.find((g) => g.group_key === 'collection');

          return {
            id: nft.id,
            name: nft.content?.metadata?.name ?? `#${nft.id.slice(0, 8)}`,
            collection: collection?.collection_metadata?.name ?? collection?.group_value ?? 'Unknown',
            chain: 'solana',
            contractAddress: collection?.group_value ?? '',
            tokenId: nft.id,
            imageUrl: nft.content?.links?.image,
          };
        });

        return { success: true, nfts };
      } catch (error) {
        return {
          success: false,
          error: `Failed to fetch Solana NFTs: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    async getSolanaHistory(address: string, options?: { limit?: number; cursor?: string }): Promise<HistoryResult> {
      if (!this.heliusApiKey) {
        return { success: false, error: 'Helius API key not configured' };
      }

      try {
        let url = this.getHeliusUrl(`/addresses/${address}/transactions`);
        const limit = options?.limit ?? 20;

        // Add query params manually since getHeliusUrl already has ?api-key
        url += `&limit=${limit}`;
        if (options?.cursor) {
          url += `&before=${options.cursor}`;
        }

        const response = await this.fetchWithTimeout(url);

        if (!response.ok) {
          return { success: false, error: `Helius API error: ${response.status}` };
        }

        const data = (await response.json()) as HeliusTransaction[];

        const transactions: Transaction[] = data.map((tx) => {
          // Determine transaction type
          let type: Transaction['type'] = 'other';
          const txType = tx.type.toLowerCase();

          if (txType === 'transfer' || txType === 'sol_transfer') {
            // Check if this address is sender or receiver
            const isSender = tx.nativeTransfers?.some((t) => t.fromUserAccount === address);
            type = isSender ? 'send' : 'receive';
          } else if (txType === 'swap' || txType.includes('swap')) {
            type = 'swap';
          } else if (txType === 'token_transfer') {
            const isSender = tx.tokenTransfers?.some((t) => t.fromUserAccount === address);
            type = isSender ? 'send' : 'receive';
          }

          // Collect token transfers
          const tokens: Transaction['tokens'] = [];

          // Native SOL transfers
          if (tx.nativeTransfers) {
            for (const transfer of tx.nativeTransfers) {
              const direction = transfer.fromUserAccount === address ? 'out' : 'in';
              tokens.push({
                symbol: 'SOL',
                amount: transfer.amount / 1e9,
                direction,
              });
            }
          }

          // Token transfers
          if (tx.tokenTransfers) {
            for (const transfer of tx.tokenTransfers) {
              const direction = transfer.fromUserAccount === address ? 'out' : 'in';
              tokens.push({
                symbol: `${transfer.mint.slice(0, 6)}...`,
                amount: transfer.tokenAmount,
                direction,
              });
            }
          }

          return {
            id: tx.signature,
            hash: tx.signature,
            chain: 'solana' as const,
            timestamp: tx.timestamp,
            type,
            status: tx.transactionError ? 'failed' : 'success',
            from: tx.feePayer,
            to: tx.nativeTransfers?.[0]?.toUserAccount ?? '',
            fee: {
              amount: tx.fee / 1e9,
              symbol: 'SOL',
            },
            tokens: tokens.length > 0 ? tokens : undefined,
          };
        });

        // Use last transaction signature as cursor
        const lastTx = data[data.length - 1];
        const nextCursor = lastTx?.signature;

        return { success: true, transactions, nextCursor };
      } catch (error) {
        return {
          success: false,
          error: `Failed to fetch Solana history: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
  }

  return HeliusMixin;
}
