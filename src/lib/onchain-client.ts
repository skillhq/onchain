import { type BinanceMethods, withBinance } from './mixins/binance.js';
import { type CoinbaseMethods, withCoinbase } from './mixins/coinbase.js';
import { type CoinGeckoMethods, withCoinGecko } from './mixins/coingecko.js';
import { type CoinMarketCapMethods, withCoinMarketCap } from './mixins/coinmarketcap.js';
import { type DeBankMethods, withDeBank } from './mixins/debank.js';
import { type HeliusMethods, withHelius } from './mixins/helius.js';
import { type PolymarketMethods, withPolymarket } from './mixins/polymarket.js';
import type { AbstractConstructor } from './onchain-client-base.js';
import { OnchainClientBase } from './onchain-client-base.js';

type OnchainClientInstance = OnchainClientBase &
  CoinGeckoMethods &
  CoinMarketCapMethods &
  DeBankMethods &
  HeliusMethods &
  CoinbaseMethods &
  BinanceMethods &
  PolymarketMethods;

// Compose all mixins
const MixedOnchainClient = withPolymarket(
  withBinance(withCoinbase(withHelius(withDeBank(withCoinMarketCap(withCoinGecko(OnchainClientBase)))))),
) as AbstractConstructor<OnchainClientInstance>;

export class OnchainClient extends MixedOnchainClient {}

// Re-export types for convenience
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
} from './onchain-client-types.js';
