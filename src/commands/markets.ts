import type { Command } from 'commander';
import type { CliContext } from '../cli/shared.js';
import { OnchainClient } from '../lib/onchain-client.js';
import { formatCompactUsd, formatPercent } from '../lib/utils/formatters.js';

export function registerMarketsCommand(program: Command, ctx: CliContext): void {
  program
    .command('markets')
    .description('Get crypto market overview')
    .option('--json', 'Output as JSON')
    .action(async (cmdOpts: { json?: boolean }) => {
      const opts = program.opts();
      const timeoutMs = ctx.resolveTimeoutFromOptions(opts);
      const clientOpts = ctx.getClientOptions();
      clientOpts.timeoutMs = timeoutMs;

      const client = new OnchainClient(clientOpts);
      const result = await client.getMarketOverview();

      if (!result.success) {
        console.error(`${ctx.p('err')}${result.error}`);
        process.exit(1);
      }

      const output = ctx.getOutput();

      if (cmdOpts.json || output.json) {
        ctx.outputJson(result.market);
        return;
      }

      const m = result.market;
      const colors = ctx.colors;

      console.log();
      console.log(colors.section('Crypto Market Overview'));
      console.log();

      console.log(`Total Market Cap: ${formatCompactUsd(m.totalMarketCap)}`);
      if (m.marketCapChange24h !== undefined) {
        const changeStr = formatPercent(m.marketCapChange24h, { showSign: true });
        const coloredChange = m.marketCapChange24h >= 0 ? colors.positive(changeStr) : colors.negative(changeStr);
        console.log(`24h Change:       ${coloredChange}`);
      }
      console.log(`24h Volume:       ${formatCompactUsd(m.totalVolume24h)}`);
      console.log();
      console.log(`BTC Dominance:    ${formatPercent(m.btcDominance)}`);
      if (m.ethDominance !== undefined) {
        console.log(`ETH Dominance:    ${formatPercent(m.ethDominance)}`);
      }

      // Trending tokens
      if (m.trending && m.trending.length > 0) {
        console.log();
        console.log(colors.section('Trending'));
        console.log();

        for (const token of m.trending) {
          const rank = token.marketCapRank ? `#${token.marketCapRank}` : '';
          const change =
            token.priceChange24h !== undefined
              ? token.priceChange24h >= 0
                ? colors.positive(formatPercent(token.priceChange24h, { showSign: true }))
                : colors.negative(formatPercent(token.priceChange24h, { showSign: true }))
              : '';

          console.log(`  ${token.symbol.padEnd(8)} ${token.name.padEnd(20)} ${rank.padStart(5)} ${change}`);
        }
      }

      console.log();
    });
}
