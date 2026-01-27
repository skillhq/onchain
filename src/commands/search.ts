import type { Command } from 'commander';
import type { CliContext } from '../cli/shared.js';
import { OnchainClient } from '../lib/onchain-client.js';

export function registerSearchCommand(program: Command, ctx: CliContext): void {
  program
    .command('search')
    .description('Search for tokens by name or symbol')
    .argument('<query>', 'Search term (token name or symbol)')
    .option('-l, --limit <n>', 'Maximum results to show', '10')
    .option('--json', 'Output as JSON')
    .action(async (query: string, cmdOpts: { limit: string; json?: boolean }) => {
      const opts = program.opts();
      const timeoutMs = ctx.resolveTimeoutFromOptions(opts);
      const clientOpts = ctx.getClientOptions();
      clientOpts.timeoutMs = timeoutMs;

      const limit = Number.parseInt(cmdOpts.limit, 10);
      if (Number.isNaN(limit) || limit < 1) {
        console.error(`${ctx.p('err')}Invalid limit: ${cmdOpts.limit}`);
        process.exit(1);
      }

      const client = new OnchainClient(clientOpts);
      const result = await client.searchTokens(query, limit);

      if (!result.success) {
        console.error(`${ctx.p('err')}${result.error}`);
        process.exit(1);
      }

      const output = ctx.getOutput();

      if (cmdOpts.json || output.json) {
        ctx.outputJson(result.tokens);
        return;
      }

      const colors = ctx.colors;

      if (result.tokens.length === 0) {
        console.log(`${ctx.p('info')}No tokens found for "${query}"`);
        return;
      }

      console.log();
      console.log(colors.section(`Search Results: "${query}"`));
      console.log();

      // Find max widths for alignment
      const maxSymbol = Math.max(...result.tokens.map((t) => t.symbol.length));

      for (const token of result.tokens) {
        const symbol = token.symbol.padEnd(maxSymbol);
        const rank = token.marketCapRank ? colors.muted(`#${token.marketCapRank}`) : colors.muted('-');
        console.log(`  ${colors.accent(symbol)}  ${token.name}  ${rank}`);
      }

      console.log();
      console.log(colors.muted(`Use 'onchain price <symbol>' to get detailed price info`));
      console.log();
    });
}
