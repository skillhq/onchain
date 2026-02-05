import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { registerBalanceCommand } from '../commands/balance.js';
import { registerBinanceCommands } from '../commands/binance.js';
import { registerCoinbaseCommands } from '../commands/coinbase.js';
import { registerConfigCommand } from '../commands/config.js';
import { registerGasCommand } from '../commands/gas.js';
import { registerHistoryCommand } from '../commands/history.js';
import { registerMarketsCommand } from '../commands/markets.js';
import { registerNansenCommands } from '../commands/nansen.js';
import { registerPolymarketCommands } from '../commands/polymarket.js';
import { registerPortfolioCommand } from '../commands/portfolio.js';
import { registerPriceCommand } from '../commands/price.js';
import { registerSearchCommand } from '../commands/search.js';
import { registerSetupCommand } from '../commands/setup.js';
import { registerTestCommand } from '../commands/test.js';
import { registerTxCommand } from '../commands/tx.js';
import { registerWalletCommand } from '../commands/wallet.js';
import type { CliContext } from './shared.js';

// Read version from package.json (works in both dev and built modes)
function getPackageVersion(): string {
  // Check env var first (set during binary build)
  if (process.env.ONCHAIN_VERSION) {
    return process.env.ONCHAIN_VERSION;
  }
  // Fall back to reading package.json
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    // In dev: src/cli/program.ts -> ../../package.json
    // In dist: dist/cli/program.js -> ../../package.json
    const pkgPath = join(__dirname, '..', '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string };
    return pkg.version;
  } catch {
    return '0.0.0';
  }
}

const version = getPackageVersion();
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
  registerGasCommand(program, ctx);
  registerSearchCommand(program, ctx);
  registerTxCommand(program, ctx);
  registerCoinbaseCommands(program, ctx);
  registerBinanceCommands(program, ctx);
  registerPolymarketCommands(program, ctx);
  registerNansenCommands(program, ctx);
  registerWalletCommand(program, ctx);
  registerSetupCommand(program, ctx);
  registerConfigCommand(program, ctx);
  registerTestCommand(program, ctx);

  return program;
}
