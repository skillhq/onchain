# Contributing to @cyberdrk/onchain

## Development Setup

```bash
git clone https://github.com/cyberdrk305/onchain.git
cd onchain
pnpm install
```

## Development Workflow

```bash
# Run CLI without building
pnpm run dev <command>

# Build TypeScript
pnpm run build:dist

# Build standalone binary
pnpm run build:binary

# Run tests
pnpm run test
pnpm run test:watch

# Lint
pnpm run lint
pnpm run lint:fix
```

## Project Structure

```
src/
├── cli.ts                    # Entry point
├── cli/
│   ├── program.ts            # Command registration
│   ├── shared.ts             # CliContext and utilities
│   └── setup-wizard.ts       # Interactive setup
├── commands/                 # CLI commands
│   ├── balance.ts
│   ├── price.ts
│   └── ...
└── lib/
    ├── onchain-client.ts     # Composed client
    ├── onchain-client-base.ts
    ├── mixins/               # API provider mixins
    │   ├── coingecko.ts
    │   ├── debank.ts
    │   └── ...
    ├── config.ts
    ├── credentials.ts
    └── output.ts
```

## Architecture

### Mixin Pattern

API providers are implemented as mixins that compose onto `OnchainClientBase`:

```typescript
// Each mixin adds methods to the client
export function withCoinGecko<TBase extends AbstractConstructor<OnchainClientBase>>(
  Base: TBase
): Mixin<TBase, CoinGeckoMethods> {
  abstract class CoinGeckoMixin extends Base implements CoinGeckoMethods {
    async getTokenPrice(tokenId: string): Promise<PriceResult> {
      // Implementation
    }
  }
  return CoinGeckoMixin;
}
```

### Result Types

All client methods return tagged unions for explicit error handling:

```typescript
type PriceResult =
  | { success: true; token: TokenPrice }
  | { success: false; error: string };
```

### Adding a New Command

1. Create `src/commands/mycommand.ts`:
```typescript
export function registerMyCommand(program: Command, ctx: CliContext): void {
  program
    .command('mycommand')
    .description('Does something')
    .action(async () => {
      const client = new OnchainClient(ctx.getClientOptions());
      // Implementation
    });
}
```

2. Register in `src/cli/program.ts`:
```typescript
import { registerMyCommand } from '../commands/mycommand.js';
// ...
registerMyCommand(program, ctx);
```

### Adding a New API Provider

1. Create `src/lib/mixins/myprovider.ts` following the mixin pattern
2. Add to composition in `src/lib/onchain-client.ts`
3. Add credentials to `OnchainClientBase` and config types

## Code Style

- Use `.js` extensions for local imports
- Use `for...of` instead of `.forEach()`
- Define regex patterns at module level
- Use proper types (no `any`)
- Always use block statements for if/else/for
- Single quotes, semicolons required
- 120 character line width

Run `pnpm run lint` to check and `pnpm run lint:fix` to auto-fix.

## Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Run `pnpm run lint && pnpm run test`
5. Commit with a descriptive message
6. Push and open a PR

## Releases

Releases are automated via GitHub Actions when a version tag is pushed:

```bash
# Update version in package.json, then:
git tag v0.2.0
git push origin v0.2.0
```

This triggers npm publish automatically.
