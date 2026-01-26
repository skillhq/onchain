import type { AbstractConstructor, Mixin, OnchainClientBase } from '../onchain-client-base.js';
import type { TokenTransfer, TransactionDetail, TransactionDetailResult } from '../onchain-client-types.js';

// Solscan Pro API v2.0
const SOLSCAN_API_BASE = 'https://pro-api.solscan.io/v2.0';
const SOLSCAN_EXPLORER_URL = 'https://solscan.io';

export interface SolscanMethods {
  getSolanaTransaction(signature: string): Promise<TransactionDetailResult>;
}

// Solscan API response types
interface SolscanTxResponse {
  success: boolean;
  data?: {
    tx_hash: string;
    block_id: number;
    block_time: number;
    status: string;
    fee: number;
    signer: string[];
    sol_bal_change?: Array<{
      address: string;
      pre_balance: number;
      post_balance: number;
      change_amount: number;
    }>;
    token_bal_change?: Array<{
      address: string;
      pre_balance: string;
      post_balance: string;
      change_amount: string;
      change_type: string;
      token_address: string;
      token_decimals: number;
      token_name?: string;
      token_symbol?: string;
    }>;
    parsed_instructions?: Array<{
      program_id: string;
      type: string;
      data?: Record<string, unknown>;
    }>;
  };
  errors?: unknown;
}

export function withSolscan<TBase extends AbstractConstructor<OnchainClientBase>>(
  Base: TBase,
): Mixin<TBase, SolscanMethods> {
  abstract class SolscanMixin extends Base implements SolscanMethods {
    async getSolanaTransaction(signature: string): Promise<TransactionDetailResult> {
      if (!this.solscanApiKey) {
        return {
          success: false,
          error: 'Solscan API key not configured. Run `onchain setup` or set SOLSCAN_API_KEY environment variable.',
        };
      }

      try {
        const url = `${SOLSCAN_API_BASE}/transaction/detail?tx=${signature}`;
        const response = await this.fetchWithTimeout(url, {
          headers: {
            ...this.getJsonHeaders(),
            token: this.solscanApiKey,
          },
        });

        if (!response.ok) {
          if (response.status === 401) {
            return { success: false, error: 'Invalid Solscan API key' };
          }
          return { success: false, error: `Solscan API error: ${response.status}` };
        }

        const data = (await response.json()) as SolscanTxResponse;

        if (!data.success || !data.data) {
          return { success: false, error: 'Transaction not found' };
        }

        const tx = data.data;

        // Parse token transfers
        const tokenTransfers: TokenTransfer[] = [];

        if (tx.token_bal_change && Array.isArray(tx.token_bal_change)) {
          for (const change of tx.token_bal_change) {
            // Only include outgoing transfers (negative change)
            const changeAmount = Number(change.change_amount);
            if (changeAmount !== 0) {
              tokenTransfers.push({
                tokenType: 'SPL',
                contractAddress: change.token_address,
                from: changeAmount < 0 ? change.address : '',
                to: changeAmount > 0 ? change.address : '',
                amount: Math.abs(changeAmount).toString(),
                amountFormatted: Math.abs(changeAmount) / 10 ** (change.token_decimals || 9),
                symbol: change.token_symbol,
                decimals: change.token_decimals,
              });
            }
          }
        }

        // Calculate native SOL transfer value
        let valueFormatted = 0;
        const from = tx.signer[0] || '';
        let to: string | null = null;

        if (tx.sol_bal_change && Array.isArray(tx.sol_bal_change)) {
          // Find the main sender (largest negative change that's not just fee)
          const senderChange = tx.sol_bal_change.find((c) => c.change_amount < 0 && c.address === from);

          // Find the main receiver (largest positive change)
          const receiverChange = tx.sol_bal_change.find((c) => c.change_amount > 0 && c.address !== from);

          if (receiverChange) {
            to = receiverChange.address;
            valueFormatted = receiverChange.change_amount / 1e9;
          } else if (senderChange) {
            // If no receiver found, the value sent might be the fee + other costs
            valueFormatted = Math.abs(senderChange.change_amount + tx.fee) / 1e9;
          }
        }

        const transaction: TransactionDetail = {
          hash: signature,
          chain: 'solana',
          blockNumber: tx.block_id,
          timestamp: tx.block_time,
          status: tx.status === 'Success' ? 'success' : 'failed',
          from,
          to,
          value: Math.round(valueFormatted * 1e9).toString(),
          valueFormatted,
          fee: {
            amount: tx.fee / 1e9,
            symbol: 'SOL',
          },
          tokenTransfers: tokenTransfers.length > 0 ? tokenTransfers : undefined,
          explorerUrl: `${SOLSCAN_EXPLORER_URL}/tx/${signature}`,
        };

        return { success: true, transaction };
      } catch (error) {
        return {
          success: false,
          error: `Failed to fetch Solana transaction: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
  }

  return SolscanMixin;
}
