import type { Command } from 'commander';
import type { CliContext } from '../cli/shared.js';
import { OnchainClient } from '../lib/onchain-client.js';
import type { PolymarketFilterOptions } from '../lib/onchain-client-types.js';
import { formatCompactUsd, formatPercent, formatTimestamp } from '../lib/utils/formatters.js';

function parseTagList(tags: string | undefined): string[] | undefined {
  if (!tags) {
    return undefined;
  }
  return tags.split(',').map((t) => t.trim().toLowerCase());
}

export function registerPolymarketCommands(program: Command, ctx: CliContext): void {
  const polymarket = program.command('polymarket').description('Polymarket prediction market commands');

  // Tags command
  polymarket
    .command('tags')
    .description('List available Polymarket categories/tags')
    .option('--popular', 'Show popular tags sorted by market count')
    .option('--json', 'Output as JSON')
    .action(async (cmdOpts: { popular?: boolean; json?: boolean }) => {
      const opts = program.opts();
      const timeoutMs = ctx.resolveTimeoutFromOptions(opts);
      const clientOpts = ctx.getClientOptions();
      clientOpts.timeoutMs = timeoutMs;

      const client = new OnchainClient(clientOpts);
      const result = await client.getPolymarketTags({ popular: cmdOpts.popular });

      if (!result.success) {
        console.error(`${ctx.p('err')}${result.error}`);
        process.exit(1);
      }

      const output = ctx.getOutput();
      const colors = ctx.colors;

      if (cmdOpts.json || output.json) {
        ctx.outputJson(result.tags);
        return;
      }

      console.log();
      console.log(colors.section(cmdOpts.popular ? 'Popular Polymarket Tags' : 'Available Polymarket Tags'));
      console.log();

      if (result.tags.length === 0) {
        console.log(colors.muted('No tags found.'));
        console.log();
        return;
      }

      for (const tag of result.tags) {
        if (cmdOpts.popular && tag.eventCount !== undefined) {
          console.log(
            `${colors.accent(tag.label.padEnd(25))} ${colors.muted(`(${tag.eventCount} markets)`)}  ${colors.muted(`slug: ${tag.slug}`)}`,
          );
        } else {
          console.log(`${colors.accent(tag.label.padEnd(25))} ${colors.muted(`slug: ${tag.slug}`)}`);
        }
      }

      console.log();
      console.log(
        colors.muted('Use --exclude <tags> or --include <tags> with trending/search to filter by these tags.'),
      );
      console.log(colors.muted('Configure defaults in ~/.config/onchain/config.json5 under polymarket.excludeTags'));
      console.log();
    });

  polymarket
    .command('trending')
    .description('Get trending prediction markets')
    .option('-n, --limit <number>', 'Number of markets to show', '10')
    .option('--exclude <tags>', 'Exclude tags (comma-separated, e.g., sports,nfl)')
    .option('--include <tags>', 'Only include tags (comma-separated)')
    .option('--all', 'Ignore config excludes, show all markets')
    .option('--json', 'Output as JSON')
    .action(async (cmdOpts: { limit?: string; exclude?: string; include?: string; all?: boolean; json?: boolean }) => {
      const opts = program.opts();
      const timeoutMs = ctx.resolveTimeoutFromOptions(opts);
      const clientOpts = ctx.getClientOptions();
      clientOpts.timeoutMs = timeoutMs;

      const client = new OnchainClient(clientOpts);
      const limit = Number.parseInt(cmdOpts.limit ?? '10', 10);

      // Build filter options
      const filterOptions: PolymarketFilterOptions = { limit };

      if (!cmdOpts.all) {
        // Apply config defaults first
        const configPrefs = ctx.config.polymarket;
        if (configPrefs?.excludeTags && configPrefs.excludeTags.length > 0) {
          filterOptions.excludeTags = [...configPrefs.excludeTags];
        }
        if (configPrefs?.includeTags && configPrefs.includeTags.length > 0) {
          filterOptions.includeTags = [...configPrefs.includeTags];
        }

        // Command-line options override config
        const cliExclude = parseTagList(cmdOpts.exclude);
        if (cliExclude) {
          filterOptions.excludeTags = cliExclude;
        }
        const cliInclude = parseTagList(cmdOpts.include);
        if (cliInclude) {
          filterOptions.includeTags = cliInclude;
        }
      }

      const result = await client.getPolymarketTrending(filterOptions);

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
      const hasFilters = filterOptions.excludeTags?.length || filterOptions.includeTags?.length;
      const title = hasFilters ? 'Trending Prediction Markets (filtered)' : 'Trending Prediction Markets';
      console.log(colors.section(title));
      if (hasFilters && !cmdOpts.all) {
        const filterDesc: string[] = [];
        if (filterOptions.excludeTags?.length) {
          filterDesc.push(`excluding: ${filterOptions.excludeTags.join(', ')}`);
        }
        if (filterOptions.includeTags?.length) {
          filterDesc.push(`including: ${filterOptions.includeTags.join(', ')}`);
        }
        console.log(colors.muted(`  ${filterDesc.join(' | ')}`));
      }
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
    .option('--exclude <tags>', 'Exclude tags (comma-separated)')
    .option('--include <tags>', 'Only include tags (comma-separated)')
    .option('--all', 'Ignore config excludes')
    .option('--json', 'Output as JSON')
    .action(
      async (
        query: string,
        cmdOpts: { limit?: string; exclude?: string; include?: string; all?: boolean; json?: boolean },
      ) => {
        const opts = program.opts();
        const timeoutMs = ctx.resolveTimeoutFromOptions(opts);
        const clientOpts = ctx.getClientOptions();
        clientOpts.timeoutMs = timeoutMs;

        const client = new OnchainClient(clientOpts);
        const limit = Number.parseInt(cmdOpts.limit ?? '10', 10);

        // Build filter options
        const filterOptions: PolymarketFilterOptions = { limit };

        if (!cmdOpts.all) {
          // Apply config defaults first
          const configPrefs = ctx.config.polymarket;
          if (configPrefs?.excludeTags && configPrefs.excludeTags.length > 0) {
            filterOptions.excludeTags = [...configPrefs.excludeTags];
          }
          if (configPrefs?.includeTags && configPrefs.includeTags.length > 0) {
            filterOptions.includeTags = [...configPrefs.includeTags];
          }

          // Command-line options override config
          const cliExclude = parseTagList(cmdOpts.exclude);
          if (cliExclude) {
            filterOptions.excludeTags = cliExclude;
          }
          const cliInclude = parseTagList(cmdOpts.include);
          if (cliInclude) {
            filterOptions.includeTags = cliInclude;
          }
        }

        const result = await client.searchPolymarkets(query, filterOptions);

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
      },
    );

  // Sentiment analysis command
  polymarket
    .command('sentiment')
    .description('Analyze Polymarket sentiment for a topic (crypto, fed, politics, etc.)')
    .argument('<topic>', 'Topic to analyze (e.g., btc, eth, fed, trump)')
    .option('-n, --limit <number>', 'Max signals to analyze', '10')
    .option('--json', 'Output as JSON')
    .action(async (topic: string, cmdOpts: { limit?: string; json?: boolean }) => {
      const opts = program.opts();
      const timeoutMs = ctx.resolveTimeoutFromOptions(opts);
      const clientOpts = ctx.getClientOptions();
      clientOpts.timeoutMs = timeoutMs;

      const client = new OnchainClient(clientOpts);
      const limit = Number.parseInt(cmdOpts.limit ?? '10', 10);

      const result = await client.getPolymarketSentiment(topic, { limit });

      if (!result.success) {
        console.error(`${ctx.p('err')}${result.error}`);
        process.exit(1);
      }

      const output = ctx.getOutput();
      const colors = ctx.colors;

      if (cmdOpts.json || output.json) {
        ctx.outputJson(result.sentiment);
        return;
      }

      const sentiment = result.sentiment;

      console.log();
      console.log(colors.section(`Polymarket Sentiment: ${topic.toUpperCase()}`));
      console.log();

      // Overall sentiment with emoji indicator
      const sentimentEmoji =
        sentiment.overallSentiment === 'bullish'
          ? '📈'
          : sentiment.overallSentiment === 'bearish'
            ? '📉'
            : sentiment.overallSentiment === 'mixed'
              ? '↔️'
              : '➖';

      const sentimentColor =
        sentiment.overallSentiment === 'bullish'
          ? colors.accent
          : sentiment.overallSentiment === 'bearish'
            ? (s: string) => s // no color for bearish, could add red if available
            : colors.muted;

      console.log(
        `${sentimentEmoji} Overall: ${sentimentColor(sentiment.overallSentiment.toUpperCase())}  (score: ${sentiment.sentimentScore > 0 ? '+' : ''}${sentiment.sentimentScore})`,
      );
      console.log(`   Confidence: ${sentiment.confidence}%  |  Signals: ${sentiment.signals.length}`);
      console.log();

      // Summary
      console.log(colors.muted(sentiment.summary));
      console.log();

      // Top signals
      console.log(colors.accent('Key Signals:'));
      for (const signal of sentiment.signals.slice(0, 5)) {
        const signalEmoji = signal.sentiment === 'bullish' ? '🟢' : signal.sentiment === 'bearish' ? '🔴' : '⚪';
        const prob = formatPercent(signal.probability * 100);
        console.log(`  ${signalEmoji} ${signal.question}`);
        console.log(colors.muted(`     ${prob} probability  |  Vol: ${formatCompactUsd(signal.volume)}`));
      }

      if (sentiment.signals.length > 5) {
        console.log(colors.muted(`  ... and ${sentiment.signals.length - 5} more signals`));
      }

      console.log();
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
