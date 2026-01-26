import type { OnchainConfig } from './config.js';

export interface ResolvedCredentials {
  debankApiKey?: string;
  heliusApiKey?: string;
  // Coinbase CDP API (JWT-based auth with ECDSA)
  coinbaseApiKeyId?: string;
  coinbaseApiKeySecret?: string;
  binanceApiKey?: string;
  binanceApiSecret?: string;
  coingeckoApiKey?: string;
  coinmarketcapApiKey?: string;
  // Block explorer APIs
  etherscanApiKey?: string;
  solscanApiKey?: string;
  warnings: string[];
}

export function resolveCredentials(config: OnchainConfig, env: NodeJS.ProcessEnv = process.env): ResolvedCredentials {
  const warnings: string[] = [];

  // Resolve each credential from env first, then config
  const debankApiKey = env.DEBANK_API_KEY ?? config.debankApiKey;
  const heliusApiKey = env.HELIUS_API_KEY ?? config.heliusApiKey;
  // Coinbase CDP API credentials
  const coinbaseApiKeyId = env.COINBASE_API_KEY_ID ?? config.coinbaseApiKeyId;
  const coinbaseApiKeySecret = env.COINBASE_API_KEY_SECRET ?? config.coinbaseApiKeySecret;
  const binanceApiKey = env.BINANCE_API_KEY ?? config.binanceApiKey;
  const binanceApiSecret = env.BINANCE_API_SECRET ?? config.binanceApiSecret;
  const coingeckoApiKey = env.COINGECKO_API_KEY ?? config.coingeckoApiKey;
  const coinmarketcapApiKey = env.COINMARKETCAP_API_KEY ?? config.coinmarketcapApiKey;
  const etherscanApiKey = env.ETHERSCAN_API_KEY ?? config.etherscanApiKey;
  const solscanApiKey = env.SOLSCAN_API_KEY ?? config.solscanApiKey;

  return {
    debankApiKey,
    heliusApiKey,
    coinbaseApiKeyId,
    coinbaseApiKeySecret,
    binanceApiKey,
    binanceApiSecret,
    coingeckoApiKey,
    coinmarketcapApiKey,
    etherscanApiKey,
    solscanApiKey,
    warnings,
  };
}

export function validateCredentials(creds: ResolvedCredentials): {
  hasDebank: boolean;
  hasHelius: boolean;
  hasCoinbase: boolean;
  hasBinance: boolean;
  hasCoinGecko: boolean;
  hasCoinMarketCap: boolean;
  hasEtherscan: boolean;
  hasSolscan: boolean;
} {
  return {
    hasDebank: Boolean(creds.debankApiKey),
    hasHelius: Boolean(creds.heliusApiKey),
    hasCoinbase: Boolean(creds.coinbaseApiKeyId && creds.coinbaseApiKeySecret),
    hasBinance: Boolean(creds.binanceApiKey && creds.binanceApiSecret),
    hasCoinGecko: Boolean(creds.coingeckoApiKey), // Optional, free tier exists
    hasCoinMarketCap: Boolean(creds.coinmarketcapApiKey),
    hasEtherscan: Boolean(creds.etherscanApiKey),
    hasSolscan: Boolean(creds.solscanApiKey),
  };
}

export function getMissingCredentialsMessage(feature: string, requiredCreds: string[]): string {
  const envVars = requiredCreds.map((c) => {
    const envMap: Record<string, string> = {
      debank: 'DEBANK_API_KEY',
      helius: 'HELIUS_API_KEY',
      coinbase: 'COINBASE_API_KEY_ID and COINBASE_API_KEY_SECRET',
      binance: 'BINANCE_API_KEY and BINANCE_API_SECRET',
      coingecko: 'COINGECKO_API_KEY',
      coinmarketcap: 'COINMARKETCAP_API_KEY',
      etherscan: 'ETHERSCAN_API_KEY',
      solscan: 'SOLSCAN_API_KEY',
    };
    return envMap[c] ?? c;
  });

  return `${feature} requires: ${envVars.join(', ')}. Run \`onchain setup\` or set environment variables.`;
}
