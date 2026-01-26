import type { Command } from 'commander';
import type { CliContext } from '../cli/shared.js';
import { getMissingCredentialsMessage, validateCredentials } from '../lib/credentials.js';
import { OnchainClient } from '../lib/onchain-client.js';
import { isEvmAddress, isSolanaAddress } from '../lib/utils/address.js';
import { formatCompactUsd, formatPercent, formatUsd } from '../lib/utils/formatters.js';

export function registerPortfolioCommand(program: Command, ctx: CliContext): void {
  program
    .command('portfolio')
    .description('Get full portfolio overview including DeFi positions')
    .argument('<address>', 'Wallet address (EVM 0x... or Solana)')
    .option('--json', 'Output as JSON')
    .action(async (address: string, cmdOpts: { json?: boolean }) => {
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

      // Validate credentials
      const creds = ctx.resolveCredentials();
      const validation = validateCredentials(creds);

      if (chainType === 'evm' && !validation.hasDebank) {
        console.error(`${ctx.p('err')}${getMissingCredentialsMessage('EVM portfolio data', ['debank'])}`);
        process.exit(1);
      }

      if (chainType === 'solana' && !validation.hasHelius) {
        console.error(`${ctx.p('err')}${getMissingCredentialsMessage('Solana portfolio data', ['helius'])}`);
        process.exit(1);
      }

      const client = new OnchainClient(clientOpts);
      const output = ctx.getOutput();
      const colors = ctx.colors;

      interface PortfolioData {
        address: string;
        chainType: string;
        tokens: {
          totalValueUsd: number;
          count: number;
          topHoldings: Array<{ symbol: string; valueUsd: number | null }>;
        };
        defi?: {
          totalValueUsd: number;
          positionCount: number;
          protocols: Array<{ name: string; valueUsd: number | null }>;
        };
        nfts?: {
          count: number;
          estimatedValueUsd?: number;
        };
        totalValueUsd: number;
      }

      const portfolioData: PortfolioData = {
        address,
        chainType,
        tokens: { totalValueUsd: 0, count: 0, topHoldings: [] },
        totalValueUsd: 0,
      };

      if (chainType === 'evm') {
        // Fetch token balances
        const balanceResult = await client.getEvmBalances(address);
        if (balanceResult.success) {
          portfolioData.tokens = {
            totalValueUsd: balanceResult.totalValueUsd,
            count: balanceResult.balances.length,
            topHoldings: balanceResult.balances.slice(0, 5).map((b) => ({
              symbol: b.symbol,
              valueUsd: b.valueUsd,
            })),
          };
          portfolioData.totalValueUsd += balanceResult.totalValueUsd;
        }

        // Fetch DeFi positions
        const defiResult = await client.getEvmDefiPositions(address);
        if (defiResult.success) {
          // Group by protocol
          const protocolTotals = new Map<string, number>();
          for (const pos of defiResult.positions) {
            const current = protocolTotals.get(pos.protocol) ?? 0;
            protocolTotals.set(pos.protocol, current + (pos.totalValueUsd ?? 0));
          }

          portfolioData.defi = {
            totalValueUsd: defiResult.totalValueUsd,
            positionCount: defiResult.positions.length,
            protocols: Array.from(protocolTotals.entries())
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5)
              .map(([name, valueUsd]) => ({ name, valueUsd })),
          };
          portfolioData.totalValueUsd += defiResult.totalValueUsd;
        }

        // Fetch NFTs
        const nftResult = await client.getEvmNfts(address);
        if (nftResult.success) {
          portfolioData.nfts = {
            count: nftResult.nfts.length,
            estimatedValueUsd: nftResult.totalEstimatedValueUsd,
          };
        }
      } else if (chainType === 'solana') {
        // Fetch token balances
        const balanceResult = await client.getSolanaBalances(address);
        if (balanceResult.success) {
          portfolioData.tokens = {
            totalValueUsd: balanceResult.totalValueUsd,
            count: balanceResult.balances.length,
            topHoldings: balanceResult.balances.slice(0, 5).map((b) => ({
              symbol: b.symbol,
              valueUsd: b.valueUsd,
            })),
          };
          portfolioData.totalValueUsd += balanceResult.totalValueUsd;
        }

        // Fetch NFTs
        const nftResult = await client.getSolanaNfts(address);
        if (nftResult.success) {
          portfolioData.nfts = {
            count: nftResult.nfts.length,
          };
        }
      }

      if (cmdOpts.json || output.json) {
        ctx.outputJson(portfolioData);
        return;
      }

      console.log();
      console.log(colors.section('Portfolio Overview'));
      console.log(colors.muted(address));
      console.log();

      // Total value
      console.log(colors.section(`Total Value: ${formatUsd(portfolioData.totalValueUsd)}`));
      console.log();

      // Token holdings
      console.log(colors.accent('Tokens'));
      console.log(`  ${portfolioData.tokens.count} tokens worth ${formatUsd(portfolioData.tokens.totalValueUsd)}`);
      if (portfolioData.tokens.topHoldings.length > 0) {
        console.log();
        for (const holding of portfolioData.tokens.topHoldings) {
          const valueStr = holding.valueUsd !== null ? formatUsd(holding.valueUsd) : '-';
          const pctStr =
            holding.valueUsd !== null && portfolioData.totalValueUsd > 0
              ? formatPercent((holding.valueUsd / portfolioData.totalValueUsd) * 100)
              : '';
          console.log(`    ${holding.symbol.padEnd(10)} ${valueStr.padStart(14)} ${colors.muted(pctStr)}`);
        }
      }
      console.log();

      // DeFi positions (EVM only)
      if (portfolioData.defi) {
        console.log(colors.accent('DeFi Positions'));
        console.log(
          `  ${portfolioData.defi.positionCount} positions worth ${formatUsd(portfolioData.defi.totalValueUsd)}`,
        );
        if (portfolioData.defi.protocols.length > 0) {
          console.log();
          for (const protocol of portfolioData.defi.protocols) {
            const valueStr = protocol.valueUsd !== null ? formatUsd(protocol.valueUsd) : '-';
            console.log(`    ${protocol.name.padEnd(20)} ${valueStr.padStart(14)}`);
          }
        }
        console.log();
      }

      // NFTs
      if (portfolioData.nfts && portfolioData.nfts.count > 0) {
        console.log(colors.accent('NFTs'));
        let nftLine = `  ${portfolioData.nfts.count} NFTs`;
        if (portfolioData.nfts.estimatedValueUsd) {
          nftLine += ` (est. ${formatCompactUsd(portfolioData.nfts.estimatedValueUsd)})`;
        }
        console.log(nftLine);
        console.log();
      }
    });
}
