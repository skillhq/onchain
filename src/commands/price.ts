import type { Command } from 'commander';
import type { CliContext } from '../cli/shared.js';
import { OnchainClient } from '../lib/onchain-client.js';
import { formatCompactUsd, formatPercent, formatUsd } from '../lib/utils/formatters.js';

export function registerPriceCommand(program: Command, ctx: CliContext): void {
  program
    .command('price')
    .description('Get token price and market data')
    .argument('<token>', 'Token symbol or CoinGecko ID (e.g., btc, eth, bitcoin, solana)')
    .option('--json', 'Output as JSON')
    .action(async (token: string, cmdOpts: { json?: boolean }) => {
      const opts = program.opts();
      const timeoutMs = ctx.resolveTimeoutFromOptions(opts);
      const clientOpts = ctx.getClientOptions();
      clientOpts.timeoutMs = timeoutMs;

      const client = new OnchainClient(clientOpts);
      const result = await client.getTokenPrice(token);

      if (!result.success) {
        console.error(`${ctx.p('err')}${result.error}`);
        process.exit(1);
      }

      const output = ctx.getOutput();

      if (cmdOpts.json || output.json) {
        ctx.outputJson(result.token);
        return;
      }

      const t = result.token;
      const colors = ctx.colors;

      console.log();
      console.log(colors.section(`${t.name} (${t.symbol})`));
      console.log();

      // Price and changes
      console.log(`${ctx.l('price')}${formatUsd(t.priceUsd)}`);

      const changeColor = (val: number | undefined): string => {
        if (val === undefined) {
          return '-';
        }
        const formatted = formatPercent(val, { showSign: true });
        return val >= 0 ? colors.positive(formatted) : colors.negative(formatted);
      };

      if (t.priceChange24h !== undefined) {
        console.log(`${ctx.l('change')}24h: ${changeColor(t.priceChange24h)}`);
      }

      // Additional changes in a row
      const changes: string[] = [];
      if (t.priceChange1h !== undefined) {
        changes.push(`1h: ${changeColor(t.priceChange1h)}`);
      }
      if (t.priceChange7d !== undefined) {
        changes.push(`7d: ${changeColor(t.priceChange7d)}`);
      }
      if (t.priceChange30d !== undefined) {
        changes.push(`30d: ${changeColor(t.priceChange30d)}`);
      }
      if (changes.length > 0) {
        console.log(`         ${changes.join('  ')}`);
      }

      console.log();

      // Market data
      if (t.marketCapRank) {
        console.log(`Rank:       #${t.marketCapRank}`);
      }
      if (t.marketCap) {
        console.log(`Market Cap: ${formatCompactUsd(t.marketCap)}`);
      }
      if (t.volume24h) {
        console.log(`Volume 24h: ${formatCompactUsd(t.volume24h)}`);
      }

      // Supply info
      if (t.circulatingSupply || t.totalSupply) {
        console.log();
        if (t.circulatingSupply) {
          console.log(`Circulating: ${formatCompactUsd(t.circulatingSupply).replace('$', '')} ${t.symbol}`);
        }
        if (t.totalSupply) {
          console.log(`Total:       ${formatCompactUsd(t.totalSupply).replace('$', '')} ${t.symbol}`);
        }
        if (t.maxSupply) {
          console.log(`Max:         ${formatCompactUsd(t.maxSupply).replace('$', '')} ${t.symbol}`);
        }
      }

      // ATH/ATL
      if (t.ath || t.atl) {
        console.log();
        if (t.ath) {
          const athChange =
            t.athChangePercent !== undefined ? ` (${formatPercent(t.athChangePercent, { showSign: true })})` : '';
          console.log(`ATH: ${formatUsd(t.ath)}${athChange}`);
        }
        if (t.atl) {
          const atlChange =
            t.atlChangePercent !== undefined ? ` (${formatPercent(t.atlChangePercent, { showSign: true })})` : '';
          console.log(`ATL: ${formatUsd(t.atl)}${atlChange}`);
        }
      }

      console.log();
    });
}
