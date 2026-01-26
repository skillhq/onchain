import type { Command } from 'commander';
import type { CliContext } from '../cli/shared.js';
import type { EtherscanChain, TransactionDetail } from '../lib/onchain-client.js';
import { OnchainClient } from '../lib/onchain-client.js';
import { formatChainName, formatRelativeTime, formatTimestamp, formatTokenAmount } from '../lib/utils/formatters.js';
import { parseTxInput, truncateHash } from '../lib/utils/tx-hash.js';

const VALID_CHAINS: EtherscanChain[] = [
  'ethereum',
  'polygon',
  'bsc',
  'arbitrum',
  'base',
  'optimism',
  'avalanche',
  'fantom',
];

function formatAddress(address: string | null, full = false): string {
  if (!address) {
    return '-';
  }
  return full ? address : truncateHash(address, 6);
}

function formatGasPercent(used: number | undefined, limit: number | undefined): string {
  if (!used || !limit) {
    return '';
  }
  const percent = Math.round((used / limit) * 100);
  return ` (${percent}%)`;
}

export function registerTxCommand(program: Command, ctx: CliContext): void {
  program
    .command('tx')
    .description('Get transaction details by hash/signature or explorer URL')
    .argument('<hash>', 'Transaction hash, signature, or block explorer URL')
    .option('-c, --chain <chain>', `EVM chain to query (${VALID_CHAINS.join(', ')})`)
    .option('--json', 'Output as JSON')
    .option('-v, --verbose', 'Show additional details (internal transactions)')
    .action(
      async (
        input: string,
        cmdOpts: {
          chain?: string;
          json?: boolean;
          verbose?: boolean;
        },
      ) => {
        const opts = program.opts();
        const timeoutMs = ctx.resolveTimeoutFromOptions(opts);
        const clientOpts = ctx.getClientOptions();
        clientOpts.timeoutMs = timeoutMs;

        const client = new OnchainClient(clientOpts);
        const output = ctx.getOutput();
        const colors = ctx.colors;

        // Parse input (handles both raw hashes and explorer URLs)
        const parsed = parseTxInput(input);

        if (parsed.type === 'unknown') {
          console.error(`${ctx.p('err')}Invalid transaction hash or URL format`);
          console.error(
            `${ctx.p('hint')}Supported: EVM hashes (0x...), Solana signatures, or explorer URLs (etherscan, basescan, solscan, etc.)`,
          );
          process.exit(1);
        }

        const hash = parsed.hash;
        // Use chain from URL if detected, unless --chain flag overrides
        const chainFromUrl = parsed.chain && parsed.chain !== 'solana' ? parsed.chain : undefined;

        let transaction: TransactionDetail | undefined;

        if (parsed.type === 'solana') {
          // Solana transaction
          const result = await client.getSolanaTransaction(hash);

          if (!result.success) {
            console.error(`${ctx.p('err')}${result.error}`);
            process.exit(1);
          }

          transaction = result.transaction;
        } else {
          // EVM transaction
          // Priority: --chain flag > chain from URL > auto-detect
          const explicitChain = cmdOpts.chain?.toLowerCase() as EtherscanChain | undefined;

          if (explicitChain) {
            if (!VALID_CHAINS.includes(explicitChain)) {
              console.error(`${ctx.p('err')}Invalid chain: ${cmdOpts.chain}`);
              console.error(`${ctx.p('hint')}Valid chains: ${VALID_CHAINS.join(', ')}`);
              process.exit(1);
            }

            const result = await client.getEvmTransaction(hash, explicitChain);

            if (!result.success) {
              console.error(`${ctx.p('err')}${result.error}`);
              process.exit(1);
            }

            transaction = result.transaction;
          } else if (chainFromUrl) {
            // Chain detected from URL
            const result = await client.getEvmTransaction(hash, chainFromUrl);

            if (!result.success) {
              console.error(`${ctx.p('err')}${result.error}`);
              process.exit(1);
            }

            transaction = result.transaction;
          } else {
            // Auto-detect chain by searching
            console.log(`${ctx.p('info')}Searching for transaction across chains...`);

            const result = await client.findEvmTransaction(hash);

            if (!result.success) {
              console.error(`${ctx.p('err')}${result.error}`);
              process.exit(1);
            }

            transaction = result.transaction;
            console.log(`${ctx.p('ok')}Found on ${formatChainName(result.chain)}`);
          }

          // Fetch internal transactions if verbose mode
          if (cmdOpts.verbose && transaction) {
            const internals = await client.getEvmInternalTransactions(hash, transaction.chain as EtherscanChain);
            if (internals.length > 0) {
              transaction.internalTransactions = internals;
            }
          }
        }

        if (!transaction) {
          console.error(`${ctx.p('err')}Transaction not found`);
          process.exit(1);
        }

        // JSON output
        if (cmdOpts.json || output.json) {
          ctx.outputJson(transaction);
          return;
        }

        // Human-readable output
        console.log();
        console.log(colors.section('Transaction Details'));
        console.log();

        // Status
        const statusEmoji = output.emoji
          ? transaction.status === 'success'
            ? '\u2713 '
            : transaction.status === 'failed'
              ? '\u2717 '
              : '\u25cb '
          : '';
        const statusColor =
          transaction.status === 'success'
            ? colors.positive
            : transaction.status === 'failed'
              ? colors.negative
              : colors.muted;
        console.log(`${statusEmoji}Status: ${statusColor(transaction.status.toUpperCase())}`);

        // Basic info
        console.log(`  Hash:  ${colors.muted(transaction.hash)}`);
        console.log(`  Chain: ${formatChainName(transaction.chain)}`);
        console.log(`  Block: ${transaction.blockNumber.toLocaleString()}`);
        console.log(
          `  Time:  ${formatTimestamp(transaction.timestamp, { includeTime: true })} (${formatRelativeTime(transaction.timestamp)})`,
        );

        // Addresses
        console.log();
        console.log(colors.section('Addresses'));
        console.log(`  From: ${formatAddress(transaction.from, true)}`);
        console.log(`  To:   ${formatAddress(transaction.to, true)}`);

        // Value & Fee
        console.log();
        console.log(colors.section('Value & Fee'));

        const nativeSymbol = transaction.fee.symbol;
        if (transaction.valueFormatted > 0) {
          console.log(`  Value: ${formatTokenAmount(transaction.valueFormatted)} ${nativeSymbol}`);
        } else {
          console.log(`  Value: 0 ${nativeSymbol}`);
        }

        console.log(`  Fee:   ${formatTokenAmount(transaction.fee.amount, { decimals: 6 })} ${nativeSymbol}`);

        if (transaction.gasUsed !== undefined) {
          const gasInfo = transaction.gasLimit
            ? `${transaction.gasUsed.toLocaleString()} / ${transaction.gasLimit.toLocaleString()}${formatGasPercent(transaction.gasUsed, transaction.gasLimit)}`
            : transaction.gasUsed.toLocaleString();
          console.log(`  Gas:   ${gasInfo}`);
        }

        // Method (if available)
        if (transaction.methodId) {
          console.log();
          console.log(colors.section('Method'));
          console.log(`  ID: ${transaction.methodId}`);
          if (transaction.methodName) {
            console.log(`  Name: ${transaction.methodName}`);
          }
        }

        // Token Transfers
        if (transaction.tokenTransfers && transaction.tokenTransfers.length > 0) {
          console.log();
          console.log(colors.section('Token Transfers'));

          for (const transfer of transaction.tokenTransfers) {
            const amount =
              transfer.amountFormatted !== undefined ? formatTokenAmount(transfer.amountFormatted) : transfer.amount;

            const symbol = transfer.symbol ?? truncateHash(transfer.contractAddress, 4);

            if (transfer.tokenType === 'ERC721' || transfer.tokenType === 'ERC1155') {
              // NFT transfer
              const tokenId = transfer.tokenId ?? '?';
              console.log(`  ${symbol} #${tokenId}`);
            } else {
              // Fungible token transfer
              console.log(`  ${amount} ${symbol}`);
            }

            console.log(`    ${formatAddress(transfer.from)} ${colors.muted('->')} ${formatAddress(transfer.to)}`);
          }
        }

        // Internal Transactions (verbose mode)
        if (cmdOpts.verbose && transaction.internalTransactions && transaction.internalTransactions.length > 0) {
          console.log();
          console.log(colors.section('Internal Transactions'));

          for (const internal of transaction.internalTransactions) {
            const statusIcon = internal.isError ? colors.negative('\u2717') : colors.positive('\u2713');
            console.log(`  ${statusIcon} ${formatTokenAmount(internal.valueFormatted)} ${nativeSymbol}`);
            console.log(
              `    ${formatAddress(internal.from)} ${colors.muted('->')} ${formatAddress(internal.to)} (${internal.type})`,
            );
          }
        }

        // Explorer link
        if (transaction.explorerUrl) {
          console.log();
          console.log(`${ctx.l('url')}${transaction.explorerUrl}`);
        }

        console.log();
      },
    );
}
