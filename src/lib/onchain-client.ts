import { type BinanceMethods, withBinance } from './mixins/binance.js';
import { type CoinbaseMethods, withCoinbase } from './mixins/coinbase.js';
import { type CoinGeckoMethods, withCoinGecko } from './mixins/coingecko.js';
import { type CoinMarketCapMethods, withCoinMarketCap } from './mixins/coinmarketcap.js';
import { type DeBankMethods, withDeBank } from './mixins/debank.js';
import { type EtherscanMethods, withEtherscan } from './mixins/etherscan.js';
import { type HeliusMethods, withHelius } from './mixins/helius.js';
import { type NansenMethods, withNansen } from './mixins/nansen.js';
import { type PolymarketMethods, withPolymarket } from './mixins/polymarket.js';
import { type SolscanMethods, withSolscan } from './mixins/solscan.js';
import { type WalletConnectMethods, withWalletConnect } from './mixins/walletconnect.js';
import { withZerion, type ZerionMethods } from './mixins/zerion.js';
import type { AbstractConstructor } from './onchain-client-base.js';
import { OnchainClientBase } from './onchain-client-base.js';

type OnchainClientInstance = OnchainClientBase &
  CoinGeckoMethods &
  CoinMarketCapMethods &
  DeBankMethods &
  HeliusMethods &
  CoinbaseMethods &
  BinanceMethods &
  PolymarketMethods &
  EtherscanMethods &
  SolscanMethods &
  WalletConnectMethods &
  ZerionMethods &
  NansenMethods;

// Compose all mixins
const MixedOnchainClient = withNansen(
  withZerion(
    withWalletConnect(
      withSolscan(
        withEtherscan(
          withPolymarket(
            withBinance(withCoinbase(withHelius(withDeBank(withCoinMarketCap(withCoinGecko(OnchainClientBase)))))),
          ),
        ),
      ),
    ),
  ),
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
  EtherscanChain,
  EvmChain,
  HistoryResult,
  InternalTransaction,
  MarketOverview,
  MarketResult,
  MultiChainTxSearchResult,
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
  TokenTransfer,
  Transaction,
  TransactionDetail,
  TransactionDetailResult,
} from './onchain-client-types.js';
