import type { AbstractConstructor, Mixin, OnchainClientBase } from '../onchain-client-base.js';
import type {
  EtherscanChain,
  GasEstimate,
  GasEstimateResult,
  InternalTransaction,
  MultiChainTxSearchResult,
  TokenTransfer,
  TransactionDetail,
  TransactionDetailResult,
} from '../onchain-client-types.js';

// Etherscan API v2 - single endpoint with chain IDs
// https://docs.etherscan.io/v2-migration
const ETHERSCAN_V2_API = 'https://api.etherscan.io/v2/api';

// Chain configuration for Etherscan v2 API
interface ChainConfig {
  chainId: number;
  explorerUrl: string;
  nativeSymbol: string;
  decimals: number;
}

const CHAIN_CONFIG: Record<EtherscanChain, ChainConfig> = {
  ethereum: {
    chainId: 1,
    explorerUrl: 'https://etherscan.io',
    nativeSymbol: 'ETH',
    decimals: 18,
  },
  polygon: {
    chainId: 137,
    explorerUrl: 'https://polygonscan.com',
    nativeSymbol: 'POL',
    decimals: 18,
  },
  bsc: {
    chainId: 56,
    explorerUrl: 'https://bscscan.com',
    nativeSymbol: 'BNB',
    decimals: 18,
  },
  arbitrum: {
    chainId: 42161,
    explorerUrl: 'https://arbiscan.io',
    nativeSymbol: 'ETH',
    decimals: 18,
  },
  base: {
    chainId: 8453,
    explorerUrl: 'https://basescan.org',
    nativeSymbol: 'ETH',
    decimals: 18,
  },
  optimism: {
    chainId: 10,
    explorerUrl: 'https://optimistic.etherscan.io',
    nativeSymbol: 'ETH',
    decimals: 18,
  },
  avalanche: {
    chainId: 43114,
    explorerUrl: 'https://snowtrace.io',
    nativeSymbol: 'AVAX',
    decimals: 18,
  },
  fantom: {
    chainId: 250,
    explorerUrl: 'https://ftmscan.com',
    nativeSymbol: 'FTM',
    decimals: 18,
  },
};

// Default chain search order (prioritized by usage)
const DEFAULT_CHAIN_ORDER: EtherscanChain[] = [
  'ethereum',
  'arbitrum',
  'base',
  'polygon',
  'optimism',
  'bsc',
  'avalanche',
  'fantom',
];

export interface EtherscanMethods {
  getEvmTransaction(hash: string, chain: EtherscanChain): Promise<TransactionDetailResult>;
  getEvmTokenTransfers(hash: string, chain: EtherscanChain): Promise<TokenTransfer[]>;
  getEvmInternalTransactions(hash: string, chain: EtherscanChain): Promise<InternalTransaction[]>;
  findEvmTransaction(hash: string, preferredChains?: EtherscanChain[]): Promise<MultiChainTxSearchResult>;
  getGasEstimate(chain: EtherscanChain): Promise<GasEstimateResult>;
}

// Etherscan API response types
interface EtherscanTokenTxResponse {
  status: string;
  message: string;
  result?: Array<{
    blockNumber: string;
    timeStamp: string;
    hash: string;
    from: string;
    to: string;
    value: string;
    tokenName: string;
    tokenSymbol: string;
    tokenDecimal: string;
    contractAddress: string;
  }>;
}

interface EtherscanInternalTxResponse {
  status: string;
  message: string;
  result?: Array<{
    blockNumber: string;
    timeStamp: string;
    hash: string;
    from: string;
    to: string;
    value: string;
    gas: string;
    gasUsed: string;
    isError: string;
    type: string;
    traceId: string;
  }>;
}

export function withEtherscan<TBase extends AbstractConstructor<OnchainClientBase>>(
  Base: TBase,
): Mixin<TBase, EtherscanMethods> {
  abstract class EtherscanMixin extends Base implements EtherscanMethods {
    private buildEtherscanUrl(chain: EtherscanChain, params: Record<string, string>): string {
      const config = CHAIN_CONFIG[chain];
      const urlParams = new URLSearchParams(params);

      // Etherscan v2 API requires chainid parameter
      urlParams.set('chainid', config.chainId.toString());

      // API key is required for v2 API
      if (this.etherscanApiKey) {
        urlParams.set('apikey', this.etherscanApiKey);
      }

      return `${ETHERSCAN_V2_API}?${urlParams.toString()}`;
    }

    async getEvmTransaction(hash: string, chain: EtherscanChain): Promise<TransactionDetailResult> {
      if (!this.etherscanApiKey) {
        return {
          success: false,
          error: 'Etherscan API key not configured. Run `onchain setup` or set ETHERSCAN_API_KEY environment variable.',
        };
      }

      try {
        const config = CHAIN_CONFIG[chain];

        // Fetch transaction details
        const txUrl = this.buildEtherscanUrl(chain, {
          module: 'proxy',
          action: 'eth_getTransactionByHash',
          txhash: hash,
        });

        const txResponse = await this.fetchWithTimeout(txUrl);
        if (!txResponse.ok) {
          return { success: false, error: `API error: ${txResponse.status}` };
        }

        const txData = (await txResponse.json()) as {
          result?: {
            blockNumber: string;
            from: string;
            to: string | null;
            value: string;
            gas: string;
            gasPrice: string;
            input: string;
          };
        };

        if (!txData.result) {
          return { success: false, error: 'Transaction not found' };
        }

        const tx = txData.result;

        // Fetch transaction receipt for status and gas used
        const receiptUrl = this.buildEtherscanUrl(chain, {
          module: 'proxy',
          action: 'eth_getTransactionReceipt',
          txhash: hash,
        });

        let receipt: { status: string; gasUsed: string; blockNumber: string } | undefined;
        const receiptResponse = await this.fetchWithTimeout(receiptUrl);
        if (receiptResponse.ok) {
          const receiptData = (await receiptResponse.json()) as {
            result?: { status: string; gasUsed: string; blockNumber: string };
          };
          receipt = receiptData.result;
        }

        // Fetch block for timestamp
        let timestamp = Math.floor(Date.now() / 1000);
        if (tx.blockNumber) {
          const blockUrl = this.buildEtherscanUrl(chain, {
            module: 'proxy',
            action: 'eth_getBlockByNumber',
            tag: tx.blockNumber,
            boolean: 'false',
          });

          const blockResponse = await this.fetchWithTimeout(blockUrl);
          if (blockResponse.ok) {
            const blockData = (await blockResponse.json()) as {
              result?: { timestamp: string };
            };

            if (blockData.result?.timestamp) {
              timestamp = Number.parseInt(blockData.result.timestamp, 16);
            }
          }
        }

        // Parse values
        const blockNumber = tx.blockNumber ? Number.parseInt(tx.blockNumber, 16) : 0;
        const value = tx.value ? BigInt(tx.value).toString() : '0';
        const valueFormatted = Number(value) / 10 ** config.decimals;
        const gasPrice = tx.gasPrice ? BigInt(tx.gasPrice).toString() : '0';
        const gasUsed = receipt?.gasUsed ? Number.parseInt(receipt.gasUsed, 16) : undefined;
        const gasLimit = tx.gas ? Number.parseInt(tx.gas, 16) : undefined;

        // Calculate fee
        const feeWei = gasUsed && gasPrice ? BigInt(gasUsed) * BigInt(gasPrice) : BigInt(0);
        const feeAmount = Number(feeWei) / 10 ** config.decimals;

        // Determine status
        // Pre-Byzantium transactions (before Oct 2017) don't have status field
        // If receipt exists with blockNumber, transaction was included (success)
        let status: 'success' | 'failed' | 'pending' = 'pending';
        if (receipt?.status) {
          status = receipt.status === '0x1' ? 'success' : 'failed';
        } else if (receipt?.blockNumber) {
          // Pre-Byzantium: receipt exists means transaction succeeded
          status = 'success';
        }

        // Extract method ID and name from input
        const methodId = tx.input && tx.input.length >= 10 ? tx.input.slice(0, 10) : undefined;

        // Fetch token transfers
        const tokenTransfers = await this.getEvmTokenTransfers(hash, chain);

        const transaction: TransactionDetail = {
          hash,
          chain,
          blockNumber,
          timestamp,
          status,
          from: tx.from,
          to: tx.to,
          value,
          valueFormatted,
          fee: {
            amount: feeAmount,
            symbol: config.nativeSymbol,
          },
          gasUsed,
          gasLimit,
          gasPrice,
          methodId,
          tokenTransfers: tokenTransfers.length > 0 ? tokenTransfers : undefined,
          explorerUrl: `${config.explorerUrl}/tx/${hash}`,
        };

        return { success: true, transaction };
      } catch (error) {
        return {
          success: false,
          error: `Failed to fetch transaction: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    async getEvmTokenTransfers(hash: string, chain: EtherscanChain): Promise<TokenTransfer[]> {
      try {
        // Fetch ERC20 transfers
        const erc20Url = this.buildEtherscanUrl(chain, {
          module: 'account',
          action: 'tokentx',
          txhash: hash,
        });

        const erc20Response = await this.fetchWithTimeout(erc20Url);
        const erc20Data = (await erc20Response.json()) as EtherscanTokenTxResponse;

        const transfers: TokenTransfer[] = [];

        if (erc20Data.result && Array.isArray(erc20Data.result)) {
          for (const transfer of erc20Data.result) {
            const decimals = Number.parseInt(transfer.tokenDecimal, 10) || 18;
            transfers.push({
              tokenType: 'ERC20',
              contractAddress: transfer.contractAddress,
              from: transfer.from,
              to: transfer.to,
              amount: transfer.value,
              amountFormatted: Number(transfer.value) / 10 ** decimals,
              symbol: transfer.tokenSymbol,
              decimals,
            });
          }
        }

        // Fetch ERC721 (NFT) transfers
        const erc721Url = this.buildEtherscanUrl(chain, {
          module: 'account',
          action: 'tokennfttx',
          txhash: hash,
        });

        const erc721Response = await this.fetchWithTimeout(erc721Url);
        const erc721Data = (await erc721Response.json()) as {
          status: string;
          result?: Array<{
            contractAddress: string;
            from: string;
            to: string;
            tokenID: string;
            tokenName: string;
            tokenSymbol: string;
          }>;
        };

        if (erc721Data.result && Array.isArray(erc721Data.result)) {
          for (const transfer of erc721Data.result) {
            transfers.push({
              tokenType: 'ERC721',
              contractAddress: transfer.contractAddress,
              from: transfer.from,
              to: transfer.to,
              tokenId: transfer.tokenID,
              symbol: transfer.tokenSymbol,
            });
          }
        }

        return transfers;
      } catch {
        // Return empty array on error - token transfers are optional
        return [];
      }
    }

    async getEvmInternalTransactions(hash: string, chain: EtherscanChain): Promise<InternalTransaction[]> {
      try {
        const config = CHAIN_CONFIG[chain];
        const url = this.buildEtherscanUrl(chain, {
          module: 'account',
          action: 'txlistinternal',
          txhash: hash,
        });

        const response = await this.fetchWithTimeout(url);
        const data = (await response.json()) as EtherscanInternalTxResponse;

        if (!data.result || !Array.isArray(data.result)) {
          return [];
        }

        return data.result.map((tx) => ({
          from: tx.from,
          to: tx.to,
          value: tx.value,
          valueFormatted: Number(tx.value) / 10 ** config.decimals,
          type: tx.type,
          gasUsed: tx.gasUsed ? Number.parseInt(tx.gasUsed, 10) : undefined,
          isError: tx.isError === '1',
        }));
      } catch {
        return [];
      }
    }

    async findEvmTransaction(hash: string, preferredChains?: EtherscanChain[]): Promise<MultiChainTxSearchResult> {
      const chains = preferredChains ?? DEFAULT_CHAIN_ORDER;
      const triedChains: EtherscanChain[] = [];

      for (const chain of chains) {
        triedChains.push(chain);
        const result = await this.getEvmTransaction(hash, chain);

        if (result.success) {
          return {
            success: true,
            transaction: result.transaction,
            chain,
          };
        }

        // If we got "Transaction not found", try next chain
        // If we got a different error (rate limit, etc.), still try next chain
        // but note the error
      }

      return {
        success: false,
        error: `Transaction not found on any chain. Tried: ${triedChains.join(', ')}`,
        triedChains,
      };
    }

    async getGasEstimate(chain: EtherscanChain): Promise<GasEstimateResult> {
      if (!this.etherscanApiKey) {
        return {
          success: false,
          error: 'Etherscan API key not configured. Run `onchain setup` or set ETHERSCAN_API_KEY environment variable.',
        };
      }

      try {
        const url = this.buildEtherscanUrl(chain, {
          module: 'gastracker',
          action: 'gasoracle',
        });

        const response = await this.fetchWithTimeout(url);
        if (!response.ok) {
          return { success: false, error: `API error: ${response.status}` };
        }

        const data = (await response.json()) as {
          status: string;
          message: string;
          result?: {
            SafeGasPrice: string;
            ProposeGasPrice: string;
            FastGasPrice: string;
            suggestBaseFee?: string;
            gasUsedRatio?: string;
          };
        };

        if (data.status !== '1' || !data.result) {
          return { success: false, error: data.message || 'Failed to fetch gas estimate' };
        }

        const gas: GasEstimate = {
          chain,
          safeGasPrice: Number.parseFloat(data.result.SafeGasPrice),
          proposeGasPrice: Number.parseFloat(data.result.ProposeGasPrice),
          fastGasPrice: Number.parseFloat(data.result.FastGasPrice),
          suggestBaseFee: data.result.suggestBaseFee ? Number.parseFloat(data.result.suggestBaseFee) : undefined,
          gasUsedRatio: data.result.gasUsedRatio,
        };

        return { success: true, gas };
      } catch (error) {
        return {
          success: false,
          error: `Failed to fetch gas estimate: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
  }

  return EtherscanMixin;
}
