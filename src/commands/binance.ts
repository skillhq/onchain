import type { Command } from 'commander';
import type { CliContext } from '../cli/shared.js';
import { getMissingCredentialsMessage, validateCredentials } from '../lib/credentials.js';
import { OnchainClient } from '../lib/onchain-client.js';
import { formatRelativeTime, formatTokenAmount, formatUsd } from '../lib/utils/formatters.js';

export function registerBinanceCommands(program: Command, ctx: CliContext): void {
  const binance = program.command('binance').description('Binance exchange commands');

  binance
    .command('balance')
    .description('Get Binance account balances')
    .option('--min-value <usd>', 'Minimum USD value to show', '0')
    .option('--json', 'Output as JSON')
    .action(async (cmdOpts: { minValue?: string; json?: boolean }) => {
      const opts = program.opts();
      const timeoutMs = ctx.resolveTimeoutFromOptions(opts);
      const clientOpts = ctx.getClientOptions();
      clientOpts.timeoutMs = timeoutMs;

      // Validate credentials
      const creds = ctx.resolveCredentials();
      const validation = validateCredentials(creds);

      if (!validation.hasBinance) {
        console.error(`${ctx.p('err')}${getMissingCredentialsMessage('Binance', ['binance'])}`);
        process.exit(1);
      }

      const client = new OnchainClient(clientOpts);
      const result = await client.getBinanceBalances();

      if (!result.success) {
        console.error(`${ctx.p('err')}${result.error}`);
        process.exit(1);
      }

      const output = ctx.getOutput();
      const colors = ctx.colors;

      // Apply filters
      const minValue = Number.parseFloat(cmdOpts.minValue ?? '0');
      const filteredBalances = result.balances.filter((b) => (b.valueUsd ?? 0) >= minValue);

      if (cmdOpts.json || output.json) {
        ctx.outputJson({
          exchange: 'binance',
          totalValueUsd: result.totalValueUsd,
          balances: filteredBalances,
        });
        return;
      }

      console.log();
      console.log(colors.section('Binance Balance'));
      console.log();

      if (filteredBalances.length === 0) {
        console.log(colors.muted('No assets found with value above minimum threshold.'));
        console.log();
        return;
      }

      console.log(`${'Asset'.padEnd(10)} ${'Free'.padStart(14)} ${'Locked'.padStart(14)} ${'Value'.padStart(14)}`);
      console.log('-'.repeat(56));

      for (const balance of filteredBalances) {
        const asset = balance.asset.padEnd(10);
        const free = formatTokenAmount(balance.free).padStart(14);
        const locked = formatTokenAmount(balance.locked).padStart(14);
        const value = balance.valueUsd !== undefined ? formatUsd(balance.valueUsd).padStart(14) : '-'.padStart(14);

        const lockedDisplay = balance.locked > 0 ? colors.muted(locked) : locked;
        console.log(`${asset} ${free} ${lockedDisplay} ${value}`);
      }

      console.log('-'.repeat(56));
      console.log(
        `${'Total'.padEnd(10)} ${' '.padStart(14)} ${' '.padStart(14)} ${formatUsd(result.totalValueUsd).padStart(14)}`,
      );
      console.log();
    });

  binance
    .command('history')
    .description('Get Binance trade history')
    .option('--symbol <symbol>', 'Trading pair (e.g., BTCUSDT)')
    .option('-n, --limit <number>', 'Number of trades to fetch', '50')
    .option('--cursor <cursor>', 'Pagination cursor (trade ID)')
    .option('--json', 'Output as JSON')
    .action(async (cmdOpts: { symbol?: string; limit?: string; cursor?: string; json?: boolean }) => {
      const opts = program.opts();
      const timeoutMs = ctx.resolveTimeoutFromOptions(opts);
      const clientOpts = ctx.getClientOptions();
      clientOpts.timeoutMs = timeoutMs;

      // Validate credentials
      const creds = ctx.resolveCredentials();
      const validation = validateCredentials(creds);

      if (!validation.hasBinance) {
        console.error(`${ctx.p('err')}${getMissingCredentialsMessage('Binance', ['binance'])}`);
        process.exit(1);
      }

      const client = new OnchainClient(clientOpts);
      const limit = Number.parseInt(cmdOpts.limit ?? '50', 10);

      const result = await client.getBinanceHistory({
        symbol: cmdOpts.symbol,
        limit,
        cursor: cmdOpts.cursor,
      });

      if (!result.success) {
        console.error(`${ctx.p('err')}${result.error}`);
        process.exit(1);
      }

      const output = ctx.getOutput();
      const colors = ctx.colors;

      if (cmdOpts.json || output.json) {
        ctx.outputJson({
          exchange: 'binance',
          trades: result.trades,
          nextCursor: result.nextCursor,
        });
        return;
      }

      console.log();
      console.log(colors.section('Binance Trade History'));
      console.log();

      if (result.trades.length === 0) {
        console.log(colors.muted('No trades found.'));
        console.log();
        return;
      }

      for (const trade of result.trades) {
        const sideColor = trade.side === 'buy' ? colors.positive : colors.negative;
        const sideLabel = sideColor(trade.side.toUpperCase().padEnd(4));

        console.log(`${sideLabel} ${trade.symbol}`);
        console.log(`  ${formatTokenAmount(trade.quantity)} @ ${formatUsd(trade.price)} = ${formatUsd(trade.total)}`);
        if (trade.fee && trade.feeAsset) {
          console.log(colors.muted(`  Fee: ${formatTokenAmount(trade.fee)} ${trade.feeAsset}`));
        }
        console.log(colors.muted(`  ${formatRelativeTime(trade.timestamp)}`));
        console.log();
      }

      if (result.nextCursor) {
        console.log(colors.muted(`Use --cursor "${result.nextCursor}" to see more trades`));
        console.log();
      }
    });
}
