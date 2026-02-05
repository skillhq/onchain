import type { Command } from 'commander';
import type { CliContext } from '../cli/shared.js';
import { OnchainClient } from '../lib/onchain-client.js';
import type { SupportedChain } from '../lib/onchain-client-types.js';
import { formatCompactUsd, formatPercent, formatUsd } from '../lib/utils/formatters.js';

export function registerNansenCommands(program: Command, ctx: CliContext): void {
  const nansen = program.command('nansen').description('Nansen analytics commands (requires nansen CLI)');

  // Labels command
  nansen
    .command('labels')
    .description('Get wallet labels and entity information')
    .argument('<address>', 'Wallet address')
    .option('--chain <chain>', 'Blockchain (ethereum, solana, base, etc.)', 'ethereum')
    .option('--json', 'Output as JSON')
    .action(async (address: string, cmdOpts: { chain?: string; json?: boolean }) => {
      const opts = program.opts();
      const timeoutMs = ctx.resolveTimeoutFromOptions(opts);
      const clientOpts = ctx.getClientOptions();
      clientOpts.timeoutMs = timeoutMs;

      const client = new OnchainClient(clientOpts);

      if (!client.isNansenAvailable()) {
        console.error(`${ctx.p('err')}Nansen CLI not installed. Install it with: npm install -g nansen`);
        process.exit(1);
      }

      const chain = (cmdOpts.chain ?? 'ethereum') as SupportedChain;
      const result = await client.getNansenLabels(address, chain);

      if (!result.success) {
        console.error(`${ctx.p('err')}${result.error}`);
        process.exit(1);
      }

      const output = ctx.getOutput();
      const colors = ctx.colors;

      if (cmdOpts.json || output.json) {
        ctx.outputJson({
          address,
          chain,
          entity: result.entity,
          labels: result.labels,
        });
        return;
      }

      console.log();
      console.log(colors.section('Wallet Labels'));
      console.log(colors.muted(address));
      console.log();

      if (result.entity) {
        console.log(`${colors.accent('Entity:')} ${result.entity}`);
        console.log();
      }

      if (result.labels.length === 0) {
        console.log(colors.muted('No labels found for this address.'));
        console.log();
        return;
      }

      // Group labels by category
      const byCategory = new Map<string, typeof result.labels>();
      for (const label of result.labels) {
        const category = label.category || 'other';
        const categoryLabels = byCategory.get(category) ?? [];
        categoryLabels.push(label);
        byCategory.set(category, categoryLabels);
      }

      for (const [category, labels] of byCategory) {
        console.log(colors.muted(`[${category}]`));
        for (const label of labels) {
          const smartMoneyBadge = label.isSmartMoney ? colors.accent(' [SM]') : '';
          console.log(`  ${label.label}${smartMoneyBadge}`);
          if (label.definition) {
            console.log(`    ${colors.muted(label.definition)}`);
          }
        }
        console.log();
      }
    });

  // Smart Money Holdings command
  nansen
    .command('smart-money')
    .description('Get Smart Money token holdings')
    .option('--chain <chain>', 'Blockchain (ethereum, solana, base, etc.)', 'solana')
    .option('-n, --limit <number>', 'Number of tokens to show', '20')
    .option('--json', 'Output as JSON')
    .action(async (cmdOpts: { chain?: string; limit?: string; json?: boolean }) => {
      const opts = program.opts();
      const timeoutMs = ctx.resolveTimeoutFromOptions(opts);
      const clientOpts = ctx.getClientOptions();
      clientOpts.timeoutMs = timeoutMs;

      const client = new OnchainClient(clientOpts);

      if (!client.isNansenAvailable()) {
        console.error(`${ctx.p('err')}Nansen CLI not installed. Install it with: npm install -g nansen`);
        process.exit(1);
      }

      const chain = (cmdOpts.chain ?? 'solana') as SupportedChain;
      const limit = Number.parseInt(cmdOpts.limit ?? '20', 10);

      const result = await client.getNansenSmartMoneyHoldings(chain, { limit });

      if (!result.success) {
        console.error(`${ctx.p('err')}${result.error}`);
        process.exit(1);
      }

      const output = ctx.getOutput();
      const colors = ctx.colors;

      if (cmdOpts.json || output.json) {
        ctx.outputJson({
          chain,
          holdings: result.holdings,
        });
        return;
      }

      console.log();
      console.log(colors.section(`Smart Money Holdings (${chain})`));
      console.log();

      if (result.holdings.length === 0) {
        console.log(colors.muted('No Smart Money holdings found.'));
        console.log();
        return;
      }

      // Header
      console.log(
        `${'Symbol'.padEnd(12)} ${'Value'.padStart(14)} ${'24h'.padStart(10)} ${'Holders'.padStart(8)} ${'MCap'.padStart(12)} ${'Age'.padStart(6)}`,
      );
      console.log('-'.repeat(70));

      for (const holding of result.holdings) {
        const symbol = holding.symbol.slice(0, 10).padEnd(12);
        const value = formatCompactUsd(holding.valueUsd).padStart(14);
        const change = formatPercent(holding.change24hPercent / 100).padStart(10);
        const holders = String(holding.holdersCount).padStart(8);
        const mcap = formatCompactUsd(holding.marketCapUsd).padStart(12);
        const age = `${holding.tokenAgeDays}d`.padStart(6);

        const changeColor = holding.change24hPercent >= 0 ? colors.positive : colors.negative;
        console.log(`${symbol} ${value} ${changeColor(change)} ${holders} ${colors.muted(mcap)} ${colors.muted(age)}`);
      }

      console.log();
    });

  // Token Screener command
  nansen
    .command('screener')
    .description('Token screener with volume and flow data')
    .option('--chain <chain>', 'Blockchain (ethereum, solana, base, etc.)', 'solana')
    .option('-n, --limit <number>', 'Number of tokens to show', '20')
    .option('--timeframe <tf>', 'Timeframe (1h, 6h, 24h)', '24h')
    .option('--json', 'Output as JSON')
    .action(async (cmdOpts: { chain?: string; limit?: string; timeframe?: string; json?: boolean }) => {
      const opts = program.opts();
      const timeoutMs = ctx.resolveTimeoutFromOptions(opts);
      const clientOpts = ctx.getClientOptions();
      clientOpts.timeoutMs = timeoutMs;

      const client = new OnchainClient(clientOpts);

      if (!client.isNansenAvailable()) {
        console.error(`${ctx.p('err')}Nansen CLI not installed. Install it with: npm install -g nansen`);
        process.exit(1);
      }

      const chain = (cmdOpts.chain ?? 'solana') as SupportedChain;
      const limit = Number.parseInt(cmdOpts.limit ?? '20', 10);
      const timeframe = cmdOpts.timeframe ?? '24h';

      const result = await client.getNansenTokenScreener(chain, { limit, timeframe });

      if (!result.success) {
        console.error(`${ctx.p('err')}${result.error}`);
        process.exit(1);
      }

      const output = ctx.getOutput();
      const colors = ctx.colors;

      if (cmdOpts.json || output.json) {
        ctx.outputJson({
          chain,
          timeframe,
          tokens: result.tokens,
        });
        return;
      }

      console.log();
      console.log(colors.section(`Token Screener (${chain} - ${timeframe})`));
      console.log();

      if (result.tokens.length === 0) {
        console.log(colors.muted('No tokens found.'));
        console.log();
        return;
      }

      // Header
      console.log(
        `${'Symbol'.padEnd(10)} ${'Price'.padStart(12)} ${'Chg%'.padStart(8)} ${'Volume'.padStart(12)} ${'Netflow'.padStart(12)} ${'MCap'.padStart(12)}`,
      );
      console.log('-'.repeat(72));

      for (const token of result.tokens) {
        const symbol = token.symbol.slice(0, 8).padEnd(10);
        const price = formatUsd(token.priceUsd).padStart(12);
        const change = formatPercent(token.priceChangePercent / 100).padStart(8);
        const volume = formatCompactUsd(token.volume).padStart(12);
        const netflow = formatCompactUsd(token.netflow).padStart(12);
        const mcap = formatCompactUsd(token.marketCapUsd).padStart(12);

        const changeColor = token.priceChangePercent >= 0 ? colors.positive : colors.negative;
        const netflowColor = token.netflow >= 0 ? colors.positive : colors.negative;

        console.log(
          `${symbol} ${price} ${changeColor(change)} ${volume} ${netflowColor(netflow)} ${colors.muted(mcap)}`,
        );
      }

      console.log();
    });
}
