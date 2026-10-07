import type { Command } from 'commander';
import type { CliContext } from '../cli/shared.js';
import { getConfigPath, migrateSecretsToKeychain, saveConfig } from '../lib/config.js';
import { validateCredentials } from '../lib/credentials.js';
import { readKeychainSecrets } from '../lib/keychain.js';

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
      const keychain = readKeychainSecrets();
      const sourceOf = (field: keyof typeof keychain, resolved: string | undefined): string | undefined => {
        if (!resolved) {
          return undefined;
        }
        if (config[field] === resolved) {
          return 'config';
        }
        return keychain[field] === resolved ? 'keychain' : 'env';
      };

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

      console.log(credStatus('DeBank', validation.hasDebank, sourceOf('debankApiKey', creds.debankApiKey)));
      console.log(credStatus('Helius', validation.hasHelius, sourceOf('heliusApiKey', creds.heliusApiKey)));
      console.log(credStatus('Coinbase', validation.hasCoinbase, sourceOf('coinbaseApiKeyId', creds.coinbaseApiKeyId)));
      console.log(credStatus('Binance', validation.hasBinance, sourceOf('binanceApiKey', creds.binanceApiKey)));
      console.log(credStatus('CoinGecko', validation.hasCoinGecko, sourceOf('coingeckoApiKey', creds.coingeckoApiKey)));
      console.log(
        credStatus(
          'CoinMarketCap',
          validation.hasCoinMarketCap,
          sourceOf('coinmarketcapApiKey', creds.coinmarketcapApiKey),
        ),
      );
      console.log();

      // Settings
      console.log(colors.accent('Settings:'));
      console.log(`  Timeout: ${config.timeoutMs ?? 30000}ms`);
      console.log();
    });

  configCmd
    .command('migrate-keychain')
    .description('Move API keys from config files into the macOS Keychain')
    .action(() => {
      try {
        const moved = migrateSecretsToKeychain();
        if (moved.length === 0) {
          console.log(`${ctx.p('info')}No API keys found in config files.`);
          return;
        }
        for (const { path, fields } of moved) {
          console.log(`${ctx.p('ok')}Moved ${fields.join(', ')} from ${path} to the Keychain`);
        }
      } catch (error) {
        console.error(`${ctx.p('err')}${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
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
