import type { Command } from 'commander';
import type { CliContext } from '../cli/shared.js';
import { OnchainClient } from '../lib/onchain-client.js';
import { formatCompactUsd, formatPercent, formatTimestamp } from '../lib/utils/formatters.js';

export function registerPolymarketCommands(program: Command, ctx: CliContext): void {
  const polymarket = program.command('polymarket').description('Polymarket prediction market commands');

  polymarket
    .command('trending')
    .description('Get trending prediction markets')
    .option('-n, --limit <number>', 'Number of markets to show', '10')
    .option('--json', 'Output as JSON')
    .action(async (cmdOpts: { limit?: string; json?: boolean }) => {
      const opts = program.opts();
      const timeoutMs = ctx.resolveTimeoutFromOptions(opts);
      const clientOpts = ctx.getClientOptions();
      clientOpts.timeoutMs = timeoutMs;

      const client = new OnchainClient(clientOpts);
      const limit = Number.parseInt(cmdOpts.limit ?? '10', 10);

      const result = await client.getPolymarketTrending({ limit });

      if (!result.success) {
        console.error(`${ctx.p('err')}${result.error}`);
        process.exit(1);
      }

      const output = ctx.getOutput();
      const colors = ctx.colors;

      if (cmdOpts.json || output.json) {
        ctx.outputJson(result.markets);
        return;
      }

      console.log();
      console.log(colors.section('Trending Prediction Markets'));
      console.log();

      if (result.markets.length === 0) {
        console.log(colors.muted('No markets found.'));
        console.log();
        return;
      }

      for (const market of result.markets) {
        console.log(colors.accent(market.question));

        // Outcomes with prices
        const outcomeStr = market.outcomes
          .map((o) => {
            const pct = formatPercent(o.price * 100);
            return `${o.name}: ${pct}`;
          })
          .join('  |  ');
        console.log(`  ${outcomeStr}`);

        // Stats
        const stats: string[] = [];
        if (market.volume > 0) {
          stats.push(`Vol: ${formatCompactUsd(market.volume)}`);
        }
        if (market.liquidity > 0) {
          stats.push(`Liq: ${formatCompactUsd(market.liquidity)}`);
        }
        if (market.category) {
          stats.push(market.category);
        }
        if (stats.length > 0) {
          console.log(colors.muted(`  ${stats.join('  |  ')}`));
        }

        // End date
        if (market.endDate) {
          const endTimestamp = new Date(market.endDate).getTime() / 1000;
          console.log(colors.muted(`  Ends: ${formatTimestamp(endTimestamp)}`));
        }

        console.log();
      }
    });

  polymarket
    .command('search')
    .description('Search prediction markets')
    .argument('<query>', 'Search query')
    .option('-n, --limit <number>', 'Number of markets to show', '10')
    .option('--json', 'Output as JSON')
    .action(async (query: string, cmdOpts: { limit?: string; json?: boolean }) => {
      const opts = program.opts();
      const timeoutMs = ctx.resolveTimeoutFromOptions(opts);
      const clientOpts = ctx.getClientOptions();
      clientOpts.timeoutMs = timeoutMs;

      const client = new OnchainClient(clientOpts);
      const limit = Number.parseInt(cmdOpts.limit ?? '10', 10);

      const result = await client.searchPolymarkets(query, { limit });

      if (!result.success) {
        console.error(`${ctx.p('err')}${result.error}`);
        process.exit(1);
      }

      const output = ctx.getOutput();
      const colors = ctx.colors;

      if (cmdOpts.json || output.json) {
        ctx.outputJson(result.markets);
        return;
      }

      console.log();
      console.log(colors.section(`Markets matching "${query}"`));
      console.log();

      if (result.markets.length === 0) {
        console.log(colors.muted('No markets found.'));
        console.log();
        return;
      }

      for (const market of result.markets) {
        console.log(colors.accent(market.question));

        const outcomeStr = market.outcomes
          .map((o) => {
            const pct = formatPercent(o.price * 100);
            return `${o.name}: ${pct}`;
          })
          .join('  |  ');
        console.log(`  ${outcomeStr}`);

        const stats: string[] = [];
        if (market.volume > 0) {
          stats.push(`Vol: ${formatCompactUsd(market.volume)}`);
        }
        if (market.category) {
          stats.push(market.category);
        }
        if (stats.length > 0) {
          console.log(colors.muted(`  ${stats.join('  |  ')}`));
        }

        console.log();
      }
    });

  polymarket
    .command('view')
    .description('View a specific market')
    .argument('<market>', 'Market ID or slug')
    .option('--json', 'Output as JSON')
    .action(async (marketId: string, cmdOpts: { json?: boolean }) => {
      const opts = program.opts();
      const timeoutMs = ctx.resolveTimeoutFromOptions(opts);
      const clientOpts = ctx.getClientOptions();
      clientOpts.timeoutMs = timeoutMs;

      const client = new OnchainClient(clientOpts);
      const result = await client.getPolymarketMarket(marketId);

      if (!result.success) {
        console.error(`${ctx.p('err')}${result.error}`);
        process.exit(1);
      }

      const output = ctx.getOutput();
      const colors = ctx.colors;

      if (cmdOpts.json || output.json) {
        ctx.outputJson(result.market);
        return;
      }

      const market = result.market;

      console.log();
      console.log(colors.section(market.question));
      console.log();

      if (market.description) {
        console.log(market.description);
        console.log();
      }

      // Outcomes
      console.log(colors.accent('Outcomes:'));
      for (const outcome of market.outcomes) {
        const pct = formatPercent(outcome.price * 100);
        const bar = '\u2588'.repeat(Math.floor(outcome.price * 20));
        console.log(`  ${outcome.name.padEnd(20)} ${pct.padStart(8)} ${colors.muted(bar)}`);
      }
      console.log();

      // Stats
      if (market.volume > 0) {
        console.log(`Volume:    ${formatCompactUsd(market.volume)}`);
      }
      if (market.liquidity > 0) {
        console.log(`Liquidity: ${formatCompactUsd(market.liquidity)}`);
      }
      if (market.category) {
        console.log(`Category:  ${market.category}`);
      }
      if (market.endDate) {
        const endTimestamp = new Date(market.endDate).getTime() / 1000;
        console.log(`Ends:      ${formatTimestamp(endTimestamp)}`);
      }
      if (market.slug) {
        console.log(`URL:       https://polymarket.com/event/${market.slug}`);
      }
      console.log();
    });
}
