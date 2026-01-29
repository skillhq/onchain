// WalletConnect session types and chain mappings

export type ChainNamespace = 'eip155' | 'solana';

// WalletConnect session stored on disk
export interface WalletConnectSession {
  topic: string;
  address: string;
  chainId?: number; // EVM chain ID
  cluster?: string; // Solana cluster (mainnet-beta, devnet, testnet)
  chainType: ChainNamespace;
  expiry: number; // Unix timestamp
  walletName?: string;
  pairingTopic?: string;
}

// EVM chain ID mappings
export const CHAIN_ID_MAP: Record<string, number> = {
  ethereum: 1,
  mainnet: 1,
  eth: 1,
  goerli: 5,
  sepolia: 11155111,
  polygon: 137,
  matic: 137,
  arbitrum: 42161,
  arb: 42161,
  optimism: 10,
  op: 10,
  base: 8453,
  avalanche: 43114,
  avax: 43114,
  bsc: 56,
  binance: 56,
  fantom: 250,
  ftm: 250,
  gnosis: 100,
  xdai: 100,
  zksync: 324,
  linea: 59144,
  scroll: 534352,
  blast: 81457,
  mantle: 5000,
  manta: 169,
  mode: 34443,
  celo: 42220,
  moonbeam: 1284,
  moonriver: 1285,
  aurora: 1313161554,
};

// Reverse mapping: chain ID to name
export const CHAIN_ID_TO_NAME: Record<number, string> = {
  1: 'Ethereum',
  5: 'Goerli',
  11155111: 'Sepolia',
  137: 'Polygon',
  42161: 'Arbitrum',
  10: 'Optimism',
  8453: 'Base',
  43114: 'Avalanche',
  56: 'BNB Chain',
  250: 'Fantom',
  100: 'Gnosis',
  324: 'zkSync Era',
  59144: 'Linea',
  534352: 'Scroll',
  81457: 'Blast',
  5000: 'Mantle',
  169: 'Manta',
  34443: 'Mode',
  42220: 'Celo',
  1284: 'Moonbeam',
  1285: 'Moonriver',
  1313161554: 'Aurora',
};

// Solana clusters
export const SOLANA_CLUSTERS = ['mainnet-beta', 'devnet', 'testnet'] as const;
export type SolanaCluster = (typeof SOLANA_CLUSTERS)[number];

// Convert chain name to WalletConnect CAIP-2 chain identifier
export function getEvmChainId(chainName: string): number | undefined {
  return CHAIN_ID_MAP[chainName.toLowerCase()];
}

export function getChainName(chainId: number): string {
  return CHAIN_ID_TO_NAME[chainId] ?? `Chain ${chainId}`;
}

// WalletConnect result types
export type WalletConnectResult =
  | {
      success: true;
      address: string;
      chainType: ChainNamespace;
      chainId?: number;
      cluster?: string;
      walletName?: string;
    }
  | { success: false; error: string };

export type SendTransactionResult =
  | { success: true; txHash: string; chainType: ChainNamespace }
  | { success: false; error: string };

export type WalletStatusResult =
  | {
      success: true;
      connected: true;
      address: string;
      chainType: ChainNamespace;
      chainId?: number;
      chainName?: string;
      cluster?: string;
      walletName?: string;
      expiresAt: number;
    }
  | { success: true; connected: false }
  | { success: false; error: string };

export type SwitchChainResult =
  | { success: true; chainId: number; chainName: string }
  | { success: false; error: string };

export type DisconnectResult = { success: true } | { success: false; error: string };

// Send transaction options
export interface SendEvmOptions {
  to: string;
  amount: string; // In native units (ETH, MATIC, etc.)
  tokenAddress?: string; // For ERC-20 transfers
  decimals?: number; // Token decimals (default 18)
  chainId?: number;
}

export interface SendSolanaOptions {
  to: string;
  amount: string; // In SOL or token units
  tokenMint?: string; // For SPL token transfers
  decimals?: number; // Token decimals (default 9 for SOL)
  cluster?: SolanaCluster;
}

// Connect options
export interface WalletConnectOptions {
  chains?: string[]; // EVM chain names to request
  solana?: boolean; // Include Solana namespace
  projectId?: string; // Override default project ID
}
