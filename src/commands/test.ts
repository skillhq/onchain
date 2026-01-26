import type { Command } from 'commander';
import type { CliContext } from '../cli/shared.js';
import { isAgentBrowserAvailable, scrapeDebankProfile, scrapeSolscanProfile } from '../lib/browser-scraper.js';
import { validateCredentials } from '../lib/credentials.js';
import { OnchainClient } from '../lib/onchain-client.js';

// Test addresses (public, well-known addresses with activity)
const TEST_EVM_ADDRESS = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'; // vitalik.eth
const TEST_SOL_ADDRESS = '86xCnPeV69n6t3DnyGvkKobf9FdN2H9oiVDdaMpo2MMY'; // Known Solana address

interface TestResult {
  provider: string;
  status: 'ok' | 'skip' | 'fail';
  message: string;
  duration?: number;
}

export function registerTestCommand(program: Command, ctx: CliContext): void {
  program
    .command('test')
    .description('Test all configured providers and integrations')
    .option('--json', 'Output results as JSON')
    .option('--verbose', 'Show detailed output')
    .action(async (cmdOpts: { json?: boolean; verbose?: boolean }) => {
      ctx.applyOutputFromCommand(program);
      const output = ctx.getOutput();
      const colors = ctx.colors;
      const creds = ctx.resolveCredentials();
      const validation = validateCredentials(creds);
      const client = new OnchainClient(ctx.getClientOptions());
      const results: TestResult[] = [];

      const isJson = cmdOpts.json || output.json;

      if (!isJson) {
        console.log();
        console.log(colors.section('Testing Onchain Providers'));
        console.log();
      }

      // Helper to run a test
      async function runTest(
        name: string,
        isConfigured: boolean,
        testFn: () => Promise<{ ok: boolean; message: string }>,
        fallbackFn?: () => Promise<{ ok: boolean; message: string }>,
      ): Promise<void> {
        const start = Date.now();

        if (!isConfigured && !fallbackFn) {
          results.push({ provider: name, status: 'skip', message: 'Not configured' });
          if (!isJson) {
            console.log(`${ctx.p('hint')}${name}: ${colors.muted('Not configured')}`);
          }
          return;
        }

        try {
          let result: { ok: boolean; message: string };

          if (isConfigured) {
            result = await testFn();
          } else if (fallbackFn) {
            if (!isJson && cmdOpts.verbose) {
              console.log(colors.muted(`  Using browser fallback for ${name}...`));
            }
            result = await fallbackFn();
          } else {
            result = { ok: false, message: 'Not configured' };
          }

          const duration = Date.now() - start;

          if (result.ok) {
            results.push({ provider: name, status: 'ok', message: result.message, duration });
            if (!isJson) {
              console.log(`${ctx.p('ok')}${name}: ${result.message} ${colors.muted(`(${duration}ms)`)}`);
            }
          } else {
            results.push({ provider: name, status: 'fail', message: result.message, duration });
            if (!isJson) {
              console.log(
                `${ctx.p('err')}${name}: ${colors.negative(result.message)} ${colors.muted(`(${duration}ms)`)}`,
              );
            }
          }
        } catch (error) {
          const duration = Date.now() - start;
          const message = error instanceof Error ? error.message : String(error);
          results.push({ provider: name, status: 'fail', message, duration });
          if (!isJson) {
            console.log(`${ctx.p('err')}${name}: ${colors.negative(message)} ${colors.muted(`(${duration}ms)`)}`);
          }
        }
      }

      // Test CoinGecko (always available, free tier)
      await runTest('CoinGecko', true, async () => {
        const result = await client.getTokenPrice('bitcoin');
        if (result.success) {
          return { ok: true, message: `BTC price: $${result.token.priceUsd.toLocaleString()}` };
        }
        return { ok: false, message: result.error };
      });

      // Test CoinMarketCap (if configured)
      await runTest('CoinMarketCap', validation.hasCoinMarketCap, async () => {
        const result = await client.cmcGetTokenPrice('BTC');
        if (result.success) {
          return { ok: true, message: `BTC price: $${result.token.priceUsd.toLocaleString()}` };
        }
        return { ok: false, message: result.error };
      });

      // Check if browser fallback is available
      const hasBrowser = isAgentBrowserAvailable();

      // Test DeBank (EVM) - with browser fallback if API not configured
      await runTest(
        'DeBank (EVM)',
        validation.hasDebank,
        async () => {
          const result = await client.getEvmBalances(TEST_EVM_ADDRESS);
          if (result.success) {
            return {
              ok: true,
              message: `Found ${result.balances.length} tokens, total: $${result.totalValueUsd.toLocaleString()}`,
            };
          }
          return { ok: false, message: result.error };
        },
        hasBrowser
          ? async () => {
              const result = await scrapeDebankProfile(TEST_EVM_ADDRESS);
              if (result.success) {
                return {
                  ok: true,
                  message: `[browser] Found ${result.balances.length} tokens, total: $${result.totalValueUsd.toLocaleString()}`,
                };
              }
              return { ok: false, message: result.error };
            }
          : undefined,
      );

      // Test Helius (Solana) - with browser fallback if API not configured
      await runTest(
        'Helius (Solana)',
        validation.hasHelius,
        async () => {
          const result = await client.getSolanaBalances(TEST_SOL_ADDRESS);
          if (result.success) {
            return {
              ok: true,
              message: `Found ${result.balances.length} tokens, total: $${result.totalValueUsd.toLocaleString()}`,
            };
          }
          return { ok: false, message: result.error };
        },
        hasBrowser
          ? async () => {
              const result = await scrapeSolscanProfile(TEST_SOL_ADDRESS);
              if (result.success) {
                return {
                  ok: true,
                  message: `[browser] Found ${result.balances.length} tokens, total: $${result.totalValueUsd.toLocaleString()}`,
                };
              }
              return { ok: false, message: result.error };
            }
          : undefined,
      );

      // Test Coinbase
      await runTest('Coinbase', validation.hasCoinbase, async () => {
        const result = await client.getCoinbaseBalances();
        if (result.success) {
          return {
            ok: true,
            message: `Found ${result.balances.length} assets, total: $${result.totalValueUsd.toLocaleString()}`,
          };
        }
        return { ok: false, message: result.error };
      });

      // Test Binance
      await runTest('Binance', validation.hasBinance, async () => {
        const result = await client.getBinanceBalances();
        if (result.success) {
          return {
            ok: true,
            message: `Found ${result.balances.length} assets, total: $${result.totalValueUsd.toLocaleString()}`,
          };
        }
        return { ok: false, message: result.error };
      });

      // Test Polymarket (always available, no auth needed)
      await runTest('Polymarket', true, async () => {
        const result = await client.getPolymarketTrending({ limit: 3 });
        if (result.success) {
          return { ok: true, message: `Found ${result.markets.length} trending markets` };
        }
        return { ok: false, message: result.error };
      });

      // Summary
      if (isJson) {
        ctx.outputJson({
          results,
          summary: {
            passed: results.filter((r) => r.status === 'ok').length,
            failed: results.filter((r) => r.status === 'fail').length,
            skipped: results.filter((r) => r.status === 'skip').length,
          },
        });
      } else {
        console.log();
        const okCount = results.filter((r) => r.status === 'ok').length;
        const failCount = results.filter((r) => r.status === 'fail').length;
        const skipCount = results.filter((r) => r.status === 'skip').length;

        const summary = [
          colors.positive(`${okCount} passed`),
          failCount > 0 ? colors.negative(`${failCount} failed`) : null,
          skipCount > 0 ? colors.muted(`${skipCount} skipped`) : null,
        ]
          .filter(Boolean)
          .join(', ');

        console.log(colors.section('Summary:'), summary);
        console.log();
      }

      // Exit with error code if any tests failed
      if (results.some((r) => r.status === 'fail')) {
        process.exit(1);
      }
    });
}
