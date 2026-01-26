// Library exports for programmatic use
export { OnchainClient } from './lib/onchain-client.js';
export type {
  BalanceResult,
  CexBalance,
  CexBalanceResult,
  CexHistoryResult,
  CexTrade,
  ChainType,
  DefiPosition,
  DefiResult,
  EvmChain,
  HistoryResult,
  MarketOverview,
  MarketResult,
  NftAsset,
  NftResult,
  OnchainClientOptions,
  PolymarketDetailResult,
  PolymarketMarket,
  PolymarketResult,
  PriceResult,
  PricesResult,
  SupportedChain,
  TokenBalance,
  TokenPrice,
  Transaction,
} from './lib/onchain-client-types.js';

// Utility exports
export { detectChainType, isEvmAddress, isSolanaAddress, truncateAddress } from './lib/utils/address.js';
export {
  formatChainName,
  formatCompactNumber,
  formatCompactUsd,
  formatPercent,
  formatRelativeTime,
  formatTimestamp,
  formatTokenAmount,
  formatUsd,
} from './lib/utils/formatters.js';
