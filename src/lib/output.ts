export type OutputConfig = {
  plain: boolean;
  emoji: boolean;
  color: boolean;
  hyperlinks: boolean;
  json: boolean;
};

export type StatusKind = 'ok' | 'warn' | 'err' | 'info' | 'hint';
export type LabelKind =
  | 'url'
  | 'date'
  | 'wallet'
  | 'chain'
  | 'token'
  | 'price'
  | 'value'
  | 'change'
  | 'balance'
  | 'position'
  | 'exchange';

const STATUS: Record<StatusKind, { emoji: string; text: string; plain: string }> = {
  ok: { emoji: '\u2705', text: 'OK:', plain: '[ok]' },
  warn: { emoji: '\u26a0\ufe0f', text: 'Warning:', plain: '[warn]' },
  err: { emoji: '\u274c', text: 'Error:', plain: '[err]' },
  info: { emoji: '\u2139\ufe0f', text: 'Info:', plain: '[info]' },
  hint: { emoji: '\u2139\ufe0f', text: 'Hint:', plain: '[hint]' },
};

const LABELS: Record<LabelKind, { emoji: string; text: string; plain: string }> = {
  url: { emoji: '\ud83d\udd17', text: 'URL:', plain: 'url:' },
  date: { emoji: '\ud83d\udcc5', text: 'Date:', plain: 'date:' },
  wallet: { emoji: '\ud83d\udc5b', text: 'Wallet:', plain: 'wallet:' },
  chain: { emoji: '\u26d3\ufe0f', text: 'Chain:', plain: 'chain:' },
  token: { emoji: '\ud83e\ude99', text: 'Token:', plain: 'token:' },
  price: { emoji: '\ud83d\udcb2', text: 'Price:', plain: 'price:' },
  value: { emoji: '\ud83d\udcb0', text: 'Value:', plain: 'value:' },
  change: { emoji: '\ud83d\udcc8', text: 'Change:', plain: 'change:' },
  balance: { emoji: '\ud83d\udcca', text: 'Balance:', plain: 'balance:' },
  position: { emoji: '\ud83c\udfaf', text: 'Position:', plain: 'position:' },
  exchange: { emoji: '\ud83c\udfdb\ufe0f', text: 'Exchange:', plain: 'exchange:' },
};

export function resolveOutputConfigFromArgv(argv: string[], env: NodeJS.ProcessEnv, isTty: boolean): OutputConfig {
  const hasNoColorEnv = Object.hasOwn(env, 'NO_COLOR') || env.TERM === 'dumb';
  const defaultColor = isTty && !hasNoColorEnv;

  const plain = argv.includes('--plain');
  const json = argv.includes('--json');
  const emoji = !plain && !json && !argv.includes('--no-emoji');
  const color = !plain && !json && !argv.includes('--no-color') && defaultColor;
  const hyperlinks = !plain && !json && isTty;

  return { plain, emoji, color, hyperlinks, json };
}

export function resolveOutputConfigFromCommander(
  opts: { plain?: boolean; emoji?: boolean; color?: boolean; json?: boolean },
  env: NodeJS.ProcessEnv,
  isTty: boolean,
): OutputConfig {
  const hasNoColorEnv = Object.hasOwn(env, 'NO_COLOR') || env.TERM === 'dumb';
  const defaultColor = isTty && !hasNoColorEnv;

  const plain = Boolean(opts.plain);
  const json = Boolean(opts.json);
  const emoji = !plain && !json && (opts.emoji ?? true);
  const color = !plain && !json && (opts.color ?? true) && defaultColor;
  const hyperlinks = !plain && !json && isTty;

  return { plain, emoji, color, hyperlinks, json };
}

export function statusPrefix(kind: StatusKind, cfg: OutputConfig): string {
  if (cfg.plain) {
    return `${STATUS[kind].plain} `;
  }
  if (cfg.emoji) {
    return `${STATUS[kind].emoji} `;
  }
  return `${STATUS[kind].text} `;
}

export function labelPrefix(kind: LabelKind, cfg: OutputConfig): string {
  if (cfg.plain) {
    return `${LABELS[kind].plain} `;
  }
  if (cfg.emoji) {
    return `${LABELS[kind].emoji} `;
  }
  return `${LABELS[kind].text} `;
}

/**
 * Wraps a URL in OSC 8 escape sequences to make it clickable in supported terminals.
 * Falls back to plain text when not in a TTY or when hyperlinks are disabled.
 */
export function hyperlink(url: string, text?: string, cfg?: OutputConfig): string {
  const displayText = text ?? url;
  if (!cfg?.hyperlinks) {
    return displayText;
  }
  const safeUrl = url.replaceAll('\x1b', '').replaceAll('\x07', '');
  const safeText = displayText.replaceAll('\x1b', '').replaceAll('\x07', '');
  return `\x1b]8;;${safeUrl}\x07${safeText}\x1b]8;;\x07`;
}

/**
 * Format blockchain explorer URL
 */
export function getExplorerUrl(chain: string, type: 'address' | 'tx', value: string): string {
  const explorers: Record<string, string> = {
    eth: 'https://etherscan.io',
    bsc: 'https://bscscan.com',
    polygon: 'https://polygonscan.com',
    arb: 'https://arbiscan.io',
    op: 'https://optimistic.etherscan.io',
    avax: 'https://snowtrace.io',
    base: 'https://basescan.org',
    zksync: 'https://era.zksync.network',
    linea: 'https://lineascan.build',
    scroll: 'https://scrollscan.com',
    blast: 'https://blastscan.io',
    solana: 'https://solscan.io',
  };

  const baseUrl = explorers[chain] ?? explorers.eth;
  const path = type === 'address' ? (chain === 'solana' ? 'account' : 'address') : 'tx';

  return `${baseUrl}/${path}/${value}`;
}
