import * as readline from 'node:readline';
import type { OnchainConfig } from '../lib/config.js';

function createPrompt(): {
  question: (prompt: string) => Promise<string>;
  close: () => void;
} {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return {
    question: (prompt: string) =>
      new Promise((resolve) => {
        rl.question(prompt, resolve);
      }),
    close: () => rl.close(),
  };
}

export async function runSetupWizard(
  existingConfig: OnchainConfig,
  colors: {
    section: (s: string) => string;
    accent: (s: string) => string;
    muted: (s: string) => string;
  },
): Promise<Partial<OnchainConfig>> {
  const prompt = createPrompt();
  const config: Partial<OnchainConfig> = {};

  console.log();
  console.log(colors.section('Onchain CLI Setup'));
  console.log(colors.muted('Press Enter to skip any field and keep the existing value.'));
  console.log();

  try {
    console.log(colors.accent('API Keys'));
    console.log(colors.muted('These can also be set via environment variables.'));
    console.log();

    // DeBank API Key
    const debankKey = await prompt.question(`DeBank API Key${existingConfig.debankApiKey ? ' (configured)' : ''}: `);
    if (debankKey) {
      config.debankApiKey = debankKey;
    }

    // Helius API Key
    const heliusKey = await prompt.question(`Helius API Key${existingConfig.heliusApiKey ? ' (configured)' : ''}: `);
    if (heliusKey) {
      config.heliusApiKey = heliusKey;
    }

    // Coinbase CDP API (JWT-based auth with ECDSA)
    console.log();
    console.log(colors.muted('Coinbase CDP API (create keys at https://portal.cdp.coinbase.com/):'));
    console.log(colors.muted('  IMPORTANT: Select ECDSA as signature algorithm (NOT Ed25519)'));
    console.log(colors.muted('  API Key ID format: organizations/{org_id}/apiKeys/{key_id}'));
    const coinbaseApiKeyId = await prompt.question(
      `  Coinbase API Key ID${existingConfig.coinbaseApiKeyId ? ' (configured)' : ''}: `,
    );
    if (coinbaseApiKeyId) {
      config.coinbaseApiKeyId = coinbaseApiKeyId;
    }

    console.log(colors.muted('  Secret: paste the EC private key PEM (multiline, end with empty line)'));
    console.log(colors.muted('  Or set COINBASE_API_KEY_SECRET env var with the PEM content'));
    const existingSecret = existingConfig.coinbaseApiKeySecret;
    const secretPrompt = `  Coinbase API Key Secret${existingSecret ? ' (configured, press Enter to keep)' : ''}: `;
    let coinbaseApiKeySecret = await prompt.question(secretPrompt);

    // Handle multiline PEM input
    if (coinbaseApiKeySecret.startsWith('-----BEGIN')) {
      const lines = [coinbaseApiKeySecret];
      while (true) {
        const line = await prompt.question('');
        if (!line) {
          break;
        }
        lines.push(line);
        if (line.includes('-----END')) {
          break;
        }
      }
      coinbaseApiKeySecret = lines.join('\n');
    }

    if (coinbaseApiKeySecret) {
      config.coinbaseApiKeySecret = coinbaseApiKeySecret;
    }

    // Binance
    console.log();
    console.log(colors.muted('Binance (read-only API keys):'));
    const binanceKey = await prompt.question(
      `  Binance API Key${existingConfig.binanceApiKey ? ' (configured)' : ''}: `,
    );
    if (binanceKey) {
      config.binanceApiKey = binanceKey;
    }

    const binanceSecret = await prompt.question(
      `  Binance API Secret${existingConfig.binanceApiSecret ? ' (configured)' : ''}: `,
    );
    if (binanceSecret) {
      config.binanceApiSecret = binanceSecret;
    }

    // CoinGecko (optional)
    console.log();
    const coingeckoKey = await prompt.question(
      `CoinGecko Pro API Key (optional)${existingConfig.coingeckoApiKey ? ' (configured)' : ''}: `,
    );
    if (coingeckoKey) {
      config.coingeckoApiKey = coingeckoKey;
    }

    // CoinMarketCap (optional fallback)
    const cmcKey = await prompt.question(
      `CoinMarketCap API Key (optional fallback)${existingConfig.coinmarketcapApiKey ? ' (configured)' : ''}: `,
    );
    if (cmcKey) {
      config.coinmarketcapApiKey = cmcKey;
    }

    // Block Explorer APIs
    console.log();
    console.log(colors.accent('Block Explorer APIs'));
    console.log(colors.muted('For transaction lookup (onchain tx <hash>)'));
    console.log();

    // Etherscan (works on multiple EVM chains)
    const etherscanKey = await prompt.question(
      `Etherscan API Key${existingConfig.etherscanApiKey ? ' (configured)' : ''}: `,
    );
    if (etherscanKey) {
      config.etherscanApiKey = etherscanKey;
    }

    // Solscan (Solana)
    const solscanKey = await prompt.question(`Solscan API Key${existingConfig.solscanApiKey ? ' (configured)' : ''}: `);
    if (solscanKey) {
      config.solscanApiKey = solscanKey;
    }

    // WalletConnect
    console.log();
    console.log(colors.accent('WalletConnect'));
    console.log(colors.muted('For wallet connectivity (send transactions via mobile wallets)'));
    console.log(colors.muted('Get a free Project ID at https://dashboard.walletconnect.com/'));
    console.log();

    const walletConnectProjectId = await prompt.question(
      `WalletConnect Project ID${existingConfig.walletConnectProjectId ? ' (configured)' : ''}: `,
    );
    if (walletConnectProjectId) {
      config.walletConnectProjectId = walletConnectProjectId;
    }

    // Polymarket Preferences
    console.log();
    console.log(colors.accent('Polymarket Preferences'));
    console.log(colors.muted('Configure tag filters for polymarket trending/search commands.'));
    console.log(colors.muted('Run `onchain polymarket tags --popular` to see available tags.'));
    console.log();

    const existingExcludes = existingConfig.polymarket?.excludeTags?.join(', ') || '';
    const excludePrompt = existingExcludes
      ? `Exclude tags (comma-separated, currently: ${existingExcludes}): `
      : 'Exclude tags (comma-separated, e.g., sports,nfl,nba): ';
    const excludeInput = await prompt.question(excludePrompt);

    if (excludeInput) {
      const excludeTags = excludeInput
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
      if (excludeTags.length > 0) {
        config.polymarket = { ...config.polymarket, excludeTags };
      }
    }

    const existingIncludes = existingConfig.polymarket?.includeTags?.join(', ') || '';
    const includePrompt = existingIncludes
      ? `Include only tags (comma-separated, currently: ${existingIncludes}): `
      : 'Include only tags (comma-separated, leave empty for all): ';
    const includeInput = await prompt.question(includePrompt);

    if (includeInput) {
      const includeTags = includeInput
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
      if (includeTags.length > 0) {
        config.polymarket = { ...config.polymarket, includeTags };
      }
    }

    console.log();
    return config;
  } finally {
    prompt.close();
  }
}
