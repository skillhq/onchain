import type { Command } from 'commander';
import type { CliContext } from '../cli/shared.js';
import { getMissingCredentialsMessage, validateCredentials } from '../lib/credentials.js';
import { OnchainClient } from '../lib/onchain-client.js';
import type { EvmChain, Transaction } from '../lib/onchain-client-types.js';
import { getExplorerUrl, hyperlink } from '../lib/output.js';
import { isEvmAddress, isSolanaAddress, truncateAddress } from '../lib/utils/address.js';
import { formatChainName, formatRelativeTime, formatTokenAmount, formatUsd } from '../lib/utils/formatters.js';

export function registerHistoryCommand(program: Command, ctx: CliContext): void {
  program
    .command('history')
    .description('Get wallet transaction history')
    .argument('<address>', 'Wallet address (EVM 0x... or Solana)')
    .option('--chain <chain>', 'Filter by specific chain (for EVM wallets)')
    .option('-n, --limit <number>', 'Number of transactions to fetch', '20')
    .option('--cursor <cursor>', 'Pagination cursor')
    .option('--json', 'Output as JSON')
    .action(async (address: string, cmdOpts: { chain?: string; limit?: string; cursor?: string; json?: boolean }) => {
      const opts = program.opts();
      const timeoutMs = ctx.resolveTimeoutFromOptions(opts);
      const clientOpts = ctx.getClientOptions();
      clientOpts.timeoutMs = timeoutMs;

      // Detect chain type from address format
      let chainType: 'evm' | 'solana';
      if (isEvmAddress(address)) {
        chainType = 'evm';
      } else if (isSolanaAddress(address)) {
        chainType = 'solana';
      } else {
        console.error(`${ctx.p('err')}Invalid address format. Expected EVM (0x...) or Solana address.`);
        process.exit(1);
      }

      // Validate credentials
      const creds = ctx.resolveCredentials();
      const validation = validateCredentials(creds);

      const hasChainApi = chainType === 'evm' ? validation.hasDebank : validation.hasHelius;

      if (!validation.hasZerion && !hasChainApi) {
        const requiredCreds = chainType === 'evm' ? ['zerion', 'debank'] : ['zerion', 'helius'];
        console.error(
          `${ctx.p('err')}${getMissingCredentialsMessage(`${chainType === 'evm' ? 'EVM' : 'Solana'} wallet history`, requiredCreds)}`,
        );
        process.exit(1);
      }

      const client = new OnchainClient(clientOpts);
      const output = ctx.getOutput();
      const colors = ctx.colors;
      const limit = Number.parseInt(cmdOpts.limit ?? '20', 10);

      let transactions: Transaction[] = [];
      let nextCursor: string | undefined;
      let source: 'zerion' | 'api' = 'api';

      // Try Zerion first (unified provider)
      if (validation.hasZerion) {
        const result = await client.getZerionHistory(address, {
          limit,
          cursor: cmdOpts.cursor,
        });

        if (result.success) {
          transactions = result.transactions;
          nextCursor = result.nextCursor;
          source = 'zerion';
        } else if (hasChainApi) {
          console.error(colors.muted(`Zerion failed: ${result.error}, falling back to API...`));
        } else {
          console.error(`${ctx.p('err')}${result.error}`);
          process.exit(1);
        }
      }

      // Fall back to DeBank/Helius
      if (source === 'api') {
        if (chainType === 'evm') {
          const result = await client.getEvmHistory(address, {
            chain: cmdOpts.chain as EvmChain | undefined,
            limit,
            cursor: cmdOpts.cursor,
          });

          if (!result.success) {
            console.error(`${ctx.p('err')}${result.error}`);
            process.exit(1);
          }

          transactions = result.transactions;
          nextCursor = result.nextCursor;
        } else if (chainType === 'solana') {
          const result = await client.getSolanaHistory(address, {
            limit,
            cursor: cmdOpts.cursor,
          });

          if (!result.success) {
            console.error(`${ctx.p('err')}${result.error}`);
            process.exit(1);
          }

          transactions = result.transactions;
          nextCursor = result.nextCursor;
        }
      }

      if (cmdOpts.json || output.json) {
        ctx.outputJson({
          address,
          chainType,
          transactions,
          nextCursor,
        });
        return;
      }

      console.log();
      console.log(colors.section(`Transaction History`));
      console.log(colors.muted(`${address}`));
      if (source === 'zerion') {
        console.log(colors.muted('(via Zerion API)'));
      }
      console.log();

      if (transactions.length === 0) {
        console.log(colors.muted('No transactions found.'));
        console.log();
        return;
      }

      for (const tx of transactions) {
        // Type and status
        const typeLabel = tx.type.toUpperCase().padEnd(8);
        const statusColor =
          tx.status === 'success' ? colors.positive : tx.status === 'failed' ? colors.negative : colors.muted;
        const statusIcon = tx.status === 'success' ? '\u2713' : tx.status === 'failed' ? '\u2717' : '\u2026';

        console.log(
          `${statusColor(statusIcon)} ${colors.accent(typeLabel)} ${colors.muted(formatRelativeTime(tx.timestamp))}`,
        );

        // Chain and hash
        const explorerUrl = getExplorerUrl(tx.chain, 'tx', tx.hash);
        const hashDisplay = truncateAddress(tx.hash, 10, 6);
        console.log(`  ${formatChainName(tx.chain)} ${hyperlink(explorerUrl, hashDisplay, output)}`);

        // Token transfers
        if (tx.tokens && tx.tokens.length > 0) {
          for (const token of tx.tokens) {
            const directionSymbol = token.direction === 'in' ? colors.positive('+') : colors.negative('-');
            const amountStr = formatTokenAmount(token.amount);
            const valueStr = token.valueUsd ? ` (${formatUsd(token.valueUsd)})` : '';
            console.log(`  ${directionSymbol} ${amountStr} ${token.symbol}${colors.muted(valueStr)}`);
          }
        }

        // Fee
        if (tx.fee) {
          const feeValue = tx.fee.valueUsd ? ` (${formatUsd(tx.fee.valueUsd)})` : '';
          console.log(colors.muted(`  Fee: ${formatTokenAmount(tx.fee.amount)} ${tx.fee.symbol}${feeValue}`));
        }

        console.log();
      }

      if (nextCursor) {
        console.log(colors.muted(`Use --cursor "${nextCursor}" to see more transactions`));
        console.log();
      }
    });
}
