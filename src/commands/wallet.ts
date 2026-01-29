import type { Command } from 'commander';
import type { CliContext } from '../cli/shared.js';
import { getMissingCredentialsMessage, validateCredentials } from '../lib/credentials.js';
import { OnchainClient } from '../lib/onchain-client.js';
import { getChainName } from '../lib/walletconnect-types.js';

// Base58 characters (no 0, O, I, l) - at module level for performance
const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

// Detect if address is Solana (base58, 32-44 chars) or EVM (0x prefix, 42 chars)
function isSolanaAddress(address: string): boolean {
  // Solana addresses are base58 encoded, typically 32-44 chars, no 0x prefix
  if (address.startsWith('0x')) {
    return false;
  }
  return BASE58_REGEX.test(address);
}

function formatExpiry(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (diffDays > 0) {
    return `${diffDays}d ${diffHours}h`;
  }
  if (diffHours > 0) {
    return `${diffHours}h`;
  }
  return 'soon';
}

export function registerWalletCommand(program: Command, ctx: CliContext): void {
  const wallet = program.command('wallet').description('Wallet connectivity via WalletConnect');

  wallet
    .command('connect')
    .description('Connect a wallet by scanning QR code')
    .option('--chain <chains>', 'EVM chains to request (comma-separated)', 'ethereum')
    .option('--solana', 'Include Solana namespace')
    .option('--json', 'Output as JSON')
    .action(async (cmdOpts: { chain?: string; solana?: boolean; json?: boolean }) => {
      const opts = program.opts();
      const timeoutMs = ctx.resolveTimeoutFromOptions(opts);
      const clientOpts = ctx.getClientOptions();
      clientOpts.timeoutMs = timeoutMs;

      // Validate WalletConnect credentials
      const creds = ctx.resolveCredentials();
      const validation = validateCredentials(creds);

      if (!validation.hasWalletConnect) {
        console.error(`${ctx.p('err')}${getMissingCredentialsMessage('Wallet connect', ['walletconnect'])}`);
        process.exit(1);
      }

      const client = new OnchainClient(clientOpts);

      const chains = cmdOpts.chain ? cmdOpts.chain.split(',').map((c) => c.trim()) : ['ethereum'];

      const result = await client.walletConnect({
        chains,
        solana: cmdOpts.solana,
      });

      const output = ctx.getOutput();
      const colors = ctx.colors;

      if (!result.success) {
        if (cmdOpts.json || output.json) {
          ctx.outputJson({ success: false, error: result.error });
        } else {
          console.error(`${ctx.p('err')}${result.error}`);
        }
        process.exit(1);
      }

      if (cmdOpts.json || output.json) {
        ctx.outputJson({
          success: true,
          address: result.address,
          chainType: result.chainType,
          chainId: result.chainId,
          chainName: result.chainId ? getChainName(result.chainId) : undefined,
          cluster: result.cluster,
          walletName: result.walletName,
        });
        return;
      }

      console.log();
      console.log(`${ctx.p('ok')}Wallet connected!`);
      console.log();
      console.log(`  Address: ${colors.accent(result.address)}`);
      if (result.walletName) {
        console.log(`  Wallet:  ${result.walletName}`);
      }
      if (result.chainType === 'eip155' && result.chainId) {
        console.log(`  Chain:   ${getChainName(result.chainId)} (${result.chainId})`);
      } else if (result.chainType === 'solana') {
        console.log(`  Network: Solana ${result.cluster ?? 'mainnet-beta'}`);
      }
      console.log();
    });

  wallet
    .command('disconnect')
    .description('Disconnect the connected wallet')
    .option('--json', 'Output as JSON')
    .action(async (cmdOpts: { json?: boolean }) => {
      const clientOpts = ctx.getClientOptions();
      const client = new OnchainClient(clientOpts);

      const result = await client.walletDisconnect();

      const output = ctx.getOutput();

      if (!result.success) {
        if (cmdOpts.json || output.json) {
          ctx.outputJson({ success: false, error: result.error });
        } else {
          console.error(`${ctx.p('err')}${result.error}`);
        }
        process.exit(1);
      }

      if (cmdOpts.json || output.json) {
        ctx.outputJson({ success: true });
        return;
      }

      console.log(`${ctx.p('ok')}Wallet disconnected`);
    });

  wallet
    .command('status')
    .description('Check wallet connection status')
    .option('--json', 'Output as JSON')
    .action(async (cmdOpts: { json?: boolean }) => {
      const clientOpts = ctx.getClientOptions();
      const client = new OnchainClient(clientOpts);

      const result = await client.walletStatus();

      const output = ctx.getOutput();
      const colors = ctx.colors;

      if (!result.success) {
        if (cmdOpts.json || output.json) {
          ctx.outputJson({ success: false, error: result.error });
        } else {
          console.error(`${ctx.p('err')}${result.error}`);
        }
        process.exit(1);
      }

      if (cmdOpts.json || output.json) {
        ctx.outputJson(result);
        return;
      }

      if (!result.connected) {
        console.log(`${ctx.p('info')}No wallet connected`);
        console.log(colors.muted('  Run `onchain wallet connect` to connect a wallet'));
        return;
      }

      console.log();
      console.log(colors.section('Wallet Status'));
      console.log();
      console.log(`  ${ctx.p('ok')}Connected`);
      console.log(`  Address: ${colors.accent(result.address)}`);
      if (result.walletName) {
        console.log(`  Wallet:  ${result.walletName}`);
      }
      if (result.chainType === 'eip155' && result.chainId) {
        console.log(`  Chain:   ${result.chainName ?? getChainName(result.chainId)} (${result.chainId})`);
      } else if (result.chainType === 'solana') {
        console.log(`  Network: Solana ${result.cluster ?? 'mainnet-beta'}`);
      }
      console.log(`  Expires: ${formatExpiry(result.expiresAt)}`);
      console.log();
    });

  wallet
    .command('send')
    .description('Send tokens to an address')
    .argument('<to>', 'Recipient address')
    .argument('<amount>', 'Amount to send')
    .option('--chain <chain>', 'EVM chain (ethereum, polygon, base, etc.)')
    .option('--solana', 'Send on Solana network')
    .option('--token <address>', 'Token contract address (for ERC-20/SPL transfers)')
    .option('--decimals <n>', 'Token decimals (default: 18 for EVM, 9 for Solana)')
    .option('--json', 'Output as JSON')
    .action(
      async (
        to: string,
        amount: string,
        cmdOpts: { chain?: string; solana?: boolean; token?: string; decimals?: string; json?: boolean },
      ) => {
        const opts = program.opts();
        const timeoutMs = ctx.resolveTimeoutFromOptions(opts);
        const clientOpts = ctx.getClientOptions();
        clientOpts.timeoutMs = timeoutMs;

        const client = new OnchainClient(clientOpts);
        const output = ctx.getOutput();
        const colors = ctx.colors;

        // Auto-detect chain type from address if not specified
        const useSolana = cmdOpts.solana || (!cmdOpts.chain && isSolanaAddress(to));

        if (useSolana) {
          // Solana transfer
          const result = await client.walletSendSolana({
            to,
            amount,
            tokenMint: cmdOpts.token,
            decimals: cmdOpts.decimals ? Number.parseInt(cmdOpts.decimals, 10) : undefined,
          });

          if (!result.success) {
            if (cmdOpts.json || output.json) {
              ctx.outputJson({ success: false, error: result.error });
            } else {
              console.error(`${ctx.p('err')}${result.error}`);
            }
            process.exit(1);
          }

          if (cmdOpts.json || output.json) {
            ctx.outputJson({ success: true, txHash: result.txHash, chainType: 'solana' });
            return;
          }

          console.log();
          console.log(`${ctx.p('ok')}Transaction sent!`);
          console.log(`  Hash: ${colors.accent(result.txHash)}`);
          console.log(`  Explorer: https://solscan.io/tx/${result.txHash}`);
          console.log();
        } else {
          // EVM transfer
          const { CHAIN_ID_MAP } = await import('../lib/walletconnect-types.js');
          const chainId = cmdOpts.chain ? CHAIN_ID_MAP[cmdOpts.chain.toLowerCase()] : undefined;

          const result = await client.walletSendEvm({
            to,
            amount,
            tokenAddress: cmdOpts.token,
            decimals: cmdOpts.decimals ? Number.parseInt(cmdOpts.decimals, 10) : undefined,
            chainId,
          });

          if (!result.success) {
            if (cmdOpts.json || output.json) {
              ctx.outputJson({ success: false, error: result.error });
            } else {
              console.error(`${ctx.p('err')}${result.error}`);
            }
            process.exit(1);
          }

          if (cmdOpts.json || output.json) {
            ctx.outputJson({ success: true, txHash: result.txHash, chainType: 'eip155', chainId });
            return;
          }

          // Get explorer URL based on chain
          const explorerBaseUrls: Record<number, string> = {
            1: 'https://etherscan.io/tx/',
            137: 'https://polygonscan.com/tx/',
            42161: 'https://arbiscan.io/tx/',
            10: 'https://optimistic.etherscan.io/tx/',
            8453: 'https://basescan.org/tx/',
            43114: 'https://snowtrace.io/tx/',
            56: 'https://bscscan.com/tx/',
            250: 'https://ftmscan.com/tx/',
          };
          const explorerUrl = chainId ? explorerBaseUrls[chainId] : explorerBaseUrls[1];

          console.log();
          console.log(`${ctx.p('ok')}Transaction sent!`);
          console.log(`  Hash: ${colors.accent(result.txHash)}`);
          if (explorerUrl) {
            console.log(`  Explorer: ${explorerUrl}${result.txHash}`);
          }
          console.log();
        }
      },
    );

  wallet
    .command('switch')
    .description('Switch EVM chain')
    .argument('<chain>', 'Chain name (ethereum, polygon, base, arbitrum, etc.)')
    .option('--json', 'Output as JSON')
    .action(async (chain: string, cmdOpts: { json?: boolean }) => {
      const clientOpts = ctx.getClientOptions();
      const client = new OnchainClient(clientOpts);

      const result = await client.walletSwitchChain(chain);

      const output = ctx.getOutput();

      if (!result.success) {
        if (cmdOpts.json || output.json) {
          ctx.outputJson({ success: false, error: result.error });
        } else {
          console.error(`${ctx.p('err')}${result.error}`);
        }
        process.exit(1);
      }

      if (cmdOpts.json || output.json) {
        ctx.outputJson({ success: true, chainId: result.chainId, chainName: result.chainName });
        return;
      }

      console.log(`${ctx.p('ok')}Switched to ${result.chainName} (${result.chainId})`);
    });
}
