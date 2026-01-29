// Supported blockchain types
export type ChainType = 'evm' | 'solana';

// Etherscan-compatible chain identifiers
export type EtherscanChain = 'ethereum' | 'polygon' | 'bsc' | 'arbitrum' | 'base' | 'optimism' | 'avalanche' | 'fantom';

// Supported EVM chains (DeBank supported)
export type EvmChain =
  | 'eth'
  | 'bsc'
  | 'polygon'
  | 'arb'
  | 'op'
  | 'avax'
  | 'base'
  | 'zksync'
  | 'linea'
  | 'scroll'
  | 'blast'
  | 'mantle'
  | 'manta'
  | 'mode'
  | 'gnosis'
  | 'fantom'
  | 'celo'
  | 'aurora'
  | 'moonbeam'
  | 'moonriver'
  | 'cronos'
  | 'harmony'
  | 'metis'
  | 'boba'
  | 'kcc'
  | 'okc'
  | 'heco';

export type SupportedChain = EvmChain | 'solana';

// Token balance
export interface TokenBalance {
  symbol: string;
  name: string;
  chain: SupportedChain;
  contractAddress?: string;
  balanceRaw: string;
  balanceFormatted: number;
  decimals: number;
  priceUsd: number | null;
  valueUsd: number | null;
  logoUrl?: string;
}

// NFT asset
export interface NftAsset {
  id: string;
  name: string;
  collection: string;
  chain: SupportedChain;
  contractAddress: string;
  tokenId: string;
  imageUrl?: string;
  floorPriceUsd?: number;
}

// DeFi position
export interface DefiPosition {
  protocol: string;
  protocolLogoUrl?: string;
  chain: SupportedChain;
  type: 'lending' | 'staking' | 'liquidity' | 'farming' | 'vesting' | 'other';
  assets: Array<{
    symbol: string;
    amount: number;
    valueUsd: number | null;
  }>;
  totalValueUsd: number | null;
  healthFactor?: number;
}

// Transaction history
export interface Transaction {
  id: string;
  hash: string;
  chain: SupportedChain;
  timestamp: number;
  type: 'send' | 'receive' | 'swap' | 'approve' | 'contract' | 'other';
  status: 'success' | 'failed' | 'pending';
  from: string;
  to: string;
  valueUsd?: number;
  fee?: {
    amount: number;
    symbol: string;
    valueUsd?: number;
  };
  tokens?: Array<{
    symbol: string;
    amount: number;
    direction: 'in' | 'out';
    valueUsd?: number;
  }>;
}

// Token price data
export interface TokenPrice {
  id: string;
  symbol: string;
  name: string;
  priceUsd: number;
  priceChange1h?: number;
  priceChange24h?: number;
  priceChange7d?: number;
  priceChange30d?: number;
  marketCap?: number;
  marketCapRank?: number;
  volume24h?: number;
  circulatingSupply?: number;
  totalSupply?: number;
  maxSupply?: number;
  ath?: number;
  athDate?: string;
  athChangePercent?: number;
  atl?: number;
  atlDate?: string;
  atlChangePercent?: number;
  lastUpdated?: string;
  logoUrl?: string;
}

// Market overview
export interface MarketOverview {
  totalMarketCap: number;
  totalVolume24h: number;
  btcDominance: number;
  ethDominance?: number;
  marketCapChange24h?: number;
  trending?: Array<{
    id: string;
    symbol: string;
    name: string;
    priceChange24h?: number;
    marketCapRank?: number;
  }>;
}

// CEX balance
export interface CexBalance {
  exchange: 'coinbase' | 'binance';
  asset: string;
  free: number;
  locked: number;
  total: number;
  valueUsd?: number;
}

// CEX trade
export interface CexTrade {
  exchange: 'coinbase' | 'binance';
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  price: number;
  quantity: number;
  total: number;
  fee?: number;
  feeAsset?: string;
  timestamp: number;
  orderId?: string;
}

// Polymarket types
export interface PolymarketMarket {
  id: string;
  question: string;
  description?: string;
  endDate?: string;
  volume: number;
  liquidity: number;
  outcomes: Array<{
    name: string;
    price: number;
  }>;
  category?: string;
  slug?: string;
  tags?: string[];
}

export interface PolymarketTag {
  id: string;
  slug: string;
  label: string;
  eventCount?: number;
}

export interface PolymarketFilterOptions {
  limit?: number;
  excludeTags?: string[];
  includeTags?: string[];
  minVolume?: number;
  minLiquidity?: number;
}

export interface PolymarketSentimentSignal {
  question: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  confidence: number; // 0-100, how strong the signal is
  probability: number; // The relevant probability (e.g., "Yes" for bullish outcomes)
  volume: number;
  slug?: string;
}

export interface PolymarketSentiment {
  topic: string;
  overallSentiment: 'bullish' | 'bearish' | 'neutral' | 'mixed';
  sentimentScore: number; // -100 (very bearish) to +100 (very bullish)
  confidence: number; // 0-100, based on volume and signal strength
  signals: PolymarketSentimentSignal[];
  summary: string;
}

// Detailed transaction info (for tx lookup)
export interface TransactionDetail {
  hash: string;
  chain: EtherscanChain | 'solana';
  blockNumber: number;
  timestamp: number;
  status: 'success' | 'failed' | 'pending';
  from: string;
  to: string | null;
  value: string;
  valueFormatted: number;
  fee: {
    amount: number;
    symbol: string;
    valueUsd?: number;
  };
  gasUsed?: number;
  gasLimit?: number;
  gasPrice?: string;
  methodId?: string;
  methodName?: string;
  tokenTransfers?: TokenTransfer[];
  internalTransactions?: InternalTransaction[];
  explorerUrl?: string;
}

// Token transfer within a transaction
export interface TokenTransfer {
  tokenType: 'ERC20' | 'ERC721' | 'ERC1155' | 'SPL';
  contractAddress: string;
  from: string;
  to: string;
  tokenId?: string;
  amount?: string;
  amountFormatted?: number;
  symbol?: string;
  decimals?: number;
}

// Internal transaction (EVM)
export interface InternalTransaction {
  from: string;
  to: string;
  value: string;
  valueFormatted: number;
  type: string;
  gasUsed?: number;
  isError?: boolean;
}

// Result types (tagged unions for error handling)
export type BalanceResult =
  | { success: true; balances: TokenBalance[]; totalValueUsd: number }
  | { success: false; error: string };

export type NftResult =
  | { success: true; nfts: NftAsset[]; totalEstimatedValueUsd?: number }
  | { success: false; error: string };

export type DefiResult =
  | { success: true; positions: DefiPosition[]; totalValueUsd: number }
  | { success: false; error: string };

export type HistoryResult =
  | { success: true; transactions: Transaction[]; nextCursor?: string }
  | { success: false; error: string };

export type PriceResult = { success: true; token: TokenPrice } | { success: false; error: string };

export type PricesResult = { success: true; tokens: TokenPrice[] } | { success: false; error: string };

export type MarketResult = { success: true; market: MarketOverview } | { success: false; error: string };

export type CexBalanceResult =
  | { success: true; balances: CexBalance[]; totalValueUsd: number }
  | { success: false; error: string };

export type CexHistoryResult =
  | { success: true; trades: CexTrade[]; nextCursor?: string }
  | { success: false; error: string };

export type PolymarketResult = { success: true; markets: PolymarketMarket[] } | { success: false; error: string };

export type PolymarketDetailResult = { success: true; market: PolymarketMarket } | { success: false; error: string };

export type PolymarketTagsResult = { success: true; tags: PolymarketTag[] } | { success: false; error: string };

export type PolymarketSentimentResult =
  | { success: true; sentiment: PolymarketSentiment }
  | { success: false; error: string };

export type TransactionDetailResult =
  | { success: true; transaction: TransactionDetail }
  | { success: false; error: string };

export type MultiChainTxSearchResult =
  | { success: true; transaction: TransactionDetail; chain: EtherscanChain }
  | { success: false; error: string; triedChains: EtherscanChain[] };

// Gas estimate data
export interface GasEstimate {
  chain: EtherscanChain;
  safeGasPrice: number; // in gwei
  proposeGasPrice: number; // standard gas price in gwei
  fastGasPrice: number; // in gwei
  suggestBaseFee?: number; // in gwei (EIP-1559 chains)
  gasUsedRatio?: string; // comma-separated ratios
}

export type GasEstimateResult = { success: true; gas: GasEstimate } | { success: false; error: string };

// Token search result
export interface TokenSearchItem {
  id: string;
  symbol: string;
  name: string;
  marketCapRank?: number;
  thumb?: string; // thumbnail image
  large?: string; // large image
}

export type TokenSearchResult = { success: true; tokens: TokenSearchItem[] } | { success: false; error: string };

// Client options
export interface OnchainClientOptions {
  debankApiKey?: string;
  heliusApiKey?: string;
  // Coinbase CDP API (JWT-based auth with ECDSA)
  coinbaseApiKeyId?: string; // format: organizations/{org_id}/apiKeys/{key_id}
  coinbaseApiKeySecret?: string; // EC private key in PEM format
  binanceApiKey?: string;
  binanceApiSecret?: string;
  coingeckoApiKey?: string;
  coinmarketcapApiKey?: string;
  // Block explorer APIs
  etherscanApiKey?: string; // Works on most Etherscan-compatible explorers
  solscanApiKey?: string;
  // WalletConnect
  walletConnectProjectId?: string;
  timeoutMs?: number;
}
