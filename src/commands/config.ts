import type { Command } from 'commander';
import type { CliContext } from '../cli/shared.js';
import { getConfigPath, saveConfig } from '../lib/config.js';
import { validateCredentials } from '../lib/credentials.js';

export function registerConfigCommand(program: Command, ctx: CliContext): void {
  const configCmd = program.command('config').description('View and manage configuration');

  // Default action: show config
  configCmd
    .command('show', { isDefault: true })
    .description('Show current configuration')
    .option('--json', 'Output as JSON')
    .action(async (cmdOpts: { json?: boolean }) => {
      const config = ctx.config;
      const creds = ctx.resolveCredentials();
      const validation = validateCredentials(creds);
      const colors = ctx.colors;
      const output = ctx.getOutput();

      if (cmdOpts.json || output.json) {
        // Don't expose secrets in JSON output
        const safeConfig = {
          timeoutMs: config.timeoutMs,
          credentials: {
            debank: validation.hasDebank,
            helius: validation.hasHelius,
            coinbase: validation.hasCoinbase,
            binance: validation.hasBinance,
            coingecko: validation.hasCoinGecko,
            coinmarketcap: validation.hasCoinMarketCap,
          },
        };
        ctx.outputJson(safeConfig);
        return;
      }

      console.log();
      console.log(colors.section('Configuration'));
      console.log();

      // Config paths
      console.log(colors.accent('Config Files:'));
      console.log(`  Global: ${getConfigPath({ global: true })}`);
      console.log(`  Local:  ${getConfigPath({ global: false })}`);
      console.log();

      // API Credentials Status
      console.log(colors.accent('API Credentials:'));
      const credStatus = (name: string, configured: boolean, source?: string): string => {
        const status = configured ? colors.positive('\u2713 configured') : colors.muted('not configured');
        const srcLabel = source ? colors.muted(` (${source})`) : '';
        return `  ${name.padEnd(15)} ${status}${srcLabel}`;
      };

      console.log(
        credStatus(
          'DeBank',
          validation.hasDebank,
          creds.debankApiKey ? (config.debankApiKey ? 'config' : 'env') : undefined,
        ),
      );
      console.log(
        credStatus(
          'Helius',
          validation.hasHelius,
          creds.heliusApiKey ? (config.heliusApiKey ? 'config' : 'env') : undefined,
        ),
      );
      console.log(
        credStatus(
          'Coinbase',
          validation.hasCoinbase,
          creds.coinbaseApiKeyId ? (config.coinbaseApiKeyId ? 'config' : 'env') : undefined,
        ),
      );
      console.log(
        credStatus(
          'Binance',
          validation.hasBinance,
          creds.binanceApiKey ? (config.binanceApiKey ? 'config' : 'env') : undefined,
        ),
      );
      console.log(
        credStatus(
          'CoinGecko',
          validation.hasCoinGecko,
          creds.coingeckoApiKey ? (config.coingeckoApiKey ? 'config' : 'env') : undefined,
        ),
      );
      console.log(
        credStatus(
          'CoinMarketCap',
          validation.hasCoinMarketCap,
          creds.coinmarketcapApiKey ? (config.coinmarketcapApiKey ? 'config' : 'env') : undefined,
        ),
      );
      console.log();

      // Settings
      console.log(colors.accent('Settings:'));
      console.log(`  Timeout: ${config.timeoutMs ?? 30000}ms`);
      console.log();
    });

  configCmd
    .command('set')
    .description('Set a configuration value')
    .argument('<key>', 'Configuration key (e.g., timeoutMs)')
    .argument('<value>', 'Value to set')
    .option('--global', 'Save to global config')
    .action(async (key: string, value: string, cmdOpts: { global?: boolean }) => {
      const colors = ctx.colors;

      const allowedKeys = ['timeoutMs'];
      if (!allowedKeys.includes(key)) {
        console.error(`${ctx.p('err')}Invalid key "${key}". Allowed keys: ${allowedKeys.join(', ')}`);
        console.error(colors.muted('Use `onchain setup` to configure API keys.'));
        process.exit(1);
      }

      const updates: Record<string, unknown> = {};

      if (key === 'timeoutMs') {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          console.error(`${ctx.p('err')}Invalid timeout value. Expected positive integer.`);
          process.exit(1);
        }
        updates.timeoutMs = parsed;
      } else {
        updates[key] = value;
      }

      saveConfig(updates, { global: cmdOpts.global });

      const configPath = getConfigPath({ global: cmdOpts.global });
      console.log(`${ctx.p('ok')}Set ${key}=${value} in ${configPath}`);
    });
}
