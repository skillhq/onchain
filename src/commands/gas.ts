import type { Command } from 'commander';
import type { CliContext } from '../cli/shared.js';
import { OnchainClient } from '../lib/onchain-client.js';
import type { EtherscanChain } from '../lib/onchain-client-types.js';

// Only chains that support Etherscan's gas oracle API
const SUPPORTED_CHAINS: EtherscanChain[] = ['ethereum', 'polygon'];

const CHAIN_DISPLAY_NAMES: Record<EtherscanChain, string> = {
  ethereum: 'Ethereum',
  polygon: 'Polygon',
  bsc: 'BNB Chain',
  arbitrum: 'Arbitrum',
  base: 'Base',
  optimism: 'Optimism',
  avalanche: 'Avalanche',
  fantom: 'Fantom',
};

export function registerGasCommand(program: Command, ctx: CliContext): void {
  program
    .command('gas')
    .description('Get current gas prices for EVM chains')
    .option('-c, --chain <chain>', `Chain to check (${SUPPORTED_CHAINS.join(', ')})`, 'ethereum')
    .option('--json', 'Output as JSON')
    .action(async (cmdOpts: { chain: string; json?: boolean }) => {
      const opts = program.opts();
      const timeoutMs = ctx.resolveTimeoutFromOptions(opts);
      const clientOpts = ctx.getClientOptions();
      clientOpts.timeoutMs = timeoutMs;

      const chain = cmdOpts.chain.toLowerCase() as EtherscanChain;
      if (!SUPPORTED_CHAINS.includes(chain)) {
        console.error(`${ctx.p('err')}Invalid chain: ${cmdOpts.chain}`);
        console.error(`Supported chains: ${SUPPORTED_CHAINS.join(', ')}`);
        process.exit(1);
      }

      const client = new OnchainClient(clientOpts);
      const result = await client.getGasEstimate(chain);

      if (!result.success) {
        console.error(`${ctx.p('err')}${result.error}`);
        process.exit(1);
      }

      const output = ctx.getOutput();

      if (cmdOpts.json || output.json) {
        ctx.outputJson(result.gas);
        return;
      }

      const g = result.gas;
      const colors = ctx.colors;
      const chainName = CHAIN_DISPLAY_NAMES[chain];

      console.log();
      console.log(colors.section(`Gas Prices - ${chainName}`));
      console.log();

      // Gas prices in gwei
      console.log(`Slow:     ${colors.muted(g.safeGasPrice.toString())} gwei`);
      console.log(`Standard: ${g.proposeGasPrice} gwei`);
      console.log(`Fast:     ${colors.positive(g.fastGasPrice.toString())} gwei`);

      if (g.suggestBaseFee !== undefined) {
        console.log();
        console.log(`Base Fee: ${g.suggestBaseFee.toFixed(2)} gwei`);
      }

      console.log();
    });
}
