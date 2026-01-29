import { SignClient } from '@walletconnect/sign-client';
import qrcode from 'qrcode-terminal';
import { encodeFunctionData, parseEther, parseUnits } from 'viem';
import type { AbstractConstructor, Mixin, OnchainClientBase } from '../onchain-client-base.js';
import { deleteSession, loadSession, saveSession } from '../walletconnect-session.js';
import {
  CHAIN_ID_MAP,
  type ChainNamespace,
  type DisconnectResult,
  getChainName,
  getEvmChainId,
  type SendEvmOptions,
  type SendSolanaOptions,
  type SendTransactionResult,
  type SwitchChainResult,
  type WalletConnectOptions,
  type WalletConnectResult,
  type WalletConnectSession,
  type WalletStatusResult,
} from '../walletconnect-types.js';

// ERC-20 transfer ABI for token transfers
const ERC20_TRANSFER_ABI = [
  {
    name: 'transfer',
    type: 'function',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

export interface WalletConnectMethods {
  walletConnect(options?: WalletConnectOptions): Promise<WalletConnectResult>;
  walletDisconnect(): Promise<DisconnectResult>;
  walletStatus(): Promise<WalletStatusResult>;
  walletSendEvm(options: SendEvmOptions): Promise<SendTransactionResult>;
  walletSendSolana(options: SendSolanaOptions): Promise<SendTransactionResult>;
  walletSwitchChain(chainName: string): Promise<SwitchChainResult>;
}

export function withWalletConnect<TBase extends AbstractConstructor<OnchainClientBase>>(
  Base: TBase,
): Mixin<TBase, WalletConnectMethods> {
  abstract class WalletConnectMixin extends Base implements WalletConnectMethods {
    private signClient: InstanceType<typeof SignClient> | null = null;

    private async getSignClient(): Promise<InstanceType<typeof SignClient>> {
      if (this.signClient) {
        return this.signClient;
      }

      if (!this.walletConnectProjectId) {
        throw new Error(
          'WalletConnect Project ID not configured. Run `onchain setup` or set WALLETCONNECT_PROJECT_ID.',
        );
      }

      this.signClient = await SignClient.init({
        projectId: this.walletConnectProjectId,
        metadata: {
          name: 'Onchain CLI',
          description: 'CLI for crypto portfolio tracking and wallet interactions',
          url: 'https://github.com/cyberdrk305/onchain',
          icons: ['https://avatars.githubusercontent.com/u/37784886'],
        },
      });

      return this.signClient;
    }

    async walletConnect(options: WalletConnectOptions = {}): Promise<WalletConnectResult> {
      try {
        // Check for existing session
        const existingSession = loadSession();
        if (existingSession) {
          return {
            success: true,
            address: existingSession.address,
            chainType: existingSession.chainType,
            chainId: existingSession.chainId,
            cluster: existingSession.cluster,
            walletName: existingSession.walletName,
          };
        }

        const client = await this.getSignClient();

        // Build namespaces based on options
        const requiredNamespaces: Record<string, { chains: string[]; methods: string[]; events: string[] }> = {};
        const optionalNamespaces: Record<string, { chains: string[]; methods: string[]; events: string[] }> = {};

        // Default to requesting Ethereum mainnet if no chains specified
        const evmChains = options.chains ?? ['ethereum'];
        const evmChainIds = evmChains.map((c) => getEvmChainId(c)).filter((id): id is number => id !== undefined);

        if (evmChainIds.length > 0) {
          const caipChains = evmChainIds.map((id) => `eip155:${id}`);
          requiredNamespaces.eip155 = {
            chains: caipChains,
            methods: [
              'eth_sendTransaction',
              'eth_signTransaction',
              'eth_sign',
              'personal_sign',
              'eth_signTypedData',
              'eth_signTypedData_v4',
              'wallet_switchEthereumChain',
              'wallet_addEthereumChain',
            ],
            events: ['chainChanged', 'accountsChanged'],
          };
        }

        // Add Solana namespace if requested
        if (options.solana) {
          optionalNamespaces.solana = {
            chains: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'], // mainnet-beta
            methods: ['solana_signTransaction', 'solana_signMessage'],
            events: [],
          };
        }

        // Create connection
        const { uri, approval } = await client.connect({
          requiredNamespaces,
          optionalNamespaces: Object.keys(optionalNamespaces).length > 0 ? optionalNamespaces : undefined,
        });

        if (!uri) {
          return { success: false, error: 'Failed to generate WalletConnect URI' };
        }

        // Display QR code
        console.log('\nScan this QR code with your wallet app:\n');
        qrcode.generate(uri, { small: true });
        console.log('\nOr copy this URI:', uri);
        console.log('\nWaiting for wallet connection...\n');

        // Wait for approval
        const session = await approval();

        // Extract account info from approved namespaces
        let address = '';
        let chainType: ChainNamespace = 'eip155';
        let chainId: number | undefined;
        let cluster: string | undefined;

        // Check EIP155 (EVM) accounts first
        const eip155Accounts = session.namespaces.eip155?.accounts;
        if (eip155Accounts && eip155Accounts.length > 0) {
          // Format: eip155:chainId:address
          const [, chainIdStr, addr] = eip155Accounts[0].split(':');
          address = addr;
          chainType = 'eip155';
          chainId = Number(chainIdStr);
        }

        // Check Solana accounts
        const solanaAccounts = session.namespaces.solana?.accounts;
        if (solanaAccounts && solanaAccounts.length > 0 && !address) {
          // Format: solana:cluster:address
          const [, clusterStr, addr] = solanaAccounts[0].split(':');
          address = addr;
          chainType = 'solana';
          cluster = clusterStr === '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' ? 'mainnet-beta' : clusterStr;
        }

        if (!address) {
          return { success: false, error: 'No accounts returned from wallet' };
        }

        // Get wallet name from peer metadata
        const walletName = session.peer.metadata.name;

        // Save session
        const wcSession: WalletConnectSession = {
          topic: session.topic,
          address,
          chainType,
          chainId,
          cluster,
          expiry: session.expiry,
          walletName,
          pairingTopic: session.pairingTopic,
        };
        saveSession(wcSession);

        return {
          success: true,
          address,
          chainType,
          chainId,
          cluster,
          walletName,
        };
      } catch (error) {
        // Clean up any partial state
        deleteSession();
        return {
          success: false,
          error: `WalletConnect error: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    async walletDisconnect(): Promise<DisconnectResult> {
      try {
        const session = loadSession();
        if (!session) {
          return { success: true }; // Already disconnected
        }

        try {
          const client = await this.getSignClient();
          await client.disconnect({
            topic: session.topic,
            reason: { code: 6000, message: 'User disconnected' },
          });
        } catch {
          // Ignore disconnect errors - session may have already expired
        }

        deleteSession();
        this.signClient = null;

        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: `Disconnect error: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    async walletStatus(): Promise<WalletStatusResult> {
      try {
        const session = loadSession();
        if (!session) {
          return { success: true, connected: false };
        }

        return {
          success: true,
          connected: true,
          address: session.address,
          chainType: session.chainType,
          chainId: session.chainId,
          chainName: session.chainId ? getChainName(session.chainId) : undefined,
          cluster: session.cluster,
          walletName: session.walletName,
          expiresAt: session.expiry,
        };
      } catch (error) {
        return {
          success: false,
          error: `Status error: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    async walletSendEvm(options: SendEvmOptions): Promise<SendTransactionResult> {
      try {
        const session = loadSession();
        if (!session) {
          return { success: false, error: 'No wallet connected. Run `onchain wallet connect` first.' };
        }

        if (session.chainType !== 'eip155') {
          return { success: false, error: 'Connected wallet is not an EVM wallet. Connect with --chain option.' };
        }

        const client = await this.getSignClient();
        const chainId = options.chainId ?? session.chainId ?? 1;

        let txData: string | undefined;
        let toAddress = options.to;
        let value = '0x0';

        if (options.tokenAddress) {
          // ERC-20 transfer
          const decimals = options.decimals ?? 18;
          const amountWei = parseUnits(options.amount, decimals);

          txData = encodeFunctionData({
            abi: ERC20_TRANSFER_ABI,
            functionName: 'transfer',
            args: [options.to as `0x${string}`, amountWei],
          });
          toAddress = options.tokenAddress;
        } else {
          // Native token transfer
          value = `0x${parseEther(options.amount).toString(16)}`;
        }

        const tx = {
          from: session.address,
          to: toAddress,
          value,
          data: txData,
        };

        const result = await client.request<string>({
          topic: session.topic,
          chainId: `eip155:${chainId}`,
          request: {
            method: 'eth_sendTransaction',
            params: [tx],
          },
        });

        return {
          success: true,
          txHash: result,
          chainType: 'eip155',
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        // Handle user rejection
        if (message.includes('rejected') || message.includes('denied') || message.includes('cancelled')) {
          return { success: false, error: 'Transaction rejected by user' };
        }

        return {
          success: false,
          error: `Send transaction error: ${message}`,
        };
      }
    }

    async walletSendSolana(_options: SendSolanaOptions): Promise<SendTransactionResult> {
      // Solana transaction sending via WalletConnect requires:
      // 1. A Solana RPC endpoint to fetch recent blockhash
      // 2. Transaction serialization and signing via WalletConnect
      // 3. Submission of signed transaction to RPC
      //
      // For now, return an error indicating this limitation.
      // Full implementation would use the Helius RPC endpoint.
      return {
        success: false,
        error: 'Solana transactions via WalletConnect not yet implemented. Use a wallet app directly.',
      };
    }

    async walletSwitchChain(chainName: string): Promise<SwitchChainResult> {
      try {
        const session = loadSession();
        if (!session) {
          return { success: false, error: 'No wallet connected. Run `onchain wallet connect` first.' };
        }

        if (session.chainType !== 'eip155') {
          return { success: false, error: 'Chain switching only supported for EVM wallets' };
        }

        const chainId = CHAIN_ID_MAP[chainName.toLowerCase()];
        if (!chainId) {
          return { success: false, error: `Unknown chain: ${chainName}` };
        }

        const client = await this.getSignClient();

        try {
          await client.request({
            topic: session.topic,
            chainId: `eip155:${session.chainId ?? 1}`,
            request: {
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: `0x${chainId.toString(16)}` }],
            },
          });
        } catch (error) {
          // If chain not added, try to add it
          const message = error instanceof Error ? error.message : String(error);
          if (message.includes('4902') || message.includes('Unrecognized chain')) {
            return { success: false, error: `Chain ${chainName} not configured in wallet. Please add it manually.` };
          }
          throw error;
        }

        // Update session with new chain ID
        session.chainId = chainId;
        saveSession(session);

        return {
          success: true,
          chainId,
          chainName: getChainName(chainId),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (message.includes('rejected') || message.includes('denied')) {
          return { success: false, error: 'Chain switch rejected by user' };
        }

        return {
          success: false,
          error: `Switch chain error: ${message}`,
        };
      }
    }
  }

  return WalletConnectMixin;
}
