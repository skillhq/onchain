import { Command } from 'commander';
import { registerBalanceCommand } from '../commands/balance.js';
import { registerBinanceCommands } from '../commands/binance.js';
import { registerCoinbaseCommands } from '../commands/coinbase.js';
import { registerConfigCommand } from '../commands/config.js';
import { registerHistoryCommand } from '../commands/history.js';
import { registerMarketsCommand } from '../commands/markets.js';
import { registerPolymarketCommands } from '../commands/polymarket.js';
import { registerPortfolioCommand } from '../commands/portfolio.js';
import { registerPriceCommand } from '../commands/price.js';
import { registerSetupCommand } from '../commands/setup.js';
import { registerTestCommand } from '../commands/test.js';
import { registerTxCommand } from '../commands/tx.js';
import type { CliContext } from './shared.js';

const version = process.env.ONCHAIN_VERSION ?? '0.1.0';
const gitSha = process.env.ONCHAIN_GIT_SHA ?? '';

export function createProgram(ctx: CliContext): Command {
  const program = new Command();

  program
    .name('onchain')
    .description('CLI for crypto portfolio tracking, market data, and CEX history')
    .version(gitSha ? `${version} (${gitSha})` : version, '-V, --version')
    .option('--plain', 'Disable colors and emoji')
    .option('--no-emoji', 'Disable emoji')
    .option('--no-color', 'Disable colors')
    .option('--json', 'Output as JSON')
    .option('--timeout <ms>', 'Request timeout in milliseconds')
    .hook('preAction', (thisCommand) => {
      ctx.applyOutputFromCommand(thisCommand);
    });

  // Register all commands
  registerBalanceCommand(program, ctx);
  registerHistoryCommand(program, ctx);
  registerPortfolioCommand(program, ctx);
  registerPriceCommand(program, ctx);
  registerMarketsCommand(program, ctx);
  registerTxCommand(program, ctx);
  registerCoinbaseCommands(program, ctx);
  registerBinanceCommands(program, ctx);
  registerPolymarketCommands(program, ctx);
  registerSetupCommand(program, ctx);
  registerConfigCommand(program, ctx);
  registerTestCommand(program, ctx);

  return program;
}
