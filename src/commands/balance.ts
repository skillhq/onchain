import type { Command } from 'commander';
import type { CliContext } from '../cli/shared.js';
import { isAgentBrowserAvailable, scrapeDebankProfile, scrapeSolscanProfile } from '../lib/browser-scraper.js';
import { validateCredentials } from '../lib/credentials.js';
import { OnchainClient } from '../lib/onchain-client.js';
import type { EvmChain, SupportedChain, TokenBalance } from '../lib/onchain-client-types.js';
import { isEvmAddress, isSolanaAddress } from '../lib/utils/address.js';
import { formatChainName, formatTokenAmount, formatUsd } from '../lib/utils/formatters.js';

export function registerBalanceCommand(program: Command, ctx: CliContext): void {
  program
    .command('balance')
    .description('Get wallet token balances')
    .argument('<address>', 'Wallet address (EVM 0x... or Solana)')
    .option('--chain <chain>', 'Filter by specific chain (for EVM wallets)')
    .option('--min-value <usd>', 'Minimum USD value to show', '0')
    .option('-n, --limit <number>', 'Maximum tokens to show', '50')
    .option('--browser', 'Use browser scraping (requires agent-browser CLI)')
    .option('--json', 'Output as JSON')
    .action(
      async (
        address: string,
        cmdOpts: { chain?: string; minValue?: string; limit?: string; browser?: boolean; json?: boolean },
      ) => {
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

        // Check credentials
        const creds = ctx.resolveCredentials();
        const validation = validateCredentials(creds);

        // Initialize client to check for Nansen availability
        const client = new OnchainClient(clientOpts);
        const useNansen = client.isNansenAvailable();
        const hasApiKey = chainType === 'evm' ? validation.hasDebank : validation.hasHelius;
        const useBrowser = cmdOpts.browser || (!useNansen && !hasApiKey);

        const output = ctx.getOutput();
        const colors = ctx.colors;

        let balances: TokenBalance[] = [];
        let totalValueUsd = 0;
        let source: 'nansen' | 'api' | 'browser' = 'api';

        if (useNansen && !cmdOpts.browser) {
          // Use Nansen CLI (preferred provider)
          source = 'nansen';
          const chain: SupportedChain = chainType === 'evm' ? ((cmdOpts.chain as EvmChain) ?? 'eth') : 'solana';

          const result = await client.getNansenBalances(address, chain);

          if (result.success) {
            balances = result.balances;
            totalValueUsd = result.totalValueUsd;
          } else {
            // Fall back to API if Nansen fails
            console.error(colors.muted(`Nansen failed: ${result.error}, falling back to API...`));
            source = 'api';
          }
        }

        // Use API fallback if Nansen not available or failed
        if (source === 'api' && !useBrowser) {
          if (chainType === 'evm') {
            const chains = cmdOpts.chain ? [cmdOpts.chain as EvmChain] : undefined;
            const result = await client.getEvmBalances(address, chains);

            if (!result.success) {
              console.error(`${ctx.p('err')}${result.error}`);
              process.exit(1);
            }

            balances = result.balances;
            totalValueUsd = result.totalValueUsd;
          } else if (chainType === 'solana') {
            const result = await client.getSolanaBalances(address);

            if (!result.success) {
              console.error(`${ctx.p('err')}${result.error}`);
              process.exit(1);
            }

            balances = result.balances;
            totalValueUsd = result.totalValueUsd;
          }
        }

        // Use browser scraping as last resort
        if (useBrowser || (source === 'api' && balances.length === 0 && !hasApiKey)) {
          source = 'browser';

          if (!isAgentBrowserAvailable()) {
            const apiKeyName = chainType === 'evm' ? 'DEBANK_API_KEY' : 'HELIUS_API_KEY';
            console.error(
              `${ctx.p('err')}No API key configured and agent-browser CLI not available.\n` +
                `Set ${apiKeyName} or install agent-browser for browser scraping.`,
            );
            process.exit(1);
          }

          console.error(colors.muted('Using browser scraping (no API key configured)...'));

          const scrapeResult =
            chainType === 'evm'
              ? await scrapeDebankProfile(address, timeoutMs ?? 60000)
              : await scrapeSolscanProfile(address, timeoutMs ?? 60000);

          if (!scrapeResult.success) {
            console.error(`${ctx.p('err')}${scrapeResult.error}`);
            process.exit(1);
          }

          // Convert scraped balances to TokenBalance format
          balances = scrapeResult.balances.map((b) => ({
            symbol: b.symbol,
            name: b.name,
            chain: (b.chain ?? chainType) as EvmChain | 'solana',
            balanceRaw: String(b.amount),
            balanceFormatted: b.amount,
            decimals: 0,
            priceUsd: b.valueUsd && b.amount > 0 ? b.valueUsd / b.amount : null,
            valueUsd: b.valueUsd,
          }));
          totalValueUsd = scrapeResult.totalValueUsd;
        }

        // Apply filters
        const minValue = Number.parseFloat(cmdOpts.minValue ?? '0');
        const limit = Number.parseInt(cmdOpts.limit ?? '50', 10);

        let filteredBalances = balances.filter((b) => (b.valueUsd ?? 0) >= minValue);
        filteredBalances = filteredBalances.slice(0, limit);

        if (cmdOpts.json || output.json) {
          ctx.outputJson({
            address,
            chainType,
            totalValueUsd,
            balances: filteredBalances,
            source,
          });
          return;
        }

        console.log();
        console.log(colors.section('Wallet Balance'));
        console.log(colors.muted(`${address}`));
        if (source === 'nansen') {
          console.log(colors.muted('(via Nansen CLI)'));
        } else if (source === 'browser') {
          console.log(colors.muted('(via browser scraping)'));
        }
        console.log();

        if (filteredBalances.length === 0) {
          console.log(colors.muted('No tokens found with value above minimum threshold.'));
          console.log();
          return;
        }

        // Header
        console.log(
          `${'Token'.padEnd(12)} ${'Amount'.padStart(16)} ${'Price'.padStart(12)} ${'Value'.padStart(14)} ${'Chain'.padEnd(10)}`,
        );
        console.log('-'.repeat(70));

        for (const balance of filteredBalances) {
          const symbol = balance.symbol.slice(0, 10).padEnd(12);
          const amount = formatTokenAmount(balance.balanceFormatted).padStart(16);
          const price = balance.priceUsd !== null ? formatUsd(balance.priceUsd).padStart(12) : '-'.padStart(12);
          const value = balance.valueUsd !== null ? formatUsd(balance.valueUsd).padStart(14) : '-'.padStart(14);
          const chain = formatChainName(balance.chain).slice(0, 10).padEnd(10);

          console.log(`${symbol} ${amount} ${price} ${value} ${colors.muted(chain)}`);
        }

        console.log('-'.repeat(70));
        console.log(
          `${'Total'.padEnd(12)} ${' '.padStart(16)} ${' '.padStart(12)} ${formatUsd(totalValueUsd).padStart(14)}`,
        );
        console.log();

        if (balances.length > filteredBalances.length) {
          console.log(
            colors.muted(`Showing ${filteredBalances.length} of ${balances.length} tokens (use --limit to show more)`),
          );
          console.log();
        }
      },
    );
}
