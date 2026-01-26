# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
pnpm run build          # Build TypeScript and compile binary
pnpm run dev            # Run CLI directly with tsx (no build needed)
pnpm run lint           # Run biome + oxlint
pnpm run lint:fix       # Auto-fix lint issues
pnpm run test           # Run vitest tests
pnpm run test:watch     # Run tests in watch mode
```

To test the CLI during development:
```bash
pnpm run dev price btc              # Run any command
./onchain test                      # After building, test the binary
```

## Architecture

### Mixin-Based Client Composition

The core `OnchainClient` is composed using TypeScript mixins, each adding methods for a specific API provider:

```
OnchainClientBase (base class with shared utilities)
    ↓
withCoinGecko → withCoinMarketCap → withDeBank → withHelius → withCoinbase → withBinance → withPolymarket → withEtherscan → withSolscan
    ↓
OnchainClient (final composed class)
```

Each mixin in `src/lib/mixins/` exports:
- A methods interface (e.g., `CoinGeckoMethods`)
- A `withX(Base)` function that returns a class extending Base with those methods

### CLI Context Pattern

Commands receive a `CliContext` (from `src/cli/shared.ts`) which provides:
- `colors` - Terminal color helpers (respect `--plain`/`--no-color`)
- `p(kind)` - Status prefixes (ok/warn/err/info/hint)
- `getOutput()` - Current output config (json, plain, color, emoji)
- `resolveCredentials()` - Merged config + env credentials
- `getClientOptions()` - Ready-to-use options for `OnchainClient`
- `outputJson(data)` - JSON output helper

### Command Registration

Each command file in `src/commands/` exports a `registerXCommand(program, ctx)` function. Commands are registered in `src/cli/program.ts`.

### Result Types

All client methods return tagged union results for error handling:
```typescript
type BalanceResult =
  | { success: true; balances: TokenBalance[]; totalValueUsd: number }
  | { success: false; error: string };
```

## Code Style Rules

- **Import extensions**: Always use `.js` extensions for local imports (enforced by biome)
- **No forEach**: Use `for...of` loops instead (biome: `noForEach`)
- **Top-level regex**: Define regex patterns at module level for performance (biome: `useTopLevelRegex`)
- **No explicit any**: Use proper types or `unknown` (biome: `noExplicitAny`)
- **Block statements**: Always use braces for if/else/for (biome: `useBlockStatements`)
- **Line width**: 120 characters max
- **Quotes**: Single quotes, semicolons required

## Browser Fallback

When DeBank/Helius API keys aren't configured, the CLI can fall back to browser scraping via `agent-browser`:
- Uses unique session names (`--session onchain-<random>`) to avoid session conflicts
- Extraction scripts return objects directly (not JSON.stringify) for proper parsing
- Located in `src/lib/browser-scraper.ts`

## Configuration

Config files: `~/.config/onchain/config.json5` (global) or `./.onchainrc.json5` (local)

Environment variables (override config): `DEBANK_API_KEY`, `HELIUS_API_KEY`, `COINBASE_API_KEY_ID`, `COINBASE_API_KEY_SECRET`, `BINANCE_API_KEY`, `BINANCE_API_SECRET`, `COINGECKO_API_KEY`, `COINMARKETCAP_API_KEY`, `ETHERSCAN_API_KEY`, `SOLSCAN_API_KEY`

## Checklist for New Features

When adding new commands or capabilities:

1. **Update SKILL.md** - Add the new command to the appropriate section with usage examples
2. **Update setup wizard** - If the feature requires API keys, add prompts to `src/commands/setup-wizard.ts`
3. **Update credentials** - Add new API keys to `src/lib/credentials.ts` and `src/lib/config.ts`
4. **Update this file** - Update the mixin chain diagram and environment variables list
