import type { Command } from 'commander';
import { runSetupWizard } from '../cli/setup-wizard.js';
import type { CliContext } from '../cli/shared.js';
import { getConfigPath, saveConfig } from '../lib/config.js';

export function registerSetupCommand(program: Command, ctx: CliContext): void {
  program
    .command('setup')
    .description('Interactive setup wizard for configuring wallets and API keys')
    .option('--global', 'Save configuration globally (~/.config/onchain/config.json5)')
    .action(async (cmdOpts: { global?: boolean }) => {
      const colors = ctx.colors;

      try {
        const configUpdates = await runSetupWizard(ctx.config, colors);

        if (Object.keys(configUpdates).length === 0) {
          console.log(colors.muted('No changes made.'));
          return;
        }

        saveConfig(configUpdates, { global: cmdOpts.global });

        const configPath = getConfigPath({ global: cmdOpts.global });
        console.log(`${ctx.p('ok')}Configuration saved to ${configPath}`);
        console.log();

        // Show what was configured
        const apiKeys = [
          configUpdates.debankApiKey ? 'DeBank' : null,
          configUpdates.heliusApiKey ? 'Helius' : null,
          configUpdates.coinbaseApiKeyId ? 'Coinbase' : null,
          configUpdates.binanceApiKey ? 'Binance' : null,
          configUpdates.coingeckoApiKey ? 'CoinGecko' : null,
          configUpdates.coinmarketcapApiKey ? 'CoinMarketCap' : null,
          configUpdates.etherscanApiKey ? 'Etherscan' : null,
          configUpdates.solscanApiKey ? 'Solscan' : null,
        ].filter(Boolean);

        if (apiKeys.length > 0) {
          console.log(colors.accent('API keys configured:'));
          console.log(`  ${apiKeys.join(', ')}`);
          console.log();
        }

        // Show Polymarket preferences if configured
        if (configUpdates.polymarket) {
          console.log(colors.accent('Polymarket preferences:'));
          if (configUpdates.polymarket.excludeTags?.length) {
            console.log(`  Exclude tags: ${configUpdates.polymarket.excludeTags.join(', ')}`);
          }
          if (configUpdates.polymarket.includeTags?.length) {
            console.log(`  Include tags: ${configUpdates.polymarket.includeTags.join(', ')}`);
          }
          console.log();
        }

        console.log(colors.muted('Run `onchain config` to view your configuration.'));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ERR_USE_AFTER_CLOSE') {
          // User pressed Ctrl+C
          console.log();
          console.log(colors.muted('Setup cancelled.'));
          return;
        }
        throw error;
      }
    });
}
